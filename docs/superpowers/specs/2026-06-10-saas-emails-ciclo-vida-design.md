# Emails Automáticos do SaaS para Clientes (Óticas) — Design

**Data:** 2026-06-10
**Branch:** `feat/saas-emails`
**Status:** Design aprovado pelo dono (aguardando review da spec)

## Contexto

O SaaS (Vis — PDV para óticas) cobra mensalidade dos clientes (donos das óticas) via
Asaas. Hoje o sistema **detecta** quase todos os eventos do ciclo de vida da
assinatura (trial acabando, fatura vencida, pagamento confirmado, suspensão,
cancelamento) mas **não envia email** deles — só cria avisos in-app (via cron
dunning). O dono quer automatizar a comunicação por email para reduzir
inadimplência e churn.

**Infra que JÁ existe (reusar, não reinventar):**
- Fila de email transacional: `src/services/email-queue.service.ts` + `src/lib/emails/resend.ts` (Resend, domínio `send.vis.app.br` verificado) + cron `/api/cron/email-queue` (7h diário). Enfileira via `prisma.emailQueue.create({ to, subject, template, data })`.
- Templates: `src/lib/emails/templates.ts` (hoje só `"invite"`, render via `renderEmailTemplate` + Zod).
- Integração Asaas: `src/lib/asaas.ts` + webhook `src/app/api/webhooks/asaas/route.ts` (PAYMENT_CONFIRMED/RECEIVED, PAYMENT_OVERDUE, REFUNDED, CHARGEBACK, SUBSCRIPTION_DELETED). `Invoice` tem `boletoUrl`, `pdfUrl`, `paymentUrl`, `boletoBarcode`.
- Régua de inadimplência: `src/lib/dunning.ts` + cron `/api/cron/dunning` (8h). Marcos 3/7/14 dias, suspensão ≥14d, cancelamento ≥30d. JÁ cria `CompanyNotification` (in-app) em cada marco.
- Avisos in-app: `CompanyNotification` model + `src/services/company-notification.service.ts`.
- Trial: `Subscription.trialEndsAt` + `checkSubscription()` calcula `daysLeft` (já detecta "faltam X dias").
- Contato do cliente: `Company.billingEmail` / `Company.email` / email do User dono.

## Decisões do dono (travadas)

