# Ferramenta de Cobrança Avulsa (Manual + Recorrente) — Design

**Data:** 2026-06-11
**Branch:** feat/saas-cobranca-fase2 (worktree `.worktrees/saas-cobranca-fase2`)
**Status:** Design aprovado pelo dono (direção + 6 decisões). Spec para review.

## Problema

Hoje o SaaS (Vis) só cobra via a mensalidade da assinatura (que nem está provisionada no Asaas ainda). Não há como o admin emitir uma cobrança **avulsa** a um cliente — taxa de implementação/setup, serviço extra pontual, ou mensalidade manual. O dono quer uma ferramenta genérica no admin para criar **qualquer** cobrança a um cliente, com valor e motivo livres, **única ou recorrente**, gerando boleto/PIX real no Asaas e mandando email.

Contexto que motivou: o teste de R$5 travou porque (a) `vercel env pull` falha de vários jeitos e (b) o `ASAAS_API_KEY` não está no `.env` local — só na Vercel. A solução é a cobrança nascer **dentro do app em prod** (que tem a chave), via uma rota admin, não por script local. Esta feature resolve o teste de R$5 como caso particular ("cobrança avulsa de R$5 no Atacadão") e entrega uma ferramenta de produto.

## Decisões do dono (travadas)
1. **Ferramenta genérica** de cobrança (implementação / extra / mensalidade manual), valor e motivo livres.
2. **Recorrência controlada pelo NOSSO sistema** (cron diário cria a próxima cobrança avulsa) — NÃO via subscription recorrente do Asaas. Dá controle total (pausar/editar/cancelar).
3. **Dois pontos de entrada com a mesma lógica:** ficha do cliente (`/admin/clientes/[id]`) E tela de faturas (`/admin/financeiro/faturas`) — "as mesmas informações que tem na ficha do cliente tem na tela de faturas".
4. **Modo teste:** a cobrança no Asaas é **sempre real** (é o ponto). O `testMode` controla apenas para quem vai o **email** (testEmail vs cliente real). Sem dialog de confirmação extra.
5. **Customer Asaas on-demand:** ao criar a cobrança, se a subscription não tem `asaasCustomerId`, cria automaticamente via `ensureAsaasCustomer` (já implementado) e segue. (Se o documento for inválido/ausente, erro claro.)
6. **Recorrência:** por **dia fixo do mês** (1-28). Fim **opcional**: sem fim (até pausar) OU N ocorrências (parcelamento).

## Arquitetura (abordagem C — híbrido)

A cobrança em si reusa o pipeline de `Invoice` que JÁ está em produção (Fase 2). A recorrência é um model novo pequeno e isolado.

### Modelo de dados

**`Invoice` (model existente — 2 campos novos, aditivos):**
- `isManual Boolean @default(false)` — distingue cobrança avulsa das faturas de assinatura.
- `source String?` — origem/motivo (`"implementation" | "extra" | "manual_monthly" | "recurring"` ou texto livre). Documental; não muda lógica de cobrança.
- A cobrança avulsa É uma Invoice ligada à **subscription ativa** da empresa (`subscriptionId` é NOT NULL no schema — não há relação direta Invoice→Company). Toda empresa-cliente tem subscription (mesmo TRIAL), então pendura nela. `total/subtotal` = valor livre (centavos), `description` = motivo, `dueDate` = escolhido. Reusa `ensureInvoiceCharge` (gera boleto/PIX no Asaas via `payments.create`, valor = `total/100`) e `sendInvoiceCharge` (envia + grava `invoiceSent`).

**`RecurringChargeRule` (model NOVO):**
```
id            String   @id @default(cuid())
subscriptionId String                          // FK Subscription (mesma da Invoice)
description   String                            // motivo, copiado p/ cada Invoice gerada
amount        Int                               // centavos
source        String   @default("recurring")
dayOfMonth    Int                               // 1-28 (evita 29/30/31)
maxOccurrences Int?                             // null = sem fim; N = para após N
occurrencesDone Int    @default(0)
active        Boolean  @default(true)
nextRunAt     DateTime                          // data da próxima emissão (00:00 UTC do dayOfMonth)
createdBy     String?                           // adminId
createdAt     DateTime @default(now())
updatedAt     DateTime @updatedAt
@@index([active, nextRunAt])
```

