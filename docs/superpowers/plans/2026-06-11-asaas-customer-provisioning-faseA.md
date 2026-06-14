# Provisionamento de Customer Asaas + Teste R$5 (Fase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair a criação de customer Asaas do checkout num service reutilizável (`ensureAsaasCustomer` + `resolveAsaasCustomerId`), fazer backfill controlado dos customers nas empresas existentes (sem cobrar ninguém), e gerar uma cobrança avulsa de **R$5** no Atacadão para validar o fluxo do botão "Enviar cobrança" ponta-a-ponta (Invoice→ensureInvoiceCharge→admin→email).

**Architecture:** A lógica de criar/achar customer hoje vive inline em `src/app/api/billing/checkout/route.ts:182-202`. Esta Fase A extrai isso num service puro e testável, reescreve o checkout para usá-lo (sem mudar comportamento), e adiciona scripts versionados (dry-run + allowlist) que criam os **customers** no Asaas de prod (NÃO cria subscription recorrente — isso é Fase B, com cobrança mensal real). A cobrança de R$5 reusa o `ensureInvoiceCharge` já existente, sobre uma **Invoice de teste com `total=500` hard-coded**.

**Tech Stack:** Next 16, Prisma/Neon, TypeScript, Vitest. Asaas PROD via `ASAAS_API_KEY` (já no ambiente). Cliente Asaas já tem `customers.findByCpfCnpj`/`customers.create` (`src/lib/asaas.ts:202-219`).

## Decisões do dono (travadas)
1. Provisionar customer + subscription recorrente em TODAS — MAS por segurança financeira, **Fase A = só customer** (não cobra); a subscription recorrente mensal (R$149,90/mês real) é **Fase B**, com confirmação explícita.
2. **Teste de R$5 no Atacadão** (CNPJ `20606235000139`, ACTIVE).
3. Backfill das existentes "sem criar botão"; provisionar no cadastro é Fase B.
4. Prioridade do dono: **o mais seguro e funcional, sem pressa.**

## Estado de prod verificado (2026-06-11)
Empresas ACTIVE/TRIAL e prontidão p/ Asaas (CPF=11díg, CNPJ=14díg):
- ✅ Óticas Atacadão dos Óculos — ACTIVE — CNPJ `20606235000139` — **alvo do teste R$5**
- ✅ Óticas Ultra — ACTIVE — CNPJ `34393682000161`
- ✅ Ótica Nathalia — TRIAL — CNPJ `40174511000144`
- ✅ Ótica Vitale — TRIAL — CPF `04390851365` (⚠️ conferir se `email` não é null antes do create)
- ✅ Óticas P.S Vision — TRIAL — CNPJ `44940771000134`
- ❌ OTICA TESTE 07/06 — TRIAL — sem documento + email inválido → **pular no backfill**

Nenhuma tem `asaasCustomerId`/`asaasSubscriptionId` hoje (todos null). Nenhuma fatura tem `paymentUrl`.

