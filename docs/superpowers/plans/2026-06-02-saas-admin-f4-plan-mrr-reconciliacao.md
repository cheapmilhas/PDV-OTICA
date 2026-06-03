# F4 — Propagar edição de Plan + MRR/Churn corretos + reconciliação billingSyncPending

> Plano executável. Fase 4 do plano de resolução do SaaS Admin
> (ver `docs/superpowers/specs/2026-06-02-saas-admin-resolucao-design.md`, linhas 127-138).
> Esforço **M**.

## Objetivo (o dono vê)

Mudar o limite de um plano reflete nas óticas daquele plano. MRR e Churn nos relatórios
batem com o que é faturado de verdade. Subscriptions cuja sincronização com o Asaas falhou
(dívida da F1) param de divergir silenciosamente.

## Estado atual (levantado no código)

**Edição de Plan:**
- `PATCH /api/admin/plans/[id]` (`src/app/api/admin/plans/[id]/route.ts:32-91`) atualiza **só** o `Plan`
  (+ PlanFeature) e grava `globalAudit`. **NÃO propaga** para as `Company`.
- Propagação de limites só existe em `change_plan` (`clientes/[id]/actions/route.ts:77-183`), para
  **uma** empresa por vez: atualiza `Company.maxUsers/maxBranches/maxProducts` + `invalidatePlanFeaturesCache(companyId)`.
- `Company` referencia o plano **indiretamente** via `Subscription.planId` (sem `Company.planId`).
  `Company.maxUsers/maxBranches/maxProducts` são uma **cópia/cache** dos limites do Plan.
- Limites são lidos de **ambos** os lugares hoje (inconsistente): `subscription.plan.maxX` (verdade)
  E `company.maxX` (cópia) — ex. `plan-limits.ts:28-34` lê do plan; `companies/[id]/branches` lê de `company.maxBranches`.
- `invalidatePlanFeaturesCache(companyId)` (`src/lib/plan-features-cache.ts:53`) — cache LRU por companyId, TTL 5min.

**MRR / Churn:**
- MRR em `admin/page.tsx:115-118`: normaliza ciclo (YEARLY→/12) mas **ignora `discountPercent`**.
- MRR em `admin/relatorios/page.tsx:27-36`: aplica desconto mas **ignora normalização de ciclo** (só `priceMonthly`).
- **Churn**: `admin/relatorios/page.tsx:20-22` mostra **contagem** de cancelados no mês, não **taxa**.
- `Subscription` tem `billingCycle` (MONTHLY|YEARLY), `discountPercent Int?`, `discountExpiresAt DateTime?`,
  `planId`, `status` (TRIAL|TRIAL_EXPIRED|ACTIVE|PAST_DUE|SUSPENDED|CANCELED). Sem campo `value` materializado.
- `plan-pricing.ts` `planValueForCycle(plan, cycle)` retorna o preço do ciclo (não normaliza anual→mensal).

**billingSyncPending (dívida F1):**
- **SET** em `clientes/[id]/actions/route.ts:166` (change_plan) e `:299` (change_billing_cycle) quando o
  update no Asaas falha (fail-soft).
- **CONSUME**: NÃO EXISTE. Nenhum cron lê. (`src/app/api/cron/`: dunning, mark-delayed, recalc-health, retry-finance-entries.)
- `asaas.subscriptions.get(id)` (`src/lib/asaas.ts:204`) existe e retorna `{ status, value, cycle, nextDueDate, ... }`.
- Crons usam auth **fail-closed** com `CRON_SECRET` (Bearer); padrão em `cron/dunning/route.ts:25-29`.

## Decisões aprovadas (dono)

1. **Propagação de Plan:** ao editar, **sobrescrever todas** as Company com subscription naquele plano
   (`maxUsers/maxBranches/maxProducts` ← Plan). Override manual é perdido (raro; admin reajusta via change_plan).
   **Preço NÃO é retroativo** (novo preço só vale para novas cobranças — não mexe em subscription/Asaas existente).
2. **Churn:** taxa mensal = canceladas no mês ÷ ativos no 1º dia do mês.
3. **Reconciliação:** **cron periódico** (`/api/cron/reconcile-billing`, fail-closed) **+ botão manual** no admin.

### Ajustes da revisão de plano (incorporados)