### Fluxo: criar cobrança (única OU recorrente)

`POST /api/admin/charges` (rota nova, auth SUPER_ADMIN/ADMIN) body:
`{ companyId, amount(centavos), description, source?, dueDate?, recurring?: { dayOfMonth, maxOccurrences? } }`

1. Resolve a subscription ativa da empresa (findFirst not CANCELED orderBy createdAt desc; throw se 0).
2. `ensureAsaasCustomer(companyId)` — cria customer on-demand se faltar (erro claro se doc inválido).
3. Cria a **1ª Invoice** avulsa: `isManual=true`, `source`, `total=subtotal=amount`, `description`, `dueDate`, `number = nextSaasInvoiceNumber`, `status=PENDING`, `billingType=PIX`.
4. `ensureInvoiceCharge(invoice.id)` → gera boleto/PIX real no Asaas (idempotencyKey `invoice:${id}`).
5. Se `recurring` → cria `RecurringChargeRule` com `occurrencesDone=1`, `nextRunAt` = próximo `dayOfMonth` no mês seguinte. (A 1ª cobrança conta como ocorrência 1.)
6. (Opcional, conforme `testMode`) `sendInvoiceCharge` para já mandar o email da 1ª; OU deixar o admin clicar "Enviar cobrança" depois. **Decisão:** criar já envia (chama sendInvoiceCharge) — o email respeita testMode. O botão "Reenviar" continua disponível.
7. Retorna `{ invoiceId, asaasChargeCreated, ruleId? }`.

### Fluxo: cron `charge-recurrences` (diário, novo — 10º cron)

`GET /api/cron/charge-recurrences` (auth CRON_SECRET, fail-closed):
1. Busca `RecurringChargeRule` `active=true` com `nextRunAt <= now`.
2. Para cada regra: **idempotência** — se já existe Invoice desta regra para o período atual (por `description` + `subscriptionId` + janela do mês, OU um campo `ruleId` na Invoice — ver abaixo), pula. Senão cria Invoice avulsa (mesma lógica do passo 3-4 acima) + `ensureInvoiceCharge` + `sendInvoiceCharge` (email respeita testMode).
3. `occurrencesDone++`; se `maxOccurrences != null && occurrencesDone >= maxOccurrences` → `active=false` (encerra). Senão avança `nextRunAt` para o próximo mês no mesmo `dayOfMonth`.
4. Fail-silent por regra (um erro não derruba o lote); loga.

**Rastreio regra→Invoice (idempotência robusta):** adicionar `recurringChargeRuleId String?` na Invoice (FK opcional para RecurringChargeRule) + `@@unique([recurringChargeRuleId, periodStart])` OU checagem por janela de mês. Decisão: campo `recurringChargeRuleId` + checar "existe Invoice desta regra com periodStart no mês corrente" antes de criar (evita unique complexo; idempotente por mês).

### UI (dois pontos de entrada, mesma lógica)

- **Componente compartilhado** `<NovaCobrancaButton companyId=... />` (client) → abre modal/form: valor, descrição, vencimento, toggle "recorrente" (→ dia do mês + "sem fim"/"N vezes"). Submete em `POST /api/admin/charges`.
- Montado em: ficha do cliente (`/admin/clientes/[id]`) e tela de faturas (`/admin/financeiro/faturas`, header — substitui/complementa o atual "Nova Cobrança" que hoje não fala com Asaas).
- A tela de faturas já lista Invoices (avulsas aparecem naturalmente, com `isManual`/`source` no badge). A ficha do cliente já lista as faturas do cliente.
- **Gestão de recorrências:** uma seção/aba simples listando as `RecurringChargeRule` da empresa (na ficha do cliente) com ação pausar/reativar (`active` toggle) e cancelar. Editar valor = fora do MVP (pode cancelar+criar nova).