## Fatos do código que o plano assume (verificados)
- `Invoice` campos NOT NULL: `subscriptionId, number(@unique), subtotal Int, total Int, periodStart, periodEnd`. `discount` default 0. `dueDate` é nullable. `@@unique([subscriptionId, asaasPaymentId])`.
- `SubscriptionStatus` enum: `TRIAL, TRIAL_EXPIRED, ACTIVE, PAST_DUE, SUSPENDED, CANCELED`.
- Checkout seleciona a sub com `findFirst({ where:{ companyId, status:{ in:["ACTIVE","TRIAL"] } }, orderBy:{ createdAt:"desc" } })` (route.ts:98-101). O backfill/wrapper desta fase usa um critério **propositalmente mais amplo** — `status:{ not:"CANCELED" }` — para também achar a sub em `PAST_DUE/SUSPENDED/TRIAL_EXPIRED` (queremos provisionar customer mesmo nesses estados). **NÃO é cópia do checkout**; é decisão de design do backfill. Para o Atacadão (ACTIVE) ambos os critérios dão a mesma sub.
- `nextSaasInvoiceNumber(client = prisma)` é **auto-atômico** (SQL `INSERT…ON CONFLICT…RETURNING`) — NÃO precisa de `$transaction`; basta passar o client `prisma`.
- O cron `invoice-reminders` Parte B (`invoice-reminders.service.ts:94-106`) coleta faturas `PENDING` + `paymentConfirmedAt null` + sub `ACTIVE` + `dueDate gt now lte now+3d`. A fatura de teste é PENDING numa sub ACTIVE → **só não é coletada porque seu `dueDate` fica `null`** (filtro `gt now` falha). O cron NÃO filtra por `description`. `ensureInvoiceCharge` calcula `dueStr` só p/ o Asaas e **não grava `dueDate` de volta** na Invoice, então permanece null. Defensivo: após o teste OK, marcar a fatura de teste como `paymentConfirmed=true` (ou `status=CANCELED`) para removê-la de qualquer varredura futura. `dunning` (por `Subscription.status PAST_DUE/SUSPENDED`) e `billing-reconcile` (por `billingSyncPending`) não tocam a fatura numa sub ACTIVE — sem risco de cobrança/email duplicado.
- `ensureInvoiceCharge` (`invoice-charge.service.ts`): se `invoice.paymentUrl` existe → no-op; **senão, se `subscription.asaasSubscriptionId` existe → SINCRONIZA a sub** (valor vem do Asaas, NÃO os R$5); senão, se `asaasCustomerId` existe → cria avulsa com `value: invoice.total/100`; senão → throw. ⚠️ Por isso o Atacadão NÃO pode ter `asaasSubscriptionId` no teste (Fase A não cria, mas o runbook confirma).
- `customers.create` NÃO envia idempotencyKey (só `findByCpfCnpj` protege contra duplicata). `subscriptions.create`/`payments.create` enviam.
- `sendInvoiceCharge` → `notifyCompany` apenas ENFILEIRA o email; o envio real é o cron `/api/cron/email-queue` (`vercel.json:25` = `0 7 * * *`, **1x/dia**). O `paymentUrl`/PIX fica na fatura IMEDIATAMENTE; só o email é assíncrono.
- Já existe `scripts/criar-cobranca-teste.ts` (cria cobrança avulsa direta no Asaas por CPF, SEM passar por Invoice/admin). **NÃO USAR nesta fase** — ele não exercita o botão e criaria uma 2ª cobrança confusa. Ver Task 5.

## GUARDRAILS (subagentes)
- PROIBIDO git além de `git add <arquivos-da-task>` + `git commit`. NUNCA checkout/reset/branch/rebase/cherry-pick/stash/merge.
- PROIBIDO `prisma format`, `prisma migrate`, `prisma generate`, `prisma db ...`, qualquer `vercel ...`.
- Scripts de backfill/fatura: **dry-run por padrão**, allowlist, `--apply` exige `--only=<companyId>`. NUNCA importados por runtime/build/CI.
- **Quem executa contra prod é o ORQUESTRADOR (humano-supervisionado), nunca o subagente.**
- Cada task: TDD, commit isolado, conferir escopo com `git status --short`.

---

### Task 1: Service `asaas-customer.service.ts` (`resolveAsaasCustomerId` puro + `ensureAsaasCustomer` wrapper)

**Files:**
- Create: `src/services/asaas-customer.service.ts`
- Test: `src/services/asaas-customer.service.test.ts`

**Contratos:**
```ts
// PURO: recebe campos já resolvidos; find-or-create; sem banco. Usado pelo checkout E pelo wrapper.
resolveAsaasCustomerId(
  args: { name: string; email: string; cpfCnpjRaw: string; mobilePhone?: string; externalReference: string },
  deps?: { asaasClient? }
): Promise<{ asaasCustomerId: string; created: boolean }>
// - cpfCnpj = args.cpfCnpjRaw.replace(/\D/g, ""); se length ∉ {11,14} → throw new Error("CPF/CNPJ inválido ou ausente").
// - findByCpfCnpj(cpfCnpj) → se achar, { id, created:false }; senão create({name,email,cpfCnpj,mobilePhone,externalReference}) → { id, created:true }.

// WRAPPER: lê Company+Subscription do banco, monta args, chama resolveAsaasCustomerId, grava na sub.
ensureAsaasCustomer(
  companyId: string,
  deps?: { prismaClient?; asaasClient? }
): Promise<{ asaasCustomerId: string; created: boolean }>
// 1. Company (name,cnpj,email,phone). Sub = findFirst({ where:{ companyId, status:{ not:"CANCELED" } }, orderBy:{ createdAt:"desc" } });
//    se null → fallback findFirst({ where:{ companyId }, orderBy:{ createdAt:"desc" } }); se ainda null → throw new Error("Empresa sem subscription").
// 2. Se sub.asaasCustomerId já existe → { asaasCustomerId: sub.asaasCustomerId, created:false } (no-op, não chama Asaas).
// 3. resolveAsaasCustomerId({ name:company.name, email:company.email ?? "", cpfCnpjRaw:company.cnpj ?? "", mobilePhone:company.phone ?? undefined, externalReference:`company:${companyId}` }).
// 4. prisma.subscription.update({ where:{ id: sub.id }, data:{ asaasCustomerId } }).
```
DI idêntico ao `invoice-charge.service.ts`. Testes mockam tudo.

