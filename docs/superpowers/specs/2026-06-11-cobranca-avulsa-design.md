# Ferramenta de Cobrança Avulsa — Design (FASE 2a: Única)

**Data:** 2026-06-11
**Branch:** feat/saas-cobranca-fase2 (worktree `.worktrees/saas-cobranca-fase2`)
**Status:** Design aprovado pelo dono. **Faseado:** esta spec implementa a Fase 2a (cobrança ÚNICA). A recorrência é Fase 2b (seção "Futuro", spec/review próprios).

## Problema

O SaaS (Vis) não tem como o admin emitir uma cobrança avulsa a um cliente (taxa de implementação, serviço extra, mensalidade manual). O dono quer uma ferramenta no admin para criar cobranças, gerando boleto/PIX real no Asaas. Motivador: o teste de R$5 travou porque `ASAAS_API_KEY` só existe na Vercel (não no `.env` local) → a cobrança precisa nascer **dentro do app em prod**. Esta feature resolve o R$5 como caso particular.

**Decisão de faseamento (revisão de spec):** toda a complexidade de risco financeiro (cobrar 2x, cron novo, idempotência por mês) está na RECORRÊNCIA. A cobrança ÚNICA já resolve o objetivo e a ferramenta pontual sem cron novo nem risco de duplicação mensal. Logo: **Fase 2a = só única; Fase 2b = recorrente.**

## Decisões do dono (travadas)
1. Ferramenta genérica de cobrança (implementação / extra / mensalidade), valor e motivo livres.
2. Dois pontos de entrada, mesma lógica: ficha do cliente (`/admin/clientes/[id]`) E tela de faturas (`/admin/financeiro/faturas`).
3. Modo teste: a cobrança no Asaas é **sempre real**; o `testMode` controla apenas para quem vai o **email** (testEmail vs cliente). Sem dialog de confirmação extra.
4. Customer Asaas on-demand: cria via `ensureAsaasCustomer` no clique se faltar; erro claro se doc inválido.
5. (Fase 2b) Recorrência por dia fixo do mês (1-28), fim opcional (sem fim OU N vezes).

## Arquitetura (abordagem C — híbrido; Fase 2a usa só a metade "Invoice")

A cobrança reusa o pipeline de `Invoice` que JÁ está em produção (Fase 2): `ensureInvoiceCharge` (gera boleto/PIX no Asaas via `payments.create`, valor=`total/100`, idempotencyKey `invoice:${id}`) + `sendInvoiceCharge` (envia via `notifyCompany`, grava `invoiceSent`).

### Modelo de dados (migration aditiva, Fase 2a)

**`Invoice` — 2 campos novos:**
- `isManual Boolean @default(false)` — distingue cobrança avulsa das faturas de assinatura. **Usado também para EXCLUIR avulsas dos crons de lembrete (ver "Interação com crons").**
- `source String?` — origem/motivo documental (`"implementation" | "extra" | "manual_monthly"` ou livre).

(Fase 2b adicionará `recurringChargeRuleId` + model `RecurringChargeRule` — fora desta spec.)

A cobrança avulsa É uma Invoice ligada à **subscription ativa** da empresa (`subscriptionId` NOT NULL — não há relação Invoice→Company). Campos obrigatórios setados: `subtotal=total=amount`, `discount=0`, `periodStart=now`, `periodEnd=now+30d`, `number=nextSaasInvoiceNumber`, `status=PENDING`, `billingType=PIX`, `description`, `isManual=true`, `source`, `dueDate` (escolhido ou null).

### 🔴 Interação com crons existentes (correção C1 — obrigatória)

O cron `invoice-reminders` Parte B (`invoice-reminders.service.ts:92-106`, `INVOICE_DUE_SOON`) filtra hoje só `status PENDING` + `paymentConfirmedAt null` + `subscription ACTIVE` + `dueDate gt now lte now+3d`. **NÃO exclui `isManual`** → uma cobrança avulsa PENDING vencendo em ≤3d receberia um email `INVOICE_DUE_SOON` automático, ALÉM do `INVOICE_CREATED` já mandado na criação. Email fantasma para o cliente.
**Correção (escopo desta spec):** adicionar `isManual: false` ao `where` da Parte B do `invoice-reminders.service.ts`. Parte A (created) é segura (itera só `syncInvoicesForSubscription`, que não cria avulsas) — mas por robustez, documentar que avulsas não passam por ela. Adicionar teste regressão: "Parte B ignora Invoice isManual".

### Fluxo: criar cobrança única