## Componentes (responsabilidades isoladas)

1. `src/services/manual-charge.service.ts` — `createManualCharge({ companyId, amount, description, source, dueDate, recurring, adminId })`: orquestra resolve-sub → ensureAsaasCustomer → cria Invoice → ensureInvoiceCharge → (rule?) → sendInvoiceCharge. PURO/testável (DI de prisma/asaas/ensureFns).
2. `src/services/recurring-charge.service.ts` — `runRecurringCharges(deps?)`: motor do cron (busca regras due, cria Invoice idempotente por mês, avança/encerra). Reusa `createManualCharge` internamente (sem o `recurring` — só a Invoice).
3. `src/app/api/admin/charges/route.ts` — POST cria cobrança (auth, valida zod, chama service).
4. `src/app/api/admin/charges/rules/[id]/route.ts` — PATCH pausar/reativar, DELETE cancelar regra.
5. `src/app/api/cron/charge-recurrences/route.ts` — GET cron (CRON_SECRET) → runRecurringCharges.
6. `src/components/admin/nova-cobranca-button.tsx` — botão+modal compartilhado (client).
7. `src/components/admin/recurring-rules-list.tsx` — lista de regras + pausar/cancelar (na ficha do cliente).
8. Migration: +`Invoice.isManual`, +`Invoice.source`, +`Invoice.recurringChargeRuleId`, +model `RecurringChargeRule`. Aditiva.
9. vercel.json: 9→10 crons (+charge-recurrences, ex.: `0 11 * * *`).

## Error handling
- Doc inválido/ausente no ensureAsaasCustomer → 400 com mensagem clara ("Cadastre o CNPJ/CPF da empresa antes de cobrar").
- Asaas falha ao gerar cobrança → a Invoice fica PENDING sem paymentUrl; o admin pode reenviar (botão existente reusa ensureInvoiceCharge). Logar.
- Cron: fail-silent por regra; sumário de criados/encerrados/erros.
- `dayOfMonth` validado 1-28 (zod). `amount` > 0. `maxOccurrences` ≥ 1 se presente.

## Testing
- `manual-charge.service.test.ts`: cria Invoice avulsa (única) com ensureAsaasCustomer chamado; com recurring cria a rule (occurrencesDone=1, nextRunAt mês seguinte); doc inválido → throw; email respeita testMode (sendInvoiceCharge chamado).
- `recurring-charge.service.test.ts`: regra due → cria Invoice + avança nextRunAt; idempotente (já tem Invoice do mês → pula); maxOccurrences atingido → active=false; regra inativa não roda.
- Rotas: 401/403 sem auth; 400 doc inválido; 200 cria. Cron: 401 sem CRON_SECRET.
- Componentes: render do form, toggle recorrente mostra dia do mês.

## Modo teste — confirmação explícita
A cobrança no Asaas é SEMPRE real (mesmo com testMode ON). `testMode` só desvia o EMAIL (notifyCompany já faz isso). Documentar na UI: um aviso "Cobranças são criadas de verdade no Asaas. O modo teste afeta apenas o email."

## Fora de escopo (YAGNI)
- Subscription recorrente nativa do Asaas (decisão: nosso cron controla).
- Editar valor de uma regra existente (cancela+cria nova).
- Multi-moeda, parcelamento no cartão, desconto/juros na avulsa.
- Provisionar customer no cadastro self-service (continua Fase B separada).
- Backfill em massa de customers (o ensureAsaasCustomer on-demand cobre o que precisa; backfill script já existe se quiser).

## Teste de R$5 como caso particular
Após deploy: na ficha do Atacadão (ou tela de faturas), clicar "Nova cobrança" → R$5, descrição "Teste", única → o app (em prod, com a chave) cria o customer on-demand + gera o boleto/PIX de R$5 + manda email pro testEmail. Sem script local, sem chave no terminal. Resolve o objetivo original.