- **4 grupos de email:** cobrança/boleto, trial, status de assinatura, boas-vindas/onboarding.
- **Destinatário:** `Company.billingEmail` → fallback `Company.email` → fallback email do dono (User ADMIN mais antigo da empresa).
- **Canal:** email + aviso in-app (reusa `CompanyNotification`). WhatsApp do SaaS está FORA de escopo.
- **Régua de cobrança:** fatura gerada (com link) + lembrete 3 dias antes de vencer + atrasos 3/7/14 (reusa dunning).
- **Controle:** tela `/admin/configuracoes/emails` — liga/desliga por tipo + pré-visualizar + histórico. Só SUPER_ADMIN.
- **Tom/visual:** profissional e amigável, identidade Vis (azul #2E6BFF/ciano/navy, logo). Skill principal: `frontend-design`, adaptado para "modo email" (tabelas + CSS inline, base no `invite`).
- **Opt-out:** transacionais (1-9) sempre enviam; emails de dica/onboarding "marketing" ficam para Fase futura (com opt-out) — FORA do escopo inicial.
- **Sequência:** Fase 1 = templates + camada de envio + tela. Fase 2 (spec separada) = geração automática do boleto no Asaas + email de fatura com link real.
- **Modo seguro de estreia:** modo teste (emails vão só para um endereço do dono) ligável.

## Catálogo de emails (Fase 1)

Todos transacionais. Cada um tem um `eventType` único.

| # | eventType | Email | Quando dispara | Gatilho existente | Destinatário |
|---|---|---|---|---|---|
| 1 | `WELCOME` | Boas-vindas | Conta ativada (dono criou senha) | fluxo de ativação do invite | dono |
| 2 | `TRIAL_ENDING` | Trial acabando | Faltam 3 dias pro fim do teste | `checkSubscription` (daysLeft) | billing→email→dono |
| 3 | `TRIAL_EXPIRED` | Trial expirou | Teste acabou (TRIAL→TRIAL_EXPIRED) | transição de status | billing→email→dono |
| 4 | `INVOICE_CREATED` | Fatura gerada | Nova mensalidade (com boleto/PIX) | webhook Asaas / Invoice criada | billing |
| 5 | `INVOICE_DUE_SOON` | Lembrete de vencimento | 3 dias antes de vencer | NOVO (cron varre Invoice PENDING) | billing |
| 6 | `INVOICE_OVERDUE` | Fatura vencida | 3/7/14 dias de atraso | cron dunning | billing |
| 7 | `PAYMENT_CONFIRMED` | Pagamento confirmado | Pagou | webhook PAYMENT_CONFIRMED | billing |
| 8 | `SUBSCRIPTION_SUSPENDED` | Assinatura suspensa | 14 dias de atraso | cron dunning | billing→dono |
| 9 | `SUBSCRIPTION_CANCELED` | Assinatura cancelada | 30 dias de atraso | cron dunning | billing→dono |

> Nota item 4/5: na Fase 1 o email "fatura gerada" usa o link de pagamento que JÁ
> existir na `Invoice` (`paymentUrl`/`boletoUrl`). A GERAÇÃO automática do boleto no
> Asaas (quando ainda não existe link) é a Fase 2.

## Arquitetura

```
EVENTOS (já existem)          CÉREBRO (novo)                 MOTOR (já existe)
webhook Asaas ──────┐
cron dunning ───────┤──→ saas-notification.service ──→ email_queue → Resend (7h)
checkSubscription ──┤       - resolve destinatário
ativação ───────────┘       - checa flag (config) ─────→ CompanyNotification (in-app)
                            - enfileira email + in-app
                            - registra histórico
                                    │
                            SaasEmailLog (novo) ──→ Tela /admin/configuracoes/emails
```

### Componentes

1. **`SaasEmailConfig`** (model novo, singleton — mesmo padrão de `AutoSyncConfig`):
   flags liga/desliga por `eventType` + `testMode` (bool) + `testEmail` (string). Migration aditiva.

2. **`SaasEmailLog`** (model novo): registro de cada notificação disparada
   (`companyId`, `eventType`, `to`, `status` PENDING/SENT/SKIPPED/FAILED, `emailQueueId?`,
   `createdAt`). Fonte do histórico da tela + chave de idempotência.

3. **9 templates** em `src/lib/emails/templates.ts` (estender o `switch` de
   `renderEmailTemplate`): cada um com schema Zod próprio + HTML "modo email"
   (tabelas, CSS inline, identidade Vis). Base de compatibilidade: o template
   `invite` atual.

4. **`src/services/saas-notification.service.ts`** (novo) — o cérebro:
   `notifyCompany(companyId, eventType, payload, opts?)` que:
   - lê `SaasEmailConfig`; se `eventType` desligado → registra SKIPPED e retorna.
   - resolve destinatário: `billingEmail` → `email` → email do User dono (ADMIN mais antigo). Sem nenhum → SKIPPED (loga).
   - **idempotência:** chave `(companyId, eventType, periodKey)` — não enfileira 2x o mesmo evento no mesmo período (ex.: "vencida 7d" uma vez só). `periodKey` derivado do payload (ex.: invoiceId+stage).
   - se `testMode` → `to` vira `testEmail` (não vai pro cliente real).
   - enfileira o email (`emailQueue.create`) + cria `CompanyNotification` in-app.
   - grava `SaasEmailLog`.
   - **fail-silent:** erro não quebra o webhook/cron que chamou.

5. **Gatilhos (modificar pontos existentes — mudança cirúrgica):**
   - `webhook asaas` PAYMENT_CONFIRMED → `notifyCompany(.., "PAYMENT_CONFIRMED")`.
   - `cron dunning`: nos marcos 3/7/14 → `INVOICE_OVERDUE`; suspensão → `SUBSCRIPTION_SUSPENDED`; cancelamento → `SUBSCRIPTION_CANCELED`. (O dunning já controla os marcos e a idempotência via `lastDunningStage` — reusar.)
   - `checkSubscription` / cron: TRIAL_ENDING (3d) e TRIAL_EXPIRED na transição.
   - ativação do invite → `WELCOME`.
   - `INVOICE_CREATED` / `INVOICE_DUE_SOON`: um cron novo `/api/cron/invoice-reminders` (diário) que varre `Invoice` PENDING (vence em 3d → DUE_SOON; criada sem aviso → CREATED). Reusa o padrão de cron com `CRON_SECRET`.

6. **Tela `/admin/configuracoes/emails`** (server page + client, SUPER_ADMIN):
   - interruptor mestre + checkbox por `eventType`.
   - botão "Pré-visualizar" cada template (renderiza o HTML com dados de exemplo).
   - modo teste (toggle + campo de email).
   - histórico (últimos 50 do `SaasEmailLog`, com empresa, tipo, status).
   - item no menu admin (seção Configurações).
   - API `/api/admin/saas-emails/config` (GET/PATCH, SUPER_ADMIN) + auditoria.

### Segurança / cuidados embutidos

- **Anti-duplicata:** `SaasEmailLog` + chave de período impede reenvio do mesmo evento.
- **Reusa o dunning:** itens 6/8/9 penduram no cron que já roda e já é idempotente (não cria régua nova).
- **Fail-silent:** notificação nunca quebra o fluxo de negócio (webhook/cron). A fila já tem retry (3x).
- **Modo teste:** estreia mandando só pro dono; libera pros clientes depois.
- **Destinatário robusto:** 3 níveis de fallback; sem email → SKIPPED logado (não erro).

## Templates — diretrizes de design

- Skill: `frontend-design` para o visual, **adaptado para email** (NÃO usar flexbox/grid; usar `<table>`, CSS inline, largura máx ~600px). O `invite` atual é a referência de compatibilidade (Gmail/Outlook/Hotmail).
- Identidade Vis: azul `#2E6BFF`, logo no topo, footer com nome/endereço do SaaS.
- Cada email: 1 ação clara (botão). Cobrança → botão "Pagar agora" (link da Invoice). Trial → "Assinar agora". Boas-vindas → "Acessar o sistema".
- Texto curto, cordial, direto. pt-BR.

## Testes (rede anti-regressão)

- **`saas-notification.service`:** resolve destinatário (3 níveis de fallback); flag desligada → SKIPPED, não enfileira; idempotência (2ª chamada do mesmo evento/período não duplica); testMode → vai pro testEmail; sem email → SKIPPED; fail-silent (erro da fila não propaga).
- **Templates:** cada um renderiza com dados válidos; Zod rejeita dados inválidos; placeholders preenchidos.
- **Gatilhos:** cada ponto chama `notifyCompany` com o `eventType` correto (mock do service — sem enviar de verdade).
- **Tela/API:** GET/PATCH config só SUPER_ADMIN (403 para ADMIN/SUPPORT/BILLING).
- **Cron invoice-reminders:** 401 sem CRON_SECRET; varre PENDING corretamente; idempotente.
- Sempre: `tsc` + suíte + build verdes antes de cada commit.

## Ordem de entrega

- **Fase 1 (esta spec):** models + service + 9 templates + gatilhos + cron de lembrete + tela admin. Entregue com modo teste ligado.
- **Fase 2 (spec separada):** geração automática do boleto/PIX no Asaas quando a fatura nasce sem link, e o email `INVOICE_CREATED` com o link real. É a parte mais delicada (cobrança real) — isolada de propósito.

## Fora de escopo (YAGNI)

- WhatsApp do SaaS para o cliente (integração não existe).
- Emails de dica/onboarding "marketing" (com opt-out) — Fase futura.
- Geração do boleto Asaas (Fase 2).
- Preferências de canal por cliente.

## Notas de deploy / armadilhas conhecidas

- Conta Vercel é **HOBBY** → crons só DIÁRIOS (`0 X * * *`). O cron novo `invoice-reminders` usa um horário livre. Hoje há 8 crons; conferir limite do plano no deploy.
- Deploy é **MANUAL** via `vercel deploy --prod` (CLI). ⚠️ A Vercel bloqueia deploy se o email do commit não casar com conta Git — usar `cheapmilhas@users.noreply.github.com`.
- `build` NÃO roda migrate — `npm run migrate:deploy` manual pós-deploy (migrations `SaasEmailConfig` + `SaasEmailLog`, tabelas novas, seguras).
- `RESEND_API_KEY` + `EMAIL_FROM` já setados em prod (domínio `send.vis.app.br` verificado).
- Trabalhar em **worktree** se houver sessão paralela no mesmo clone.