- [ ] **Step 1: testes falhando** — `resolveAsaasCustomerId`:
  - (a) `findByCpfCnpj` acha → reusa, `created:false`, NÃO chama `create`.
  - (b) `findByCpfCnpj` null → chama `create` com cpfCnpj **só dígitos** + externalReference exato, `created:true`.
  - (c) cpfCnpjRaw com máscara (`20.606.235/0001-39`) → limpa p/ `20606235000139`.
  - (d) cpfCnpjRaw 20 dígitos / vazio / null → throw "CPF/CNPJ inválido ou ausente" (NÃO chama Asaas).
  `ensureAsaasCustomer`:
  - (e) sub já com `asaasCustomerId` → no-op, `created:false`, não chama Asaas nem update.
  - (f) sub sem customer, doc válido → resolve + `subscription.update` na sub certa, retorna id.
  - (g) **0 subscriptions** → throw "Empresa sem subscription" (não explode em `undefined`).
  - (h) **2 subs não-CANCELED** → grava na de `createdAt` mais recente (determinístico).
  - (i) só subs CANCELED → usa a mais recente (fallback) e grava.
- [ ] **Step 2: ver falhar** — `npx vitest run src/services/asaas-customer.service.test.ts`
- [ ] **Step 3: implementar** as duas funções.
- [ ] **Step 4: verde** — `npx vitest run src/services/asaas-customer.service.test.ts && npx tsc --noEmit`
- [ ] **Step 5: commit** `git add src/services/asaas-customer.service.ts src/services/asaas-customer.service.test.ts && git commit -m "feat(asaas): resolveAsaasCustomerId + ensureAsaasCustomer (reusável, find-or-create)"`

---

### Task 2: Checkout usa `resolveAsaasCustomerId` (refactor sem mudar comportamento)

**Files:**
- Modify: `src/app/api/billing/checkout/route.ts:182-202`

O bloco "1. Criar/reusar customer no Asaas" passa a delegar a `resolveAsaasCustomerId`, PRESERVANDO:
- O fallback de `holderInfo` do request: `name: input.holderInfo?.name ?? company.name`, `email: input.holderInfo?.email ?? company.email ?? userEmail ?? ""`, `cpfCnpjRaw: input.holderInfo?.cpfCnpj ?? company.cnpj`, `mobilePhone: input.holderInfo?.mobilePhone ?? company.phone`.
- O **retorno 400 estruturado** "CPF/CNPJ é obrigatório": o checkout faz `try { ... resolveAsaasCustomerId(...) } catch { return { kind:"error", status:400, message:"CPF/CNPJ é obrigatório" } }` (o service lança Error; o checkout traduz para 400 — contratos de erro distintos, conforme M1 da review).
- A chamada continua DENTRO da transação, no mesmo ponto (o advisory lock cobre a ida ao Asaas — comportamento atual preservado).
- ⚠️ **Doc limpo (I2):** como `resolveAsaasCustomerId` limpa o doc internamente (`replace(/\D/g)`), o checkout passa `cpfCnpjRaw` cru — assim backfill e checkout buscam pelo MESMO doc normalizado e não duplicam customer.

> **NOTA (verificado):** NÃO existe teste de checkout hoje (`src/app/api/billing/` não tem `*.test.ts`). `doCheckout` roda dentro de `prisma.$transaction` com advisory lock e chama `asaas.customers.*` via import de módulo (não DI) — montar um teste de integração do checkout exigiria mockar a transação inteira, o que não vale o esforço nesta fase. A cobertura do refactor vem do teste do `resolveAsaasCustomerId` (Task 1) + `tsc` + o smoke do runbook. NÃO tente montar mock de `$transaction`.
- [ ] **Step 1:** refatorar o bloco 182-202 — mover textual a lógica find-or-create para a chamada de `resolveAsaasCustomerId(cpfCnpjRaw cru + fallbacks holderInfo)`, dentro de `try/catch` que traduz o Error do service para o retorno `{ kind:"error", status:400, message:"CPF/CNPJ é obrigatório" }`. Preservar a chamada NO MESMO ponto da transação.
- [ ] **Step 2:** `npx tsc --noEmit` limpo (cobre o checkout) + `npx vitest run src/services/asaas-customer.service.test.ts` verde.
- [ ] **Step 3: commit** `git add src/services/asaas-customer.service.ts src/services/asaas-customer.service.test.ts src/app/api/billing/checkout/route.ts && git commit -m "refactor(billing): checkout usa resolveAsaasCustomerId (sem mudança de comportamento)"`

