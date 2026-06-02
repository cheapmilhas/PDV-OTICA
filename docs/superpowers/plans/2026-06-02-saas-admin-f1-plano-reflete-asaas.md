# SaaS Admin — Fase 1: Trocar plano reflete na cobrança do Asaas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar task-by-task. Steps usam checkbox (`- [ ]`).

**Goal:** Quando o admin troca o plano OU o ciclo de cobrança de uma empresa no painel, sincronizar automaticamente o valor/ciclo da assinatura recorrente no Asaas — hoje só o acesso/limites/features mudam, e o Asaas continua cobrando o valor antigo (sangria de receita).

**Architecture:** Adicionar `asaas.subscriptions.update` ao cliente Asaas. Extrair o cálculo de valor (centavos→reais por ciclo) para um helper puro reusável e testável. Nos handlers `change_plan` e `change_billing_cycle` de `actions/route.ts`, após a transação local (que já funciona), chamar o Asaas com **fail-soft**: se o Asaas falhar, NÃO reverter o acesso local — marcar `billingSyncPending=true` na Subscription + auditar, para reconciliação posterior (F4). Idempotência via `asaas-idempotency-key`.

**Tech Stack:** Next.js App Router, Prisma + Neon, Vitest (env node, sem mock de Prisma → testes cobrem helpers puros), cliente Asaas em `src/lib/asaas.ts` (já tem `asaasFetch` com suporte a `idempotencyKey`; bloco `subscriptions` com create/get/cancel).

**Contexto herdado (verificado no código):**
- `src/lib/asaas.ts`: `asaasFetch<T>(path, init)` aceita `init.idempotencyKey` → header `asaas-idempotency-key`. `subscriptions` tem `create/get/cancel`, **falta `update`**. `AsaasSubscriptionInput` tem `value`/`cycle`/`nextDueDate`. `AsaasSubscription.value` é em **reais** (não centavos).
- Banco: `Plan.priceMonthly`/`priceYearly` em **centavos** (Int). `Subscription` tem `asaasSubscriptionId`/`asaasCustomerId` (nullable), `billingCycle BillingCycle @default(MONTHLY)` — **NOT NULL** (enum Prisma `BillingCycle = MONTHLY|YEARLY`). NÃO precisa de fallback `?? "MONTHLY"`.
- Cliente Asaas: `export const asaas` em `asaas.ts:166`; `checkout/route.ts` importa `import { asaas, AsaasError } from "@/lib/asaas"`. Usar exatamente `import { asaas } from "@/lib/asaas"`.
- `log` existe em `actions/route.ts` (`const log = logger.child(...)`, linha 9) com `.error(msg, ctx)`.
- Checkout (`src/app/api/billing/checkout/route.ts:171`): `value = billingCycle === "YEARLY" ? priceYearly/100 : priceMonthly/100`. Reusar essa fórmula.
- `actions/route.ts`:
  - `change_plan` (linha 75): faz `$transaction` (Subscription.planId + Company.maxX + SubscriptionHistory + GlobalAudit), invalida cache, loga. **NÃO seleciona `asaasSubscriptionId` nem chama Asaas.**
  - `change_billing_cycle` (linha 177): `$transaction` (Subscription.billingCycle + history + audit). **NÃO chama Asaas.**
  - `catch` genérico no fim (linha 240) retorna 500.
- **AMBIENTE:** `.env` local aponta para o banco de PRODUÇÃO e a API Asaas usada depende de `ASAAS_API_KEY` (sandbox se `$aact_test_*`, prod se `$aact_prod_*`). **Testar em SANDBOX antes de qualquer mudança que chame o Asaas em prod.**

**Gate de fim de fase (obrigatório antes de deploy):**
`npx tsc --noEmit` → `npx vitest run` → `npm run build` → code-reviewer → checagem de bugs → (deploy reservado ao dono: `vercel deploy --prod` via prompt aprovado).

---

## File Structure

**Modificar:**
- `prisma/schema.prisma` — adicionar `billingSyncPending Boolean @default(false)` ao model `Subscription` (flag para reconciliação quando o Asaas falhar). Migration aditiva.
- `src/lib/asaas.ts` — adicionar `subscriptions.update(id, input)`.
- `src/app/api/admin/clientes/[id]/actions/route.ts` — `change_plan` e `change_billing_cycle` sincronizam Asaas (fail-soft).

**Criar:**
- `src/lib/plan-pricing.ts` — helper puro `planValueForCycle(plan, cycle)`: centavos→reais conforme o ciclo. Reusado por actions (e futuramente pelo checkout).
- `src/lib/plan-pricing.test.ts` — testes do helper.

---

## Task 1: Migration — flag billingSyncPending na Subscription

**Files:**
- Modify: `prisma/schema.prisma` (model `Subscription`)
- Create: `prisma/migrations/<timestamp>_subscription_billing_sync_pending/migration.sql`