4. **Plano efetivo da Company (C1):** propagar apenas para empresas cuja **subscription LIVE mais recente**
   (status in TRIAL/ACTIVE/PAST_DUE, `orderBy createdAt desc`) seja a do plano editado — espelha
   `plan-limits.ts:16-22`. `subscriptions.some` está ERRADO (empresa pode ter várias subscriptions; a mais
   recente é que vale, igual ao enforcement). Implementar buscando companyIds em código, não via `some`.
5. **IDs para invalidar cache (C2):** `company.findMany({ where, select:{id} })` → derivar a lista de companyIds
   da subscription LIVE mais recente == plano → `updateMany({ where:{ id:{ in } } })` → loop de
   `invalidatePlanFeaturesCache` sobre essa MESMA lista. Cache é in-memory **por lambda** → invalidação é
   best-effort local; outras instâncias convergem pelo TTL de 5min (limitação aceita, igual ao change_plan hoje).
6. **updateMany de Company FORA da tx das features (M4):** a propagação de limites é cache e será invalidada de
   qualquer forma — não precisa ser atômica com a troca de PlanFeature. Tirar da mesma tx interativa evita
   segurar conexão no pooler Neon (lição do timeout de advisory lock, commit d9a229f).
7. **Churn = aproximação honesta rotulada (C3):** status atual ≠ status passado, e não há snapshot. Base inicial
   ≈ subscriptions com `activatedAt < monthStart` E (`canceledAt is null OR canceledAt >= monthStart`).
   **Rotular na UI como "estimativa"**; NÃO afirmar "churn confiável". (Derivar de SubscriptionHistory seria
   mais correto, mas é caro — fica como dívida anotada.) Churn não conta PAST_DUE→ACTIVE→PAST_DUE no passado.
8. **Reconciliação: materializar o esperado (H1/H4) — MIGRATION pequena.** Reavaliado: SEM colunas a
   reconciliação é frágil (DB não tem `value`; cycle só muda em change_billing_cycle; comparar com Plan+desconto
   marca divergência falsa). Adicionar `Subscription.expectedAsaasValue Int?` (centavos) e
   `expectedAsaasCycle BillingCycle?`, gravados NO MOMENTO em que `billingSyncPending` é setado
   (change_plan grava value; change_billing_cycle grava value+cycle). Reconciliação compara o **esperado
   materializado** com o Asaas — correto e idempotente. Esperado = `planValueForCycle(plan, cycle)` **sem
   desconto** (igual ao que change_plan/change_billing_cycle enviaram ao Asaas).
9. **Status do Asaas (H2):** `AsaasSubscription.status` é ACTIVE|EXPIRED|INACTIVE (≠ enum do DB). Regra: se o
   Asaas retornar status não-ACTIVE → **não baixar a flag**, auditar divergência (subscription pode estar
   cancelada/expirada no Asaas mas viva no DB — decisão humana).
10. **Edge da reconciliação (H3):** filtrar `asaasSubscriptionId: { not: null }` na busca; `get` 404 (removida no
    Asaas) → mantém flag + audita, não derruba o lote (fail-soft por item). Comparação de valor com tolerância
    (Asaas value em reais float vs DB centavos → comparar `Math.round(asaas.value*100) === expectedAsaasValue`).

## Fora de escopo (NÃO entra — confirmado pela spec)

- Cohort / LTV / CAC.
- Versionamento de planos / grandfathering.
- Invoice Int→Decimal (dívida anotada).
- Tornar `change_plan`/limites uma fonte única (consolidar leitura company.maxX vs plan.maxX) — anotar dívida;
  a propagação faz os dois convergirem, mas a leitura dupla permanece.

---

## Arquitetura

### Helpers puros testáveis — `src/lib/admin-metrics.ts` (já existe, estender)
- `monthlyValueOfSubscription({ priceMonthly, priceYearly, billingCycle, discountPercent, discountExpiresAt }, now)`:
  valor efetivo **mensal** de UMA subscription = base do ciclo normalizada p/ mês
  (YEARLY→priceYearly/12; MONTHLY→priceMonthly) menos desconto **se ainda vigente** (`discountExpiresAt` null ou futuro).
  Retorna em centavos (inteiro) para casar com o resto do sistema; converte p/ reais só na UI.