`POST /api/admin/charges` (auth SUPER_ADMIN/ADMIN) body Zod:
`{ companyId: string, amount: int>0 (centavos), description: string(min 1), source?: string, dueDate?: ISO date }`

1. **Resolve a subscription UMA vez** (no service, e passa o id adiante — não re-resolver em cada função): `findFirst({ where:{ companyId, status:{ not:"CANCELED" } }, orderBy:{ createdAt:"desc" } })`. Se null → throw "Empresa sem subscription ativa" (não cobrar quem cancelou). **Este throw acontece ANTES de `ensureAsaasCustomer`** (que tem fallback p/ CANCELED — divergência intencional; o service decide o critério mais estrito).
2. `ensureAsaasCustomer(companyId)` — cria customer on-demand se faltar. Se doc inválido/ausente → erro traduzido p/ 400 "Cadastre o CNPJ/CPF da empresa antes de cobrar".
3. Cria a Invoice avulsa (`isManual=true`, campos acima). **`number = await nextSaasInvoiceNumber(prisma)`** (helper ATÔMICO via SaasCounter) — NUNCA `invoice.count()+1` da rota legada `faturas/create/route.ts` (tem race → colisão no `number @unique`).
4. `ensureInvoiceCharge(invoice.id)` → gera boleto/PIX real no Asaas (idempotencyKey `invoice:${id}` — único por Invoice, sem colisão).
5. `sendInvoiceCharge(invoice.id, adminId)` → envia email (respeita testMode via notifyCompany). **Propaga o `status` retornado** (SENT/SKIPPED/FAILED) — a UI mostra o resultado real, NÃO "enviado" cegamente (M8: testMode/masterEnabled off → SKIPPED silencioso é normal).
6. Retorna `{ invoiceId, asaasChargeCreated: boolean, emailStatus }`.

### UI (dois pontos de entrada, mesma lógica)

- **Componente compartilhado** `src/components/admin/nova-cobranca-button.tsx` (client) → botão "Nova cobrança" abre modal/form: valor (R$), descrição, vencimento (opcional), source (select simples: Implementação/Extra/Mensalidade/Outro). Submete `POST /api/admin/charges`. Mostra o resultado: cobrança criada + status do email (ex.: "Cobrança criada. Email enviado." / "Cobrança criada. Email não enviado (modo teste sem email / desligado)."). Aviso fixo no modal: "A cobrança é criada de verdade no Asaas. O modo teste afeta apenas o email."
- Montado em: ficha do cliente (`/admin/clientes/[id]`, header/seção faturas) e tela de faturas (`/admin/financeiro/faturas`, header — ao lado do "Sincronizar"). Há DOIS botões "Nova Cobrança" antigos apontando para a página legada `/faturas/nova` (form manual sem Asaas): `financeiro/faturas/page.tsx:106` E `financeiro/page.tsx:173`. **Trocar AMBOS** o `<Link>` por `<NovaCobrancaButton>` (senão fica um botão órfão no fluxo antigo enquanto o outro usa o novo). A página `/faturas/nova` fica intocada (acessível por URL direta, sem link de entrada) — não deletar por ora.
- A Invoice avulsa aparece naturalmente na listagem de faturas (badge com `source`). Os botões de estado de envio (ResendChargeButton, Fase anterior) já funcionam nela.

## Componentes (responsabilidades isoladas)

1. `src/services/manual-charge.service.ts` — `createManualCharge({ companyId, amount, description, source, dueDate, adminId }, deps?)`: resolve-sub → ensureAsaasCustomer → cria Invoice → ensureInvoiceCharge → sendInvoiceCharge → retorna `{ invoiceId, asaasChargeCreated, emailStatus }`. DI de prisma + das 3 fns (ensureAsaasCustomer/ensureInvoiceCharge/sendInvoiceCharge) p/ testes.
2. `src/app/api/admin/charges/route.ts` — POST (auth, Zod, chama service, traduz erros: 400 doc/sub inválida, 500 catch). Padrão das rotas admin existentes (getAdminSession, role check).
3. `src/components/admin/nova-cobranca-button.tsx` — botão+modal compartilhado (client). Padrão jsdom nos testes (sem jest-dom, `.toBeDefined()`).
4. Migration aditiva: +`Invoice.isManual`, +`Invoice.source`.
5. `src/services/invoice-reminders.service.ts` — adicionar `isManual:false` ao where da Parte B (correção C1).
6. Montagem do botão em `clientes/[id]/page.tsx` e `financeiro/faturas/page.tsx`.