> **ATENÇÃO DE AMBIENTE:** rodar `prisma generate`/`migrate` localmente afeta o banco de PRODUÇÃO (não há dev isolado). A migration é aditiva (1 coluna boolean com default false) → segura e idempotente. Antes de aplicar, conferir se a coluna já existe.

- [ ] **Step 1: Editar schema**

No `model Subscription`, adicionar (perto dos outros campos de billing):
```prisma
  billingSyncPending Boolean @default(false)
```

- [ ] **Step 2: Verificar se a coluna já existe em prod (não recriar)**

Via Read de um script Node ou query: confirmar com `information_schema.columns WHERE table_name='Subscription' AND column_name='billingSyncPending'`. Se já existir, pular a aplicação e só `prisma generate`.

- [ ] **Step 3: Criar migration**

`npx prisma migrate dev --name subscription_billing_sync_pending --create-only`. Se falhar por shadow DB (Neon pooler), criar a pasta+`migration.sql` manualmente com:
```sql
ALTER TABLE "Subscription" ADD COLUMN "billingSyncPending" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 4: Aplicar + gerar client**

Aplicar via `prisma migrate deploy` ou `prisma db execute --file <migration.sql>` (conexão direta) e rodar `npx prisma generate`. Confirmar que `prisma.subscription` tem o campo.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(billing): flag billingSyncPending na Subscription (reconciliação Asaas)"
```

---

## Task 2: Helper puro de pricing (`plan-pricing.ts`) + testes

**Files:**
- Create: `src/lib/plan-pricing.ts`
- Test: `src/lib/plan-pricing.test.ts`

- [ ] **Step 1: Teste que falha (src/lib/plan-pricing.test.ts)**

```typescript
import { describe, it, expect } from "vitest";
import { planValueForCycle } from "./plan-pricing";

describe("planValueForCycle", () => {
  const plan = { priceMonthly: 9900, priceYearly: 99000 }; // centavos
  it("MONTHLY → priceMonthly em reais", () => {
    expect(planValueForCycle(plan, "MONTHLY")).toBe(99);
  });
  it("YEARLY → priceYearly em reais", () => {
    expect(planValueForCycle(plan, "YEARLY")).toBe(990);
  });
  it("preserva centavos fracionários", () => {
    expect(planValueForCycle({ priceMonthly: 12990, priceYearly: 0 }, "MONTHLY")).toBe(129.9);
  });
});
```

- [ ] **Step 2: Rodar e ver FALHAR**

Run: `npx vitest run src/lib/plan-pricing.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar (src/lib/plan-pricing.ts)**

```typescript
export interface PlanPricing {
  priceMonthly: number; // centavos
  priceYearly: number;  // centavos
}

/** Aceita o enum Prisma BillingCycle ("MONTHLY"|"YEARLY") por compatibilidade estrutural. */
export type CycleLike = "MONTHLY" | "YEARLY";