---

### Task 3: Script de backfill de customers (dry-run + allowlist + --only)

**Files:**
- Create: `scripts/backfill-asaas-customers.ts`

Script Node (rodado `node --env-file=.env scripts/backfill-asaas-customers.ts`, padrão deste worktree). Comportamento:
1. Lê empresas-alvo via `--only=<companyId>` (repetível) OU `--only=<id1,id2>`. SEM `--only` → não faz nada (imprime "nenhuma empresa selecionada").
2. Flag `--apply` (default dry-run). **`--apply` SEM `--only` é erro** (aborta) — evita aplicar em massa por acidente (M3).
3. Para cada companyId selecionado: dry-run → carrega Company+Sub, valida doc (11/14 díg), imprime `{empresa, doc mascarado (****últimos4), email, "criaria"/"reusaria (já tem customer)"/"PULA: doc inválido"/"PULA: sem email"}` SEM tocar no Asaas. Com `--apply` → chama `ensureAsaasCustomer(companyId)` e imprime o `asaasCustomerId` + `created`.
4. ⚠️ Se `company.email` for null/vazio → **pular com aviso** (Asaas pode rejeitar customer sem email; decisão conservadora — não arriscar create que falha no meio).
5. Sumário final: criados / reusados / pulados / erros. Try/catch por empresa (um erro não derruba o lote).
6. NÃO importado por runtime. Standalone.

- [ ] **Step 1:** escrever o script (dry-run default, `--only` obrigatório p/ apply, validação de doc/email, sumário). Sem teste unitário (runner; a lógica está no service da Task 1).
- [ ] **Step 2:** `npx tsc --noEmit` limpo.
- [ ] **Step 3: commit** `git add scripts/backfill-asaas-customers.ts && git commit -m "chore(asaas): script backfill de customers (dry-run+allowlist+--only, Fase A)"`

---

### Task 4: Script de criação da Invoice de teste R$5 (idempotente, total hard-coded)

**Files:**
- Create: `scripts/criar-fatura-teste-r5.ts`

Script que cria UMA Invoice de R$5 ligada à sub do Atacadão, para o teste do botão. **Idempotente e à prova de valor errado:**
1. Recebe `--company=<companyId>` (default: nenhum → aborta). `--apply` (default dry-run).
2. Resolve a sub: `findFirst({ where:{ companyId, status:{ not:"CANCELED" } }, orderBy:{ createdAt:"desc" } })`. Aborta se null.
3. **Pré-condição (C1):** se `sub.asaasSubscriptionId != null` → ABORTA com erro claro ("sub tem asaasSubscriptionId — ensureInvoiceCharge faria SYNC e ignoraria os R$5; teste inválido"). Fase A não cria recorrente, então deve ser null.
4. **Idempotência (C2):** procura Invoice existente com `subscriptionId = sub.id AND description = 'TESTE R$5 — Fase A'`. Se achar, NÃO cria outra (imprime o id e sai) — retry não gera 2ª fatura → 2ª cobrança.
5. Cria a Invoice com TODOS os NOT NULL **hard-coded** (nunca derivar de `plan.*`):
   - `subscriptionId = sub.id`
   - `number = await nextSaasInvoiceNumber(prisma)` (função auto-atômica; passar só o client `prisma`, SEM tx)
   - `subtotal = 500`, `total = 500`, `discount = 0`  ← **R$5,00 fixo**
   - `periodStart = new Date()`, `periodEnd = new Date(now + 30d)`
   - `status = "PENDING"`, `billingType = "PIX"`, `dueDate = null` (ensureInvoiceCharge usa hoje+3 via nextBusinessDay)
   - `description = "TESTE R$5 — Fase A"`
   - `paymentUrl = null` (precisa ser null p/ ensureInvoiceCharge gerar a cobrança)
6. Dry-run imprime exatamente o que criaria; `--apply` cria e imprime o `invoice.id` + confirma `total=500`.
7. **Asserção:** após criar, reler do banco e afirmar `total === 500` (senão erro).

- [ ] **Step 1:** escrever o script (dry-run default, `--company`/`--apply`, pré-condição asaasSubscriptionId=null, idempotência por description, NOT NULL hard-coded, asserção total=500).
- [ ] **Step 2:** `npx tsc --noEmit` limpo.
- [ ] **Step 3: commit** `git add scripts/criar-fatura-teste-r5.ts && git commit -m "chore(asaas): script Invoice de teste R$5 idempotente (total hard-coded, Fase A)"`

