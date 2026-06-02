# SaaS Admin — Fase 2: Checkout só ativa após pagamento confirmado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Parar de marcar a assinatura como `ACTIVE` (acesso pleno) antes de o pagamento ser confirmado. CREDIT_CARD (cobra no ato) segue `ACTIVE` imediato; BOLETO/PIX entram como `TRIAL` com prazo até o vencimento (+ folga), e o webhook do Asaas (que já existe e funciona) promove para `ACTIVE` quando o pagamento confirma. Se não pagar até o trial vencer, o acesso corta sozinho.

**Architecture:** Mudança cirúrgica no `doCheckout` de `billing/checkout/route.ts`: derivar o `status` inicial e os campos de período a partir do `billingType`. A promoção `TRIAL→ACTIVE` já está implementada no webhook (`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` setam `status: "ACTIVE"` + `activatedAt`). Helper puro novo para decidir o estado inicial, testável sem I/O.

**Tech Stack:** Next.js App Router, Prisma + Neon, Vitest (helpers puros). Sem migration (reusa o enum `SubscriptionStatus` existente: TRIAL/ACTIVE/...).

**Decisão do dono (fixa):** BOLETO/PIX → `TRIAL` até o vencimento + folga; CREDIT_CARD → `ACTIVE` imediato; webhook promove ao confirmar.

**Contexto herdado (verificado no código):**
- `checkout/route.ts` `doCheckout` (linha ~157): calcula `value` e `nextDueDate = hoje+1` (linha 197-198), cria a subscription no Asaas, e faz `tx.subscription.upsert` com `status: "ACTIVE"` + `activatedAt: now` + `currentPeriodStart/End` **para todos os billingTypes** (linhas 223-246). É o bug.
- `input.billingType` é `"BOLETO" | "CREDIT_CARD" | "PIX"` (zod, linha 12).
- Webhook `webhooks/asaas/route.ts`: `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` (linha ~191) faz `subscription.update status:"ACTIVE"` + `updateMany activatedAt` (where activatedAt: null). **Já promove TRIAL→ACTIVE corretamente. Não precisa mudar.**
- `enum SubscriptionStatus`: TRIAL, TRIAL_EXPIRED, ACTIVE, PAST_DUE, SUSPENDED, CANCELED. **Não há status "PENDING" dedicado — usamos TRIAL** (já libera acesso e já é promovido pelo webhook).
- `checkSubscription`/`decideAccess` (F0): TRIAL com `trialEndsAt` futuro = acesso liberado; TRIAL expirado → bloqueia. Logo, TRIAL com prazo é exatamente o "acesso provisório até pagar".

**Gate de fim de fase (obrigatório):** `npx tsc --noEmit` → `npx vitest run` → `npm run build` → code-reviewer → checagem de bugs → deploy (dono dispara).

---

## File Structure

**Criar:**
- `src/lib/checkout-status.ts` — helper puro `initialSubscriptionState({ billingType, billingCycle, now, dueDate })` → `{ status, activatedAt, trialEndsAt, currentPeriodStart, currentPeriodEnd }`.
- `src/lib/checkout-status.test.ts` — testes.

**Modificar:**
- `src/app/api/billing/checkout/route.ts` — `doCheckout` usa o helper para o upsert (em vez de `ACTIVE` fixo).

---

## Task 1: Helper puro `initialSubscriptionState` + testes

**Files:**
- Create: `src/lib/checkout-status.ts`
- Test: `src/lib/checkout-status.test.ts`

**Regra de negócio:**
- `CREDIT_CARD` → `status: "ACTIVE"`, `activatedAt: now`, `currentPeriodStart: now`, `currentPeriodEnd: now + (1 mês | 1 ano)`, `trialEndsAt: null`.
- `BOLETO` / `PIX` → `status: "TRIAL"`, `activatedAt: null`, `trialEndsAt: dueDate + GRACE_DAYS` (folga p/ compensação; usar 5 dias), `currentPeriodStart: now`, `currentPeriodEnd: now + (1 mês | 1 ano)`. O período fica pré-preenchido mas o acesso real é governado por `trialEndsAt` enquanto TRIAL; ao pagar, o webhook vira ACTIVE.

