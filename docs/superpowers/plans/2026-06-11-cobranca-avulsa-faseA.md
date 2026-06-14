# Cobrança Avulsa Única (Fase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um botão "Nova cobrança" na ficha do cliente e na tela de faturas que cria uma cobrança avulsa ÚNICA — gera o customer Asaas on-demand, emite boleto/PIX real e manda o email (respeitando o modo teste) — resolvendo o teste de R$5 sem chave no terminal.

**Architecture:** Reusa 100% do pipeline da Fase 2 já em prod: `ensureAsaasCustomer` (criado nesta sessão), `ensureInvoiceCharge` (gera boleto/PIX), `sendInvoiceCharge` (envia + grava estado), `nextSaasInvoiceNumber` (number atômico), `notifyCompany` (modo teste). Novo: 2 campos na Invoice (`isManual`/`source`), um service orquestrador `manual-charge.service.ts`, a rota `POST /api/admin/charges`, e um componente botão+modal compartilhado. Correção C1: excluir `isManual` do cron `invoice-reminders` Parte B (senão email fantasma).

**Tech Stack:** Next 16, Prisma/Neon, TypeScript, Vitest. Asaas PROD via `ASAAS_API_KEY` (já na Vercel). Spec: `docs/superpowers/specs/2026-06-11-cobranca-avulsa-design.md`.

## GUARDRAILS (subagentes)
- git SÓ `git add <arquivos-da-task>` + `git commit`. NUNCA checkout/reset/branch/rebase/cherry-pick/stash/merge.
- PROIBIDO `prisma format/migrate/generate/db`, qualquer `vercel`. (Migration é escrita à mão + aplicada pelo orquestrador no deploy — drift do cockpit faz `migrate dev` falhar.)
- Só os arquivos da task. Confira `git status --short`. Untracked pré-existentes (docs/scripts) NÃO são seus.
- Cada task: TDD, commit isolado. Bloqueou? PARE e relate.

## Convenções reusadas (NÃO reinventar)
- `ensureAsaasCustomer(companyId, deps?)` → `{ asaasCustomerId, created }`. Cria customer on-demand, grava na sub. Throw "CPF/CNPJ inválido ou ausente" / "Empresa sem subscription".
- `ensureInvoiceCharge(invoiceId, deps?)` → gera boleto/PIX no Asaas (avulso via payments.create idempotencyKey `invoice:${id}` quando sub sem asaasSubscriptionId — que é o caso). Exige `subscription.asaasCustomerId` (por isso ensureAsaasCustomer roda ANTES).
- `sendInvoiceCharge(invoiceId, adminId, deps?)` → `{ status, alreadySentToday }`. Envia via notifyCompany (modo teste) + grava invoiceSent.
- `nextSaasInvoiceNumber(prisma)` → `INV-NNNNNN` (ATÔMICO via SaasCounter). **NUNCA usar `invoice.count()+1`** (race → colisão no number @unique).
- Rota admin: `getAdminSession()` (401 se null, 403 se role ∉ {SUPER_ADMIN, ADMIN}), Zod no body, try/catch→500, `handleApiError` ou NextResponse.json.
- Invoice NOT NULL: subscriptionId, number, subtotal, total, periodStart, periodEnd. dueDate/description/billingType nullable.

---

### Task 1: Migration aditiva — Invoice.isManual + Invoice.source

**Files:**
- Modify: `prisma/schema.prisma` (model Invoice)
- Create: `prisma/migrations/20260611140000_invoice_manual/migration.sql`

Adicionar ao model Invoice:
```prisma
  isManual   Boolean  @default(false)
  source     String?
```
Migration SQL (à mão, formato Prisma):
```sql
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "isManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "source" TEXT;
```