- `computeMRR(subscriptions, now)`: soma `monthlyValueOfSubscription` das subscriptions **ACTIVE**
  (decisão: MRR conta receita recorrente realizada — ACTIVE; TRIAL/PAST_DUE/SUSPENDED fora).
- `computeChurnRate({ canceledInPeriod, activeAtPeriodStart })`: `activeAtPeriodStart === 0 ? 0 : canceledInPeriod / activeAtPeriodStart`.

### Propagação de Plan — `PATCH /api/admin/plans/[id]`
- `tx.plan.update(...)` + features (como hoje, na tx atual).
- **Fora da tx das features (M4):** resolver os companyIds a propagar:
  - `companiesOfPlan(planId)` (helper, ver abaixo): para cada Company com subscription viva, a subscription
    **mais recente** (`status in [TRIAL,ACTIVE,PAST_DUE]`, `orderBy createdAt desc`) deve ter `planId == editado`.
    Como Prisma não expressa "mais recente" num where, buscar candidatas e filtrar em código.
  - `prisma.company.updateMany({ where: { id: { in: companyIds } }, data: { maxUsers, maxBranches, maxProducts } })`.
  - loop `invalidatePlanFeaturesCache(companyId)` sobre `companyIds` (best-effort local + TTL 5min).
- `globalAudit` registra a propagação (qtde de empresas).
- **Preço:** atualiza `priceMonthly/priceYearly` no Plan; **não toca** subscriptions nem Asaas (não retroativo).

### Churn + MRR nos relatórios
- `admin/relatorios/page.tsx` e `admin/page.tsx`: trocar os cálculos inline pelos helpers puros.
  - MRR: usar `computeMRR(activeSubs, now)` (com desconto + ciclo).
  - Churn: calcular `canceledThisMonth` (já existe) + `activeAtMonthStart` (nova query:
    subscriptions ACTIVE criadas antes do início do mês e não canceladas antes dele) → `computeChurnRate`.
  - Exibir churn como % ao lado do MRR.

### Reconciliação billingSyncPending
- **Migration:** `Subscription.expectedAsaasValue Int?` (centavos) + `expectedAsaasCycle BillingCycle?`.
  Gravados quando `billingSyncPending` é setado: change_plan grava `expectedAsaasValue` (value sem desconto);
  change_billing_cycle grava ambos. (Aditiva, segura, idempotente.)
- **Serviço** `src/services/billing-reconcile.service.ts` `reconcilePendingBilling({ limit })`:
  - busca subscriptions `billingSyncPending=true AND asaasSubscriptionId not null` (cap N).
  - por item (try/catch — fail-soft): `asaas.subscriptions.get(asaasSubscriptionId)`.
    - 404 → mantém flag + audita (removida no Asaas).
    - status Asaas não-ACTIVE → mantém flag + audita (H2).
    - status ACTIVE: comparar `Math.round(asaas.value*100) === expectedAsaasValue` e, se `expectedAsaasCycle`
      setado, `asaas.cycle === expectedAsaasCycle`. Bate → baixa flag (limpa expected*). Diverge → mantém + audita.
  - Idempotente (rodar 2x não muda nada além de flags já resolvidas).
- **Cron** `GET /api/cron/reconcile-billing` — fail-closed `CRON_SECRET` Bearer (igual dunning). Add no `vercel.json`
  (já há 4 crons; confirmar limite do plano da conta antes — L3).
- **Botão manual:** `POST /api/admin/billing/reconcile` (getAdminSession + role ["SUPER_ADMIN","ADMIN"]) chama o
  mesmo serviço; retorna resumo (baixadas / divergentes). Botão no painel admin.

---

## Tarefas (executar 1 por vez — NÃO paralelizar tasks com git commit)

### T1 — Helpers de métrica (puros + testes)
- Estender `admin-metrics.ts`: `monthlyValueOfSubscription` (centavos; YEARLY→/12; desconto vigente:
  `discountExpiresAt` null=permanente, futuro=vigente, passado=expirado→cheio), `computeMRR` (só ACTIVE),
  `computeChurnRate({ canceledInPeriod, activeAtPeriodStart })` (base 0 → 0).
- Testes: 3 casos de desconto; ciclo anual; MRR só ACTIVE; churn base 0.
- Gate: tsc + vitest.