- [ ] **Step 1: Teste que falha (src/lib/checkout-status.test.ts)**

```typescript
import { describe, it, expect } from "vitest";
import { initialSubscriptionState } from "./checkout-status";

const now = new Date("2026-01-10T12:00:00Z");
const dueDate = new Date("2026-01-11T00:00:00Z"); // hoje+1

describe("initialSubscriptionState", () => {
  it("CREDIT_CARD → ACTIVE imediato com activatedAt", () => {
    const s = initialSubscriptionState({ billingType: "CREDIT_CARD", billingCycle: "MONTHLY", now, dueDate });
    expect(s.status).toBe("ACTIVE");
    expect(s.activatedAt).toEqual(now);
    expect(s.trialEndsAt).toBeNull();
  });
  it("BOLETO → TRIAL, sem activatedAt, trialEndsAt = vencimento + 5 dias", () => {
    const s = initialSubscriptionState({ billingType: "BOLETO", billingCycle: "MONTHLY", now, dueDate });
    expect(s.status).toBe("TRIAL");
    expect(s.activatedAt).toBeNull();
    const expected = new Date(dueDate);
    expected.setDate(expected.getDate() + 5);
    expect(s.trialEndsAt).toEqual(expected);
  });
  it("PIX → TRIAL (mesmo tratamento de BOLETO)", () => {
    const s = initialSubscriptionState({ billingType: "PIX", billingCycle: "MONTHLY", now, dueDate });
    expect(s.status).toBe("TRIAL");
    expect(s.activatedAt).toBeNull();
  });
  it("currentPeriodEnd MENSAL = now + 1 mês", () => {
    const s = initialSubscriptionState({ billingType: "CREDIT_CARD", billingCycle: "MONTHLY", now, dueDate });
    const expected = new Date(now); expected.setMonth(expected.getMonth() + 1);
    expect(s.currentPeriodEnd).toEqual(expected);
  });
  it("currentPeriodEnd ANUAL = now + 1 ano", () => {
    const s = initialSubscriptionState({ billingType: "CREDIT_CARD", billingCycle: "YEARLY", now, dueDate });
    const expected = new Date(now); expected.setFullYear(expected.getFullYear() + 1);
    expect(s.currentPeriodEnd).toEqual(expected);
  });
});
```

- [ ] **Step 2: Rodar e ver FALHAR**

Run: `npx vitest run src/lib/checkout-status.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar (src/lib/checkout-status.ts)**

```typescript
export type CheckoutBillingType = "BOLETO" | "CREDIT_CARD" | "PIX";
export type CheckoutCycle = "MONTHLY" | "YEARLY";

/** Dias de folga após o vencimento do boleto/pix antes de o trial expirar. */
export const BOLETO_PIX_GRACE_DAYS = 5;

export interface InitialStateInput {
  billingType: CheckoutBillingType;
  billingCycle: CheckoutCycle;
  now: Date;
  dueDate: Date; // nextDueDate da cobrança (boleto/pix); ignorado p/ cartão
}