- [ ] Step 1: editar o schema.prisma (adicionar os 2 campos no model Invoice, perto dos outros campos de flag tipo invoiceGenerated).
- [ ] Step 2: criar o arquivo migration.sql com o ALTER acima.
- [ ] Step 3: `npx tsc --noEmit` — ATENÇÃO: o client Prisma NÃO foi regenerado (guardrail proíbe `prisma generate`). O tsc pode acusar `isManual`/`source` não existirem no tipo Invoice. **Se acusar:** NÃO rode prisma generate; relate ao orquestrador que o client precisa ser regenerado (o ORQUESTRADOR roda `prisma generate` fora do subagente, pois é exceção controlada). Os testes downstream mockam Prisma, então compilam mesmo com client stale após o generate do orquestrador.
- [ ] Step 4: commit `git add prisma/schema.prisma prisma/migrations/20260611140000_invoice_manual/ && git commit -m "feat(cobranca): Invoice.isManual + source (migration aditiva)"`

> **NOTA orquestrador:** após esta task, rodar `npx prisma generate` (1x, fora do subagente) para o client conhecer os campos novos. Sem isso as tasks 2+ não compilam.

---

### Task 2: Service `manual-charge.service.ts` (orquestrador da cobrança única)

**Files:**
- Create: `src/services/manual-charge.service.ts`
- Test: `src/services/manual-charge.service.test.ts`

**Contrato:**
```ts
createManualCharge(
  args: { companyId: string; amount: number; description: string; source?: string; dueDate?: Date | null; adminId: string },
  deps?: { prismaClient?; ensureCustomerFn?; ensureChargeFn?; sendFn?; numberFn? }
): Promise<{ invoiceId: string; asaasChargeCreated: boolean; emailStatus: string }>
```
Fluxo (ordem importa):
1. Resolve a sub: `prisma.subscription.findFirst({ where:{ companyId, status:{ not:"CANCELED" } }, orderBy:{ createdAt:"desc" } })`. Se null → `throw new Error("Empresa sem assinatura ativa para cobrar")`. (ANTES de tocar o Asaas.)
2. `await ensureCustomerFn(companyId)` (default `ensureAsaasCustomer`) — cria customer on-demand (pode throw "CPF/CNPJ inválido ou ausente").
3. `const number = await numberFn(prisma)` (default `nextSaasInvoiceNumber`).
4. Cria a Invoice: `prisma.invoice.create({ data: { subscriptionId: sub.id, number, subtotal: amount, total: amount, discount: 0, periodStart: now, periodEnd: now+30d, status:"PENDING", billingType:"PIX", description, isManual: true, source: source ?? null, dueDate: dueDate ?? null } })`.
5. `await ensureChargeFn(inv.id)` (default `ensureInvoiceCharge`) — gera boleto/PIX no Asaas. `asaasChargeCreated = true` se não lançar.
6. `const send = await sendFn(inv.id, adminId)` (default `sendInvoiceCharge`). `emailStatus = send.status`.
7. Retorna `{ invoiceId: inv.id, asaasChargeCreated: true, emailStatus }`.
- DI de tudo p/ testes. `now` injetável OU `new Date()` (use `new Date()`; testes não checam o valor exato de data).

> **PRÉ-CHECK (M1):** se `npx tsc --noEmit` acusar `isManual`/`source` não existirem no tipo `Invoice`, o client Prisma não foi regenerado após a Task 1 → PARE e peça ao orquestrador rodar `npx prisma generate` (é exceção controlada, fora do subagente). NÃO rode você mesmo.

> **Falha parcial do Asaas (I3) — comportamento INTENCIONAL:** se `ensureChargeFn` lançar (Asaas fora do ar) DEPOIS do `invoice.create`, a Invoice JÁ foi criada (PENDING, sem paymentUrl, isManual=true) e NÃO é revertida (sem rollback). O erro propaga p/ a rota (→ 500). A Invoice fica recuperável: o admin clica "Reenviar" na lista de faturas (o `ResendChargeButton` → `sendInvoiceCharge` → `ensureInvoiceCharge` regenera a cobrança). Isso é aceitável e documentado — NÃO envolver em transação que reverte (a Invoice-rascunho é melhor que perder o registro).