## Error handling
- Doc inválido/ausente (ensureAsaasCustomer throw) → 400 "Cadastre o CNPJ/CPF da empresa antes de cobrar".
- Sub inexistente/cancelada → 400 "Empresa sem assinatura ativa para cobrar".
- Asaas falha ao gerar cobrança (ensureInvoiceCharge throw) → 500 logado; a Invoice pode ter ficado PENDING sem paymentUrl → o admin reenvia pelo botão existente (reusa ensureInvoiceCharge). Documentar.
- `amount` ≤ 0 ou `description` vazia → 400 (Zod).
- Email SKIPPED/FAILED não é erro da cobrança — a cobrança já existe; UI informa o status do email separadamente.

## Testing
- `manual-charge.service.test.ts`: (a) cria Invoice avulsa única com isManual=true + ensureAsaasCustomer/ensureInvoiceCharge/sendInvoiceCharge chamados na ordem; (b) sub CANCELED-only → throw antes de tocar Asaas; (c) ensureAsaasCustomer throw (doc inválido) → propaga; (d) emailStatus propagado (SENT e SKIPPED); (e) amount usado como total (R$5 → total=500).
- `charges/route.test.ts`: 401 sem auth; 403 role errado; 400 doc inválido (service throw); 400 Zod (amount 0); 200 cria (mock service) retorna invoiceId/emailStatus.
- `invoice-reminders.service.test.ts`: novo caso "Parte B ignora Invoice isManual=true" (regressão C1).
- `nova-cobranca-button.test.tsx`: render do form; submit chama a rota; mostra status do email; aviso de modo teste visível.

## Modo teste — nota explícita na UI
Cobrança no Asaas é SEMPRE real (mesmo testMode ON). `testMode` só desvia o email (confirmado em `saas-notification.service.ts:62-68`: troca `to` por `testEmail`, ou SKIP se testEmail ausente). UI deixa isso claro.

## Deploy (manual, igual às fases)
- Migration aditiva (`isManual`/`source`) via `prisma db execute --stdin` heredoc (RTK quebra --file) + registrar em `_prisma_migrations` (drift cockpit). Pré-check: colunas não existem.
- `vercel deploy --prod` do worktree (email commit `cheapmilhas@users.noreply.github.com`; `.env`+`.vercel` copiados). **Sem cron novo nesta fase** (evita o risco de limite HOBBY).

## Teste de R$5 como caso particular (objetivo original)
Após deploy: ficha do Atacadão (ou tela de faturas) → "Nova cobrança" → R$5, "Teste", única → o app (em prod, com a chave) cria o customer on-demand + gera o boleto/PIX de R$5 + manda email pro testEmail. Sem script local, sem chave no terminal.

---

## FASE 2b — Recorrência (FUTURO, fora desta spec)

Documentado para não se perder; terá spec + review próprios. Decisões já tomadas + correções da review a incorporar:
- Model `RecurringChargeRule { subscriptionId (+companyId denormalizado), description, amount, source, dayOfMonth(1-28), maxOccurrences?, occurrencesDone, status enum(ACTIVE|PAUSED|CANCELED) [não só boolean], nextRunAt, lastRunAt?, lastInvoiceId?, createdBy }`.
- `Invoice.recurringChargeRuleId String?` + **`@@unique([recurringChargeRuleId, periodMonthKey])`** (periodMonthKey tipo `"2026-07"`) — **anti-duplicação obrigatória**: 2 execuções do cron NÃO podem criar 2 Invoices/mês (o idempotencyKey do Asaas é por Invoice.id, NÃO protege contra 2 Invoices). Criar Invoice e em P2002 pular (padrão notifyCompany).
- Cálculo de `nextRunAt`: `Date.UTC(year, month+1, dayOfMonth)` (rollover de ano automático, fuso UTC) — nunca `setMonth`.
- Cron: **avaliar acoplar ao `invoice-reminders` existente** (mesma cadência diária) em vez de criar o 10º cron (risco de limite HOBBY — incidente prévio derrubou deploys). Se cron novo, horário livre (NÃO `0 11 * * *` = mark-delayed).
- UI de gestão de regras (pausar/reativar/cancelar) na ficha do cliente.

## Fora de escopo (YAGNI)
- Recorrência (Fase 2b).
- Subscription recorrente nativa do Asaas.
- Editar valor de regra (cancela+cria nova).
- Multi-moeda, parcelamento no cartão, desconto/juros na avulsa.
- Backfill em massa de customers (o on-demand cobre; script de backfill já existe).