export interface InitialState {
  status: "ACTIVE" | "TRIAL";
  activatedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

/**
 * Estado inicial da Subscription no checkout.
 * CREDIT_CARD cobra no ato → ACTIVE. BOLETO/PIX → TRIAL até o vencimento + folga;
 * o webhook PAYMENT_CONFIRMED/RECEIVED promove para ACTIVE ao pagar.
 */
export function initialSubscriptionState(input: InitialStateInput): InitialState {
  const periodEnd = new Date(input.now);
  if (input.billingCycle === "YEARLY") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  if (input.billingType === "CREDIT_CARD") {
    return {
      status: "ACTIVE",
      activatedAt: input.now,
      trialEndsAt: null,
      currentPeriodStart: input.now,
      currentPeriodEnd: periodEnd,
    };
  }

  const trialEndsAt = new Date(input.dueDate);
  trialEndsAt.setDate(trialEndsAt.getDate() + BOLETO_PIX_GRACE_DAYS);
  return {
    status: "TRIAL",
    activatedAt: null,
    trialEndsAt,
    currentPeriodStart: input.now,
    currentPeriodEnd: periodEnd,
  };
}
```

- [ ] **Step 4: Rodar e ver PASSAR**

Run: `npx vitest run src/lib/checkout-status.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/checkout-status.ts src/lib/checkout-status.test.ts
git commit -m "feat(billing): helper initialSubscriptionState (cartão=ACTIVE, boleto/pix=TRIAL até vencer) + testes"
```

---

## Task 2: Checkout usa o helper (não marca ACTIVE pra boleto/pix)

**Files:**
- Modify: `src/app/api/billing/checkout/route.ts` (`doCheckout`, upsert ~linha 217-246)

- [ ] **Step 1: Importar o helper**

No topo de `checkout/route.ts`:
```typescript
import { initialSubscriptionState } from "@/lib/checkout-status";
```

- [ ] **Step 2: Substituir o cálculo de período + status do upsert**

Localizar (Read) o trecho "3. Persistir Subscription local" (linha ~217): hoje calcula `periodEnd` manualmente e usa `status: "ACTIVE"`/`activatedAt: now` fixos no create e no update.

Substituir o cálculo manual de `periodEnd` e os campos do upsert por:
```typescript
  // 3. Persistir Subscription local — estado inicial conforme o método de pagamento.
  // Cartão = ACTIVE imediato. Boleto/PIX = TRIAL até vencer; webhook promove ao pagar.
  const initial = initialSubscriptionState({
    billingType: input.billingType,
    billingCycle: input.billingCycle,
    now,
    dueDate: nextDueDate,
  });