- [ ] Step 1: teste falhando — (a) fluxo feliz: chama ensureCustomer→cria Invoice isManual=true total=amount→ensureCharge→send, retorna emailStatus do send; verifica a ORDEM (ensureCustomer antes de ensureCharge); (b) sub CANCELED-only (findFirst→null) → throw "Empresa sem assinatura ativa para cobrar", NÃO chama ensureCustomer; (c) ensureCustomer throw → propaga, NÃO cria Invoice; (d) emailStatus SKIPPED propagado; (e) amount=500 → invoice.create recebe total:500; (f) **ensureChargeFn throw → a Invoice JÁ foi criada (invoice.create chamado) e o erro propaga (comportamento intencional I3)**.
- [ ] Step 2: `npx vitest run src/services/manual-charge.service.test.ts` → FALHAR.
- [ ] Step 3: implementar.
- [ ] Step 4: `npx vitest run src/services/manual-charge.service.test.ts && npx tsc --noEmit` → verde.
- [ ] Step 5: commit `git add src/services/manual-charge.service.ts src/services/manual-charge.service.test.ts && git commit -m "feat(cobranca): createManualCharge orquestra cobrança avulsa única"`

---

### Task 3: Rota `POST /api/admin/charges`

**Files:**
- Create: `src/app/api/admin/charges/route.ts`
- Test: `src/app/api/admin/charges/route.test.ts`

Body Zod: `{ companyId: z.string().min(1), amount: z.number().int().positive(), description: z.string().min(1), source: z.string().optional(), dueDate: z.string().datetime().optional() }`.
Fluxo: `getAdminSession()` → 401 se null. **Role check REVALIDADO NO BANCO** (ação financeira sensível — não confiar no role do JWT, que pode estar desatualizado): após parsear o body (precisa do companyId), chamar `requireCompanyScope(admin.id, body.companyId)` de `@/lib/admin-session` — revalida role+active+escopo da empresa no banco (fecha janela de JWT desatualizado E garante que o admin tem escopo sobre ESSA empresa) → 403 se retornar null. NÃO usar só `admin.role` do payload. Ordem: getAdminSession (401) → parse Zod (400) → requireCompanyScope (403) → service. `try { const r = await createManualCharge({ ...body, dueDate: body.dueDate ? new Date(body.dueDate) : null, adminId: admin.id }); return NextResponse.json({ success: true, ...r }) } catch (e) { ... }`. No catch: se a mensagem do erro contém "CPF/CNPJ" → 400 "Cadastre o CNPJ/CPF da empresa antes de cobrar"; se contém "sem assinatura" → 400 com a mensagem; senão 500 "Erro interno" logado. Import `createManualCharge` mockável.

- [ ] Step 1: teste (mockar `@/lib/admin-session` getAdminSession + requireCompanyScope, e o service) — 401 sem sessão; 403 quando requireCompanyScope retorna null (admin sem escopo/role); 400 Zod (amount:0); 400 quando service throw "CPF/CNPJ ..." ; 200 feliz (requireCompanyScope retorna admin + mock service) retorna invoiceId+emailStatus.
- [ ] Step 2: ver falhar.
- [ ] Step 3: implementar.
- [ ] Step 4: `npx vitest run src/app/api/admin/charges/route.test.ts && npx tsc --noEmit`.
- [ ] Step 5: commit `git add src/app/api/admin/charges/route.ts src/app/api/admin/charges/route.test.ts && git commit -m "feat(cobranca): POST /api/admin/charges (cria cobrança avulsa)"`

---

### Task 4: Correção C1 — cron invoice-reminders Parte B ignora isManual

**Files:**
- Modify: `src/services/invoice-reminders.service.ts` (where da Parte B, ~linhas 92-106)
- Modify/Add: `src/services/invoice-reminders.service.test.ts`

