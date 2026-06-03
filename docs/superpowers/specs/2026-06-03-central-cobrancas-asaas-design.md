# Spec — Central de Cobranças Asaas no Painel Admin (SaaS)

**Data:** 2026-06-03
**Status:** design aprovado pelo dono (brainstorming). Faseado: F1 → F2 → F3.
**Escopo:** SaaS Admin — VOCÊ (dono) cobrando as óticas assinantes. Uma única conta Asaas (a sua). "Cliente" = ótica.

---

## Problema

Hoje a cobrança recorrente das óticas já é criada no Asaas no checkout (assinatura), mas:
1. **Cadastro manual de ótica** (no /admin, sem passar pelo checkout) NÃO cria nada no Asaas.
2. A **"Fatura #INV"** do painel é registro interno; "Gerar Cobrança" não cria cobrança real no Asaas e "Pagamento Confirmado" é marcado na mão.
3. Não há onde **ver as cobranças/pagamentos** das óticas dentro do sistema — só abrindo o painel do Asaas.

Objetivo: gerenciar tudo (gerar sem duplicidade + ver/agir) dentro do painel, sem abrir o banco.

## Decisões do dono (fixas)
- Nível: SaaS Admin cobrando óticas (conta Asaas única, a do dono).
- Espelho: **tabela local nova** alimentada por **webhook + cron de reconciliação** (não buscar ao vivo).
- Painel exibe: **lista de cobranças + status**, **links** (boleto/pix/fatura), **ações** (reenviar/estornar/cancelar). (Saldo da conta ficou FORA de escopo.)
- Anti-duplicidade é requisito central: ao gerar, checar existente e mostrar em vez de duplicar.
- Faseado, cada fase deployável. Design premium (/frontend-design + /ui-ux-pro-max).

## O que já existe (não refazer)
- `src/lib/asaas.ts`: customers.create/get/findByCpfCnpj; subscriptions.create/get/update/cancel; payments.get/pixQrCode; verifyWebhookToken.
- Webhook `src/app/api/webhooks/asaas/route.ts`: trata PAYMENT_CONFIRMED/RECEIVED/OVERDUE/REFUNDED/CHARGEBACK_*/SUBSCRIPTION_DELETED; HMAC fail-closed em prod; idempotência via `BillingEvent.externalEventId` único; resolve companyId via Subscription.asaasSubscriptionId ou externalReference `company:X`.
- Checkout `src/app/api/billing/checkout/route.ts`: cria customer + subscription no Asaas com advisory lock (`pg_advisory_xact_lock`) + idempotency-key `company:X:plan:Y` + re-check de ACTIVE (anti-duplicidade M14).
- `Subscription` (asaasCustomerId, asaasSubscriptionId, expectedAsaasValue/Cycle, billingSyncPending) e `Invoice` (asaasPaymentId, workflow flags).
- Cron `reconcile-billing` (vercel.json, `0 6 * * *`, fail-closed CRON_SECRET) + `billing-reconcile.service.ts`.

---

## Modelo de dados novo — `AsaasCharge` (espelho local)

```prisma
model AsaasCharge {
  id              String    @id @default(cuid())
  asaasPaymentId  String    @unique          // id do payment no Asaas (idempotência do espelho)
  companyId       String?                     // ótica (resolvido como no webhook)
  subscriptionId  String?                     // assinatura local vinculada (se houver)
  invoiceId       String?                     // Invoice #INV vinculada (F2)
  asaasSubscriptionId String?                 // subscription Asaas de origem (se recorrente)

  value           Int                         // centavos
  netValue        Int?                        // líquido (após taxa Asaas)
  status          String                      // PENDING/CONFIRMED/RECEIVED/OVERDUE/REFUNDED/...
  billingType     String                      // BOLETO/PIX/CREDIT_CARD
  description     String?
  dueDate         DateTime?
  paidAt          DateTime?

  invoiceUrl      String?                     // link da fatura Asaas
  bankSlipUrl     String?                     // boleto
  pixPayload      String?                     // copia-e-cola PIX
  pixQrCodeId     String?

  lastEventAt     DateTime?                   // último webhook que tocou
  syncedAt        DateTime?                   // última reconciliação por cron
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  company         Company?      @relation(fields: [companyId], references: [id])
  subscription    Subscription? @relation(fields: [subscriptionId], references: [id])

  @@index([companyId, status])
  @@index([status, dueDate])
  @@index([asaasSubscriptionId])
}
```
Migration aplicada MANUALMENTE em prod antes do deploy (padrão do projeto: build é só `next build`).

---

## FASE 1 — Espelho + Painel de leitura (entrega 80% do valor)

### 1.1 Client Asaas — novos métodos (`src/lib/asaas.ts`)
- `payments.list(filters: { customer?, subscription?, status?, offset?, limit? })` → GET /payments paginado. Retorna `AsaasPayment[]` + totalCount (paginação Asaas: offset/limit/hasMore).

### 1.2 Espelho via webhook (estender, não reescrever)
- No handler do webhook, após a lógica atual de Subscription/Invoice, fazer `upsert` em `AsaasCharge` por `asaasPaymentId` com os campos do `event.payment` (value, status, billingType, dueDate, links, paidAt). Idempotente.
- Adicionar tratamento do evento **`PAYMENT_CREATED`** (Asaas gera nova cobrança da assinatura) → cria a linha no espelho com status PENDING. Não altera Subscription/Invoice (só espelha).
- Resolução de companyId: reusar a função existente (Subscription.asaasSubscriptionId → externalReference). Charge pode ficar com companyId null se não resolver (igual BillingEvent) — cron corrige depois.