### T2 — Aplicar MRR/Churn nos relatórios
- `admin/page.tsx` + `admin/relatorios/page.tsx` usam os helpers; query de base inicial
  (`activatedAt < monthStart AND (canceledAt null OR >= monthStart)`) — **rotular churn como estimativa**.
- Exibir churn % na UI. (Se mudar layout além do número → /ui-ux-pro-max.)
- Gate: tsc + build.

### T3 — Propagação de Plan
- Helper `companiesOfPlan(planId)` (subscription LIVE mais recente == plano; filtra em código). Testável.
- `PATCH /api/admin/plans/[id]`: plan.update+features (tx atual) → **fora da tx** resolve companyIds →
  `updateMany({ id in })` → invalidar cache por companyId → globalAudit com contagem.
- Teste: `companiesOfPlan` (função pura sobre lista de subscriptions) — só a mais recente conta; plano certo.
- Gate: tsc + vitest + build.

### T4 — Migration do esperado + gravar em change_plan/change_billing_cycle
- Migration aditiva: `Subscription.expectedAsaasValue Int?` + `expectedAsaasCycle BillingCycle?`.
- `clientes/[id]/actions/route.ts`: ao setar `billingSyncPending=true`, gravar o esperado
  (change_plan: value; change_billing_cycle: value+cycle). Aplicar migration manual local + prod (T6).
- Gate: tsc + (migration via arquivo, não no build).

### T5 — Reconciliação (serviço + cron + botão)
- `billing-reconcile.service.ts` (idempotente, fail-soft por item; usa expectedAsaasValue/Cycle; H2/H3).
- `GET /api/cron/reconcile-billing` (fail-closed CRON_SECRET) + entrada no `vercel.json` (confirmar limite de
  crons do plano da conta antes — já há 4).
- `POST /api/admin/billing/reconcile` (getAdminSession + ["SUPER_ADMIN","ADMIN"]) + botão no painel admin.
- Teste: lógica pura de comparação (bate→baixa; diverge→mantém+audita; status não-ACTIVE→mantém).
- Gate: tsc + vitest + build.

### T6 — Gate final + merge + deploy
- tsc + vitest + build + code-reviewer (multi-tenant, idempotência da reconciliação, propagação correta).
- merge --no-ff na main → push.
- **Aplicar migration manualmente em prod ANTES do deploy** (`migrate deploy`; confirmar status up to date).
- Deploy prod → smoke (home/login=200; /api/cron/reconcile-billing sem Bearer=401;
  /api/admin/billing/reconcile sem auth=401; /admin=307).
- Atualizar memória; fechar a dívida F1→F4 no [[saas-admin-resolucao]].

---

## Riscos & cuidados

- **Propagação sobrescreve override manual** (decisão aceita). globalAudit registra; admin pode reajustar.
- **MRR só ACTIVE:** definição explícita — não contar TRIAL (ainda não paga) nem SUSPENDED/PAST_DUE (não realizada).
  Documentar no helper para não "consertar" errado depois.
- **Reconciliação não força preço automaticamente** em divergência — só baixa flag quando Asaas já reflete o
  esperado; divergência real vira audit para decisão humana (evita sobrescrever o que o Asaas tem de verdade).
- **Cron fail-closed:** sem CRON_SECRET → 401 (igual dunning). Rota /api/cron/* já no proxy bypass (confirmado
  na review: proxy.ts:106-113). Limite de crons do plano Vercel: já há 4 — confirmar antes de add o 5º (L3).
- **Desconto vigente:** `discountExpiresAt` no passado → desconto não conta mais no MRR (valor cheio).
- **Migration (T4):** aditiva (`expectedAsaasValue`/`expectedAsaasCycle`), aplicar manual antes do deploy.
- **Churn é estimativa** (status atual ≠ passado); reconstrução exata via SubscriptionHistory fica como dívida.
- **Reconciliação não força preço:** só baixa flag quando o Asaas reflete o esperado materializado; divergência
  real e status não-ACTIVE viram audit para decisão humana.

## Pronto quando
- Editar limite de um plano reflete nas óticas daquele plano (teste do where + comportamento).
- MRR com desconto + ciclo normalizado; churn como taxa (teste do cálculo).
- Reconciliação fecha divergências resolvidas (flag baixa) e audita as reais.
- tsc/vitest/build verdes; code-review sem CRITICAL/HIGH aberto; deploy + smoke OK.