  const subscription = await tx.subscription.upsert({
    where: { id: existingSub?.id ?? "____new____" },
    create: {
      companyId,
      planId: plan.id,
      status: initial.status,
      billingCycle: input.billingCycle,
      currentPeriodStart: initial.currentPeriodStart,
      currentPeriodEnd: initial.currentPeriodEnd,
      activatedAt: initial.activatedAt,
      trialEndsAt: initial.trialEndsAt,
      asaasCustomerId,
      asaasSubscriptionId: asaasSub.id,
    },
    update: {
      planId: plan.id,
      status: initial.status,
      billingCycle: input.billingCycle,
      currentPeriodStart: initial.currentPeriodStart,
      currentPeriodEnd: initial.currentPeriodEnd,
      activatedAt: initial.activatedAt,
      trialEndsAt: initial.trialEndsAt,
      asaasCustomerId,
      asaasSubscriptionId: asaasSub.id,
    },
  });
```
> Garantir que `now` e `nextDueDate` já existem no escopo (existem: `now` na linha ~218 atual; `nextDueDate` na ~197). Se o `const now = new Date()` estava DENTRO do bloco do passo 3, movê-lo para ANTES da chamada de `initialSubscriptionState` (logo após o `asaas.subscriptions.create`). Remover o cálculo manual antigo de `periodEnd` (linhas ~219-221) para não ficar código morto.

> **Atenção ao `update` (reassinatura):** se uma empresa com subscription existente refizer checkout via boleto/pix, isto rebaixa `status` de ACTIVE para TRIAL e zera `activatedAt`. Isso é aceitável (ela está refazendo o pagamento), mas para NÃO regredir uma assinatura JÁ ATIVA e paga, adicionar guarda: no `update`, só aplicar `status/activatedAt/trialEndsAt` do `initial` se a sub existente NÃO estiver ACTIVE. Implementar lendo `existingSub.status` (incluir no select do existingSub — ver Step 3).

- [ ] **Step 3: Guarda anti-regressão para reassinatura de conta já ATIVA**

Localizar onde `existingSub` é buscado (fora do `doCheckout`, no handler POST) e garantir que o `select` traz `status`. Então no `update` do upsert, usar:
```typescript
    update: {
      planId: plan.id,
      // Não rebaixar uma assinatura já ACTIVE+paga para TRIAL ao reprocessar checkout.
      ...(existingSub?.status === "ACTIVE"
        ? {}
        : {
            status: initial.status,
            activatedAt: initial.activatedAt,
            trialEndsAt: initial.trialEndsAt,
          }),
      billingCycle: input.billingCycle,
      currentPeriodStart: initial.currentPeriodStart,
      currentPeriodEnd: initial.currentPeriodEnd,
      asaasCustomerId,
      asaasSubscriptionId: asaasSub.id,
    },
```
Ajustar o tipo de `existingSub` em `ctx` (`doCheckout`) e no select para incluir `status: SubscriptionStatus`. Se incluir `status` complicar tipos, pode-se buscar `existingSub.status` via o objeto já carregado — confirmar no Read.

- [ ] **Step 4: tsc + build**

Run: `npx tsc --noEmit` → sem erros. (Se `existingSub` não tiver `status` no tipo, adicionar ao select do findFirst/findUnique que o carrega.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/billing/checkout/route.ts
git commit -m "fix(billing): checkout não marca ACTIVE antes de pagar (boleto/pix=TRIAL; cartão=ACTIVE; guarda reassinatura)"
```

---

## Task 3: Gate de fim de fase + smoke + deploy

**Files:** nenhum

- [ ] **Step 1: tsc + suíte completa**

Run: `npx tsc --noEmit && npx vitest run` → verde (inclui `checkout-status.test.ts`).

- [ ] **Step 2: Build**

Run: `npm run build` → exit 0 (ignorar o aviso pré-existente de `onboarding-status`).

- [ ] **Step 3: code-reviewer**

Dispatch sobre `git diff main...HEAD`. Foco: (a) cartão continua ACTIVE imediato; (b) boleto/pix entram TRIAL com trialEndsAt correto; (c) a guarda não rebaixa conta ACTIVE; (d) o webhook promove TRIAL→ACTIVE (confirmar que não foi quebrado — ele é independente, mas reler); (e) nenhum campo do upsert ficou faltando (ex.: discount, ids). Corrigir CRITICAL/HIGH.

- [ ] **Step 4: Checagem de bugs (decisão do dono)**

Validar o raciocínio fim-a-fim:
- Assinatura BOLETO nova → `status=TRIAL`, `trialEndsAt` ~6 dias à frente, acesso liberado (decideAccess: TRIAL futuro = allowed).
- Webhook `PAYMENT_RECEIVED` chega → `status=ACTIVE`, `activatedAt` setado.
- Se trial expira sem pagar → `decideAccess` bloqueia (TRIAL_EXPIRED).
- Cartão → `ACTIVE` na hora.
(Opcional: se houver sandbox Asaas configurado, repetir o fluxo de assinatura boleto e simular webhook; senão validar por inspeção + testes.)

- [ ] **Step 5: Deploy (reservado ao dono)**

`git checkout main && git merge --no-ff <branch> && git push origin main`. Deploy: dono dispara `vercel deploy --prod` (aprova prompt). Smoke pós-deploy: home/admin 200.

- [ ] **Step 6: Atualizar memória**

Registrar em `saas-admin-resolucao.md`: "F2 DEPLOYADA — checkout não marca ACTIVE antes de pagar: cartão=ACTIVE imediato, boleto/pix=TRIAL até vencimento+5d, webhook promove a ACTIVE ao confirmar. Helper initialSubscriptionState. Guarda anti-regressão (não rebaixa conta ACTIVE em reassinatura). Sem migration."

---

## Notas finais
- **Sem migration:** reusa `SubscriptionStatus.TRIAL` (já libera acesso e já é promovido pelo webhook). Não criamos status novo (YAGNI).
- **A promoção pelo webhook já existe e não foi tocada** — risco de regressão concentrado só no checkout.
- **Guarda anti-regressão:** reassinatura de conta já ACTIVE não é rebaixada a TRIAL.
- **DRY:** o cálculo de período/estado sai do route handler para o helper testável.
- **Próxima fase:** F3 (suporte completo do cliente + notificações — terá UI via /ui-ux-pro-max).