---

### Task 5: Desambiguar do script antigo + suíte + build

**Files:**
- Move: `scripts/criar-cobranca-teste.ts` → `scripts/_archive/criar-cobranca-teste.ts` (e `criar-subscription-teste.ts`, `remover-subscription-teste.ts` se untracked/da via abandonada) — para o orquestrador NÃO rodar por engano. Se forem untracked, apenas mover; se tracked, `git mv`.

> NOTA p/ o subagente: esses 3 scripts podem estar UNTRACKED (experimento abortado). Se `git status` os mostra como `??`, mova com `mv` (não precisa git). Se tracked, `git mv` + commit. NÃO os execute.

- [ ] **Step 1:** mover o(s) script(s) antigo(s) p/ `scripts/_archive/`.
- [ ] **Step 2:** `npx vitest run` (0 falhas; baseline 697 + novos testes do service).
- [ ] **Step 3:** `npx tsc --noEmit` limpo.
- [ ] **Step 4:** `.env` presente → `npm run build` verde (BUILD_ID presente).
- [ ] **Step 5: commit** (se houver mudança tracked) `git add -A scripts/_archive scripts && git commit -m "chore(asaas): arquiva scripts de cobrança avulsa antigos (não usar na Fase A)"`

---

## RUNBOOK — execução supervisionada (ORQUESTRADOR, fora do escopo do subagente)

Pré: deploy do código (Tasks 1-2) em prod — `vercel deploy --prod` do worktree (email commit `cheapmilhas@users.noreply.github.com`; `.env`+`.vercel` copiados). Sem migration.

1. **Backfill dry-run** (Atacadão): `node --env-file=.env scripts/backfill-asaas-customers.ts --only=<companyId-atacadao>` → confere doc/email.
2. **Backfill apply** (Atacadão): `... --apply --only=<companyId-atacadao>` → cria customer no Asaas, grava `asaasCustomerId`. Conferir no painel Asaas que o customer nasceu com o CNPJ certo.
3. **Confirmar pré-condição:** a sub do Atacadão tem `asaasSubscriptionId = null` (senão abortar — ver Task 4 passo 3).
4. **Criar fatura R$5 dry-run:** `node --env-file=.env scripts/criar-fatura-teste-r5.ts --company=<atacadao>` → confere.
5. **Criar fatura R$5 apply:** `... --apply --company=<atacadao>` → cria Invoice total=500. Confirmar `total=500`.
6. **No admin (prod):** abrir a fatura "TESTE R$5 — Fase A" do Atacadão → clicar **"Enviar cobrança"** → `ensureInvoiceCharge` (customer presente, sem asaasSubscriptionId) → `payments.create` R$5 (PIX) → `paymentUrl`/PIX gravados na fatura na hora + email INVOICE_CREATED enfileirado.
7. **Conferir cobrança R$5 no painel Asaas** (valor R$5,00 — NÃO R$149,90). Esta é a validação de dinheiro.
8. **Email (assíncrono):** disparar o cron manualmente — `curl -H "Authorization: Bearer $CRON_SECRET" https://vis.app.br/api/cron/email-queue` (ou aguardar 07:00). Conferir email no Hotmail (checar **lixo eletrônico**) + `invoiceSent=true` na fatura.
9. **Defensivo:** após validar o teste, marcar a fatura "TESTE R$5 — Fase A" como `paymentConfirmed=true` (ou `status=CANCELED`) para tirá-la de qualquer varredura futura de cron (mesmo com `dueDate=null` ela está fora hoje, mas isto blinda contra mudanças futuras).
10. Se OK: backfill das demais empresas válidas (uma a uma, `--apply --only=<id>`) — só CUSTOMERS, não cobra.

## Notas de deploy
- Sem migration (`asaasCustomerId` já existe no schema). Só código → `vercel deploy --prod` do worktree.
- Backfill/fatura NÃO rodam no deploy — manuais e supervisionados.

## Fora de escopo (YAGNI / Fase B)
- Subscription recorrente no Asaas (cobra mensal real) + plugar provisionamento no cadastro — **Fase B**, com confirmação.
- Corrigir doc/email da "OTICA TESTE 07/06".
- `customers.list()`/`subscriptions.list()`; idempotencyKey em `customers.create` (melhoria opcional; backfill sequencial + findByCpfCnpj já bastam).