Adicionar `isManual: false` ao objeto `where` da query da Parte B (a que seleciona faturas p/ INVOICE_DUE_SOON). NÃO mexer na Parte A.

- [ ] Step 1: ler a Parte B e localizar o `where`. Adicionar teste de regressão: "Parte B NÃO seleciona Invoice com isManual=true" (mockar prisma.invoice.findMany e verificar que o where passado contém `isManual: false`).
- [ ] Step 2: ver o teste novo falhar (se o where ainda não tem isManual).
- [ ] Step 3: adicionar `isManual: false` ao where.
- [ ] Step 4: `npx vitest run src/services/invoice-reminders.service.test.ts && npx tsc --noEmit`.
- [ ] Step 5: commit `git add src/services/invoice-reminders.service.ts src/services/invoice-reminders.service.test.ts && git commit -m "fix(cobranca): cron invoice-reminders Parte B ignora cobranças avulsas (isManual)"`

---

### Task 5: Componente `NovaCobrancaButton` (botão + modal compartilhado)

**Files:**
- Create: `src/components/admin/nova-cobranca-button.tsx`
- Test: `src/components/admin/nova-cobranca-button.test.tsx`

Client component. Props: `{ companyId: string; label?: string }`. Botão "Nova cobrança" → abre um modal (overlay simples com div fixa, sem lib de Dialog — o repo não tem). Form: valor (R$, number step 0.01), descrição (text, required), vencimento (date, opcional), source (select: Implementação/Extra/Mensalidade/Outro → values implementation/extra/manual_monthly/other). Aviso fixo: "A cobrança é criada de verdade no Asaas. O modo teste afeta apenas o email." Submit → `POST /api/admin/charges` com `amount: Math.round(parseFloat(valor)*100)`, description, source, dueDate (ISO ou undefined), companyId. Mostra resultado: sucesso → "Cobrança criada." + status do email (`emailStatus==="SENT"` → "Email enviado." senão "Email não enviado ("+emailStatus+")"). Erro → mostra data.error. Em sucesso, `router.refresh()` e fecha o modal. Segue o estilo Tailwind do new-invoice-form (bg-gray-800/border-gray-700). **Testes:** pragma `/** @vitest-environment jsdom */`, usar `render`/`screen`/`fireEvent` de `@testing-library/react` (já no package.json), matcher `.toBeDefined()` (jest-dom existe no package mas NÃO está wired no vitest — os testes do repo, ex. feature-gate.test.tsx, usam só `.toBeDefined()`/checagem de `.disabled`/`.textContent`). Mock `next/navigation` (`useRouter` → `{ refresh: vi.fn() }`) e `global.fetch`.

- [ ] Step 1: testes — (a) render botão "Nova cobrança"; (b) clicar abre o modal (form visível: campo valor/descrição); (c) aviso de modo teste visível; (d) submit com valor "5" e descrição "Teste" → fetch chamado em /api/admin/charges com amount:500; (e) resposta `{success:true, emailStatus:"SENT"}` → mostra "Email enviado.".
- [ ] Step 2: ver falhar.
- [ ] Step 3: implementar.
- [ ] Step 4: `npx vitest run src/components/admin/nova-cobranca-button.test.tsx && npx tsc --noEmit`.
- [ ] Step 5: commit `git add src/components/admin/nova-cobranca-button.tsx src/components/admin/nova-cobranca-button.test.tsx && git commit -m "feat(cobranca): NovaCobrancaButton (botão+modal compartilhado)"`

---

### Task 6: Montar o botão na ficha do cliente + header da tela de faturas

**Files:**
- Modify: `src/app/admin/clientes/[id]/page.tsx` (adicionar `<NovaCobrancaButton companyId={...} />` na seção de faturas/header)
- Modify: `src/app/admin/financeiro/faturas/page.tsx` (trocar o header button `<Link href="/admin/financeiro/faturas/nova">Nova Cobrança</Link>` — localizar por grep, ~linha 104 — por `<NovaCobrancaButton companies={companies} />`)