/** Valor da assinatura no Asaas (em reais) para o ciclo dado. Banco usa centavos. */
export function planValueForCycle(plan: PlanPricing, cycle: CycleLike): number {
  const cents = cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
  return cents / 100;
}
```
> Nota de tipo: o enum Prisma `BillingCycle` é estruturalmente compatível com `"MONTHLY"|"YEARLY"`, então `planValueForCycle(plan, subscription.billingCycle)` compila. Se o `tsc` reclamar, importar `BillingCycle` de `@prisma/client` e usar como tipo do param.

- [ ] **Step 4: Rodar e ver PASSAR**

Run: `npx vitest run src/lib/plan-pricing.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-pricing.ts src/lib/plan-pricing.test.ts
git commit -m "feat(billing): helper puro planValueForCycle (centavos→reais por ciclo) + testes"
```

---

## Task 3: Adicionar `subscriptions.update` ao cliente Asaas

**Files:**
- Modify: `src/lib/asaas.ts`

- [ ] **Step 1: Definir o tipo de input do update**

Após `AsaasSubscriptionInput`, adicionar um tipo parcial para update (Asaas aceita PUT parcial em `/subscriptions/{id}`):
```typescript
export interface AsaasSubscriptionUpdateInput {
  value?: number;            // reais
  cycle?: "MONTHLY" | "YEARLY";
  nextDueDate?: string;      // YYYY-MM-DD
  description?: string;
  /** Se true, aplica o novo valor às cobranças PENDENTES já geradas (não só às futuras). */
  updatePendingPayments?: boolean;
}
```

- [ ] **Step 2: Adicionar o método `update` no bloco `subscriptions`**

Logo após `get` (e antes/depois de `cancel`), no objeto `subscriptions`:
```typescript
    async update(
      id: string,
      input: AsaasSubscriptionUpdateInput,
      idempotencyKey?: string,
    ): Promise<AsaasSubscription> {
      return asaasFetch<AsaasSubscription>(`/subscriptions/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
        idempotencyKey,
      });
    },
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit` → sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/asaas.ts
git commit -m "feat(asaas): subscriptions.update (PUT /subscriptions/{id}) para sincronizar valor/ciclo"
```

> **Nota:** não há mock de Asaas nos testes do projeto; este método é validado por smoke-test em sandbox na Task 6, não por unit test.

---

## Task 4: `change_plan` sincroniza o Asaas (fail-soft)

**Files:**
- Modify: `src/app/api/admin/clientes/[id]/actions/route.ts` (case `change_plan`, ~linha 75)

- [ ] **Step 1: Selecionar os campos do Asaas na subscription**

No `prisma.subscription.findFirst` do `change_plan`, garantir que o objeto traz `asaasSubscriptionId` e `billingCycle` (o `include: { plan: true }` já existe; os campos escalares vêm por padrão). Confirmar via Read que `subscription.asaasSubscriptionId` e `subscription.billingCycle` estão acessíveis.

- [ ] **Step 2: Adicionar imports**

No topo do arquivo, adicionar (se ainda não houver):
```typescript
import { asaas } from "@/lib/asaas";
import { planValueForCycle } from "@/lib/plan-pricing";
```
(Verificar o nome exato do export do cliente Asaas — pode ser `asaas` ou `asaasClient`; usar o mesmo que `checkout/route.ts` importa.)

- [ ] **Step 3: Sincronizar Asaas após a transação local**

No `change_plan`, LOGO APÓS o `invalidatePlanFeaturesCache(companyId)` e ANTES do `return`, inserir:
```typescript
        // Sincroniza o valor da assinatura recorrente no Asaas.
        // Fail-soft: se o Asaas falhar, NÃO revertemos o acesso local —
        // marcamos billingSyncPending para reconciliação posterior (F4).
        if (subscription.asaasSubscriptionId) {
          const value = planValueForCycle(newPlan, subscription.billingCycle);
          try {
            await asaas.subscriptions.update(
              subscription.asaasSubscriptionId,
              { value, updatePendingPayments: true },
              `change-plan:${subscription.id}:${newPlan.id}:${value}`,
            );
          } catch (err) {
            // Recuperação protegida: gravar a auditoria PRIMEIRO (não perder o
            // rastro mesmo se o update da flag falhar), depois marcar a flag.
            const errMsg = err instanceof Error ? err.message : String(err);
            try {
              await prisma.globalAudit.create({
                data: {
                  actorType: "ADMIN_USER",
                  actorId: admin.id,
                  companyId,
                  action: "BILLING_SYNC_FAILED",
                  metadata: {
                    subscriptionId: subscription.id,
                    asaasSubscriptionId: subscription.asaasSubscriptionId,
                    context: "change_plan",
                    newValue: value,
                    error: errMsg,
                  },
                },
              });
              await prisma.subscription.update({
                where: { id: subscription.id },
                data: { billingSyncPending: true },
              });
            } catch (recErr) {
              log.error("Falha ao registrar billingSyncPending (change_plan)", {
                subscriptionId: subscription.id,
                error: recErr instanceof Error ? recErr.message : String(recErr),
              });
            }
            log.error("Falha ao sincronizar plano no Asaas", {
              subscriptionId: subscription.id,
              error: errMsg,
            });
          }
        }
```
(`subscription.billingCycle` é o ciclo atual — a troca de plano não muda o ciclo; o campo é NOT NULL, sem fallback. A idempotency-key inclui o `value` para que reaplicar o mesmo plano com valor diferente não seja deduplicado erradamente.)

- [ ] **Step 4: Verificar tipos e build**

Run: `npx tsc --noEmit` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/clientes/[id]/actions/route.ts
git commit -m "feat(admin): change_plan sincroniza valor no Asaas (fail-soft + billingSyncPending)"
```

---

## Task 5: `change_billing_cycle` sincroniza o Asaas (fail-soft)

**Files:**
- Modify: `src/app/api/admin/clientes/[id]/actions/route.ts` (case `change_billing_cycle`, ~linha 177)

> Ao trocar o ciclo, muda tanto o `cycle` quanto o `value` no Asaas (valor mensal vs anual). Precisamos do **plano atual** para calcular o novo valor.

- [ ] **Step 1: Carregar o plano da subscription (BLOQUEANTE)**

No `change_billing_cycle`, o `findFirst` atual (linha ~183) **NÃO** inclui o plano. Adicionar `include: { plan: true }`. **Este passo é obrigatório** — sem ele `subscription.plan` é `undefined` e `planValueForCycle` retorna `NaN`, que seria enviado ao Asaas. Confirmar via Read que `subscription.plan.priceMonthly/priceYearly` ficam acessíveis.

- [ ] **Step 2: Sincronizar Asaas após a transação**

LOGO APÓS o `$transaction` e ANTES do `logActivity`/`return`, inserir (espelho do fail-soft da Task 4, mas atualizando `cycle` + `value`):
```typescript
        if (subscription.asaasSubscriptionId) {
          const value = planValueForCycle(subscription.plan, cycle);
          try {
            await asaas.subscriptions.update(
              subscription.asaasSubscriptionId,
              { value, cycle, updatePendingPayments: true },
              `change-cycle:${subscription.id}:${cycle}:${value}`,
            );
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            try {
              await prisma.globalAudit.create({
                data: {
                  actorType: "ADMIN_USER",
                  actorId: admin.id,
                  companyId,
                  action: "BILLING_SYNC_FAILED",
                  metadata: {
                    subscriptionId: subscription.id,
                    asaasSubscriptionId: subscription.asaasSubscriptionId,
                    context: "change_billing_cycle",
                    newCycle: cycle,
                    newValue: value,
                    error: errMsg,
                  },
                },
              });
              await prisma.subscription.update({
                where: { id: subscription.id },
                data: { billingSyncPending: true },
              });
            } catch (recErr) {
              log.error("Falha ao registrar billingSyncPending (change_billing_cycle)", {
                subscriptionId: subscription.id,
                error: recErr instanceof Error ? recErr.message : String(recErr),
              });
            }
            log.error("Falha ao sincronizar ciclo no Asaas", {
              subscriptionId: subscription.id,
              error: errMsg,
            });
          }
        }
```

- [ ] **Step 3: Verificar tipos e build**

Run: `npx tsc --noEmit` → sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/clientes/[id]/actions/route.ts
git commit -m "feat(admin): change_billing_cycle sincroniza valor+ciclo no Asaas (fail-soft)"
```

---

## Task 6: Gate de fim de fase + smoke sandbox + deploy

**Files:** nenhum (verificação)

- [ ] **Step 1: tsc + suíte completa**

Run: `npx tsc --noEmit && npx vitest run` → tudo verde (inclui `plan-pricing.test.ts`).

- [ ] **Step 2: Build**

Run: `npm run build` → exit 0.

- [ ] **Step 3: code-reviewer**

Dispatch sobre `git diff main...HEAD`. Foco: fail-soft não reverte acesso local; idempotency-key única por operação; `value` em reais (não centavos); nenhum caminho que jogue exceção do Asaas para fora do handler (não pode virar 500 e mascarar que o plano local JÁ mudou). Corrigir CRITICAL/HIGH.

- [ ] **Step 4: Smoke-test em SANDBOX Asaas (decisão do dono — checagem de bugs)**

> NÃO testar contra Asaas de produção. Com `ASAAS_API_KEY` de sandbox (`$aact_test_*`):
- Criar/usar uma empresa de teste com subscription Asaas (asaasSubscriptionId setado).
- Trocar o plano dela no admin → confirmar no painel Asaas sandbox que o `value` da subscription mudou.
- Trocar o ciclo → confirmar `cycle` + `value` no Asaas sandbox.
- Forçar falha (ex.: asaasSubscriptionId inválido) → confirmar que o acesso local muda mesmo assim e que `billingSyncPending=true` + `GlobalAudit BILLING_SYNC_FAILED` foi gravado.

Se não houver ambiente sandbox configurado, registrar essa limitação e validar ao menos a lógica fail-soft via inspeção + teste manual do caminho de erro.

- [ ] **Step 5: Deploy (reservado ao dono)**

Push `git push origin main`. Deploy: o dono dispara `vercel deploy --prod` (aprovando o prompt de permissão). Smoke-test pós-deploy: admin troca plano de uma empresa real e confere no Asaas.

- [ ] **Step 6: Atualizar memória**

Registrar em `saas-admin-resolucao.md`: "F1 DEPLOYADA — asaas.subscriptions.update; change_plan e change_billing_cycle sincronizam valor/ciclo no Asaas (fail-soft + billingSyncPending para reconciliação F4). Migration subscription_billing_sync_pending aplicada."

---

## Notas finais
- **DRY:** `planValueForCycle` centraliza a conversão centavos→reais (hoje duplicada no checkout — pode ser adotada lá numa limpeza futura, fora do escopo).
- **YAGNI:** sem proration retroativo (decisão do dono: novo valor vale na próxima fatura). `updatePendingPayments: true` ajusta cobranças pendentes já geradas, mas não gera crédito de dias passados.
- **Fail-soft é proposital:** corrigir o acesso do cliente nunca deve falhar por causa do Asaas; a divergência fica registrada (`billingSyncPending`) para a reconciliação da Fase 4.
- **Próxima fase:** F2 (checkout só ativa após pagamento confirmado).