### 1.3 Cron de reconciliação (estender `billing-reconcile.service.ts` ou novo `asaas-charge-sync.service.ts`)
- Para cada Subscription com asaasSubscriptionId, `payments.list({ subscription })` → upsert no espelho. Cobre webhooks perdidos.
- **Backfill inicial:** a primeira execução popula o espelho com o histórico já existente no Asaas.
- Reusa o cron `reconcile-billing` (já agendado) OU novo endpoint `/api/cron/sync-asaas-charges` (fail-closed CRON_SECRET). Decisão na fase de plano; preferência: serviço separado chamado pelo mesmo cron p/ não inflar uma função só.

### 1.4 Painel `/admin/cobrancas` (premium)
- Rota admin (sob `getAdminSession()`), API `GET /api/admin/cobrancas` lê do espelho local (rápido).
- UI: tabela com filtro por ótica / status / período; colunas valor, vencimento, status (badge semântico), método, ótica. Linha expandível ou ações de **copiar link** (boleto/pix/fatura). Visão "por ótica" (agrupar) também.
- Design: /frontend-design + /ui-ux-pro-max, cores semânticas de status (pago=verde, pendente=âmbar, atrasado=vermelho, estornado=cinza), acessível, sem segredo no front.
- Helper puro testável: `formatChargeStatus()` / `chargeStatusMeta()` (label+cor+ícone) separado do componente.

### F1 — testes
- `payments.list` (parsing/paginação) com fetch mockado no padrão de asaas.test.ts.
- upsert idempotente do espelho (mesmo evento 2x = 1 linha).
- helper de status (todos os estados → label/cor corretos).
- Render smoke do painel (lista renderiza, filtro aplica).

---

## FASE 2 — Gerar cobrança sem duplicidade

### 2.1 Cadastro manual de ótica cria assinatura no Asaas
- No fluxo admin de criar ótica + assinar plano, chamar o MESMO caminho do checkout (extrair helper `ensureAsaasSubscription(companyId, planId, cycle, billingType)` reusado por checkout E admin), com a guarda anti-duplicidade já existente (idempotency-key `company:X`, advisory lock, re-check ACTIVE → se já ativa, retorna a existente, não cria outra).

### 2.2 Fatura #INV gera cobrança avulsa real
- Novo `asaas.payments.create({ customer, billingType, value, dueDate, description, externalReference })` (POST /payments) — cobrança avulsa (não recorrente).
- "Gerar Cobrança" da #INV: **antes de criar**, checar se já existe `AsaasCharge`/Invoice em aberto (PENDING/OVERDUE) para a mesma subscription/período → se existir, **retorna a existente** (mostra link) em vez de duplicar. Só cria nova se não houver.
- Vincula `Invoice.asaasPaymentId` + cria linha no espelho. "Pagamento Confirmado" passa a vir do **webhook** (PAYMENT_CONFIRMED/RECEIVED), não manual.

### F2 — testes
- ensureAsaasSubscription: idempotente (2ª chamada não cria 2ª assinatura).
- gerar #INV com cobrança em aberto → retorna existente (anti-duplicidade).
- gerar #INV sem cobrança → cria + vincula asaasPaymentId.

---

## FASE 3 — Ações no painel

- `asaas.payments.refund(id)` (POST /payments/{id}/refund) + `asaas.subscriptions.cancel` (já existe).
- Botões no painel: **Reenviar** (recupera invoiceUrl/boleto/pix e envia por WhatsApp/e-mail), **Estornar** (refund, confirmação obrigatória), **Cancelar assinatura** (confirmação obrigatória).
- Toda ação: `globalAudit` + atualização do espelho. Ações sensíveis exigem confirmação explícita do admin.

### F3 — testes
- refund chama endpoint certo + atualiza espelho para REFUNDED.
- cancelar assinatura → status CANCELED local + Asaas.
- guarda de confirmação (não executa sem confirmar).

---

## Riscos / segurança
- Webhook continua fail-closed (HMAC prod); upsert do espelho entra no handler já protegido. Idempotência dupla: BillingEvent.externalEventId + AsaasCharge.asaasPaymentId únicos.
- Anti-duplicidade: reuso do advisory lock + idempotency-key do checkout; na #INV, checagem de cobrança em aberto antes de criar.
- Rotas/painel sob getAdminSession() (super-admin). Estorno/cancelamento: confirmação + auditoria.
- Sem chave Asaas no front; dados sensíveis via API server-side.
- Migration manual em prod antes do deploy (padrão do projeto). Backfill via cron.

## Workflow por fase (preferência do dono)
TDD → tsc + vitest + build + code-reviewer (CRITICAL/HIGH corrigidos) → commit → merge --no-ff → dono dispara deploy → smoke → memória. Cada fase isolada e deployável. Confirmar push com `git ls-remote` (proxy mascara reject).

## Dívidas / fora de escopo
- Saldo/recebimentos da conta Asaas (visão de caixa) — fora de escopo (não pedido).
- Conciliação fina de taxas (netValue) — espelhado, mas sem relatório dedicado nesta spec.
- Multi-conta Asaas (ótica cobrando cliente final) — projeto separado, não é este escopo.