⚠️ **Escopo (correção da review):**
- **NÃO** mexer em `src/app/admin/financeiro/page.tsx` — ali o "Nova Cobrança" é um `<QuickLink>` (card de "Ações Rápidas"), não um botão de header; trocar por um botão-modal quebraria o grid de cards. Deixar esse card legado apontando para `/faturas/nova` (consistente, não órfão — é um atalho de visão geral).
- Os dois pontos REAIS desta task são: ficha do cliente (companyId fixo) + header da lista de faturas (precisa escolher empresa).

**A tela de faturas é global** (lista todas as empresas) → o botão precisa de um seletor de empresa. Decisão: o componente aceita `companyId?: string` OU `companies?: {id,name}[]`. companyId → empresa fixa (ficha do cliente). companies → mostra `<select>` de empresa no topo do modal (tela de faturas).

- [ ] Step 1: estender `NovaCobrancaButton` (componente da Task 5) p/ aceitar `companies?: {id,name}[]` + `<select>` no modal quando `companies` vier. TDD: teste "com companies mostra select de empresa; com companyId não mostra select". Atualizar o teste da Task 5.
- [ ] Step 2: ver falhar; implementar a extensão do componente.
- [ ] Step 3: na ficha do cliente, montar `<NovaCobrancaButton companyId={company.id} />` (var da empresa na página).
- [ ] Step 4: na `faturas/page.tsx`, buscar `companies` no server component (`prisma.company.findMany({ where:{ subscriptions:{ some:{ status:{ not:"CANCELED" } } } }, select:{ id:true, name:true }, orderBy:{ name:"asc" } })`) e trocar o header `<Link>` por `<NovaCobrancaButton companies={companies} />`.
- [ ] Step 5: `npx vitest run src/components/admin/nova-cobranca-button.test.tsx && npx tsc --noEmit`.
- [ ] Step 6: commit `git add src/app/admin/clientes/[id]/page.tsx src/app/admin/financeiro/faturas/page.tsx src/components/admin/nova-cobranca-button.tsx src/components/admin/nova-cobranca-button.test.tsx && git commit -m "feat(cobranca): monta NovaCobrancaButton na ficha do cliente + header de faturas"`

---

### Task 7: Suíte + tsc + build

- [ ] `npx vitest run` (0 falhas; baseline 706 + novos).
- [ ] `npx tsc --noEmit` limpo.
- [ ] `.env` presente → `npm run build` verde (BUILD_ID presente; rotas /api/admin/charges no manifest).
- [ ] commit final se houver ajuste.

## RUNBOOK — deploy + teste R$5 (orquestrador supervisionado)
1. `npx prisma generate` (regenera client p/ isManual/source) — feito após Task 1.
2. Deploy: migration aditiva via `prisma db execute --stdin` heredoc (RTK quebra --file): `ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "isManual" BOOLEAN NOT NULL DEFAULT false; ADD COLUMN "source" TEXT;`. Registrar em `_prisma_migrations` (drift cockpit P3006). Pré-check: colunas não existem.
3. `vercel deploy --prod` do worktree (cp .env+.vercel; email commit cheapmilhas@users.noreply.github.com).
4. **Teste R$5:** no admin → ficha do Atacadão (companyId cmlx4fkjt000092bq1n7rm63g) OU tela de faturas → "Nova cobrança" → R$5, "Teste", source Outro → cria customer on-demand + boleto/PIX R$5 no Asaas + email pro testEmail.
5. Conferir cobrança R$5 no painel Asaas (valor R$5,00) + email no Hotmail (lixo eletrônico). Disparar cron email-queue manual se o email não chegar (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/email-queue`).

## Fora de escopo (Fase 2b)
Recorrência (RecurringChargeRule, cron, unique por mês, UI de gestão). Ver seção "Fase 2b" da spec.
