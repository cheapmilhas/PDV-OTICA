# Plano Básico — Feature Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloquear (esconder 100%) 13 funcionalidades específicas no plano Básico (R$ 149,90) do SaaS PDV ÓTICA, com defesa em camadas (layout gate + API wrapper + sidebar filter + FeatureGate inline), reusando a infra de Plan/PlanFeature/Subscription já existente.

**Architecture:** Catálogo central tipado (`src/lib/plan-feature-catalog.ts`) mapeia 13 features → rotas/APIs/sidebar. Gate principal vive em `(dashboard)/layout.tsx` (server component, Node runtime, acesso Prisma). APIs usam wrapper `withPlanFeatureGuard` preservando assinatura `(req, ctx)` para dynamic segments. Sidebar usa hook `hasFeature` existente. Cache LRU 5min com fail-open em erros de DB. Kill switch `DISABLE_PLAN_FEATURE_GATING` aplicado em 4 pontos consistentes.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Prisma + Postgres (Neon), NextAuth v5, vitest (novo), Playwright (novo), lru-cache (já presente via NextAuth).

**Reference spec:** `docs/superpowers/specs/2026-05-25-plano-basico-feature-gating-design.md`

---

## File Structure

### Novos arquivos
- `src/lib/plan-feature-catalog.ts` — FEATURES const, FEATURE_REGISTRY, pathMatchesAny, findBlockedFeature
- `src/lib/plan-features-cache.ts` — LRU cache + invalidação
- `src/lib/with-plan-feature.ts` — wrapper de API com generic ctx
- `prisma/seed-plan-basico-features.ts` — seed atômico idempotente
- `prisma/seed-plan-basico-features-rollback.ts` — script de rollback
- `vitest.config.ts` — config de unit/integration tests
- `playwright.config.ts` — config E2E
- `src/lib/__tests__/plan-feature-catalog.test.ts`
- `src/lib/__tests__/plan-features-cache.test.ts`
- `src/lib/__tests__/find-blocked-feature.test.ts`
- `src/lib/__tests__/with-plan-feature.test.ts`
- `e2e/feature-gating/basico-blocked.spec.ts`
- `e2e/feature-gating/profissional-livre.spec.ts`
- `e2e/feature-gating/kill-switch.spec.ts`

### Arquivos modificados
- `src/lib/plan-features.ts` — adicionar kill switch a `requirePlanFeature`
- `src/components/plan/feature-gate.tsx` — refatorar para inferir label do registry
- `src/app/api/plan-features/route.ts` — incluir 13 keys + kill switch
- `src/middleware.ts` — setar `x-current-path` em request headers via `NextResponse.next({ request: { headers } })`
- `src/app/(dashboard)/layout.tsx` — adicionar gate (fail-open com try/catch)
- `src/components/layout/sidebar.tsx` — adicionar `requiresFeature` em 13 items
- `src/components/layout/mobile-nav.tsx` — espelhar sidebar
- `src/components/home/pricing-section.tsx` — consumir registry para labels
- `src/components/landing/pricing.tsx` — idem
- `src/services/subscription.service.ts` (ou onde mora `changePlan`) — chamar `invalidatePlanFeaturesCache`
- 13 grupos de API route files: aplicar `withPlanFeatureGuard` no export E manter `requirePlanFeature` no topo do handler:
  - `src/app/api/lens-treatments/**/route.ts`
  - `src/app/api/stock-transfers/**/route.ts`
  - `src/app/api/stock-movements/transfer/route.ts`
  - `src/app/api/reports/branch-comparison/route.ts`
  - `src/app/api/finance/reports/dre/route.ts` + `src/app/api/reports/financial/dre/route.ts`
  - `src/app/api/finance/reports/cash-flow/route.ts`
  - `src/app/api/finance/entries/**/route.ts`
  - `src/app/api/finance/accounts/**/route.ts`
  - `src/app/api/finance/chart/**/route.ts`
  - `src/app/api/sales/[id]/refund/route.ts` + `src/app/api/sales/[id]/refunds/route.ts`
  - `src/app/api/finance/reconciliation/**/route.ts`
  - `src/app/api/finance/bi/**/route.ts` + `src/app/api/finance/aggregate/**/route.ts`
  - `src/app/api/finance/card-receivables/**/route.ts`
  - `src/app/api/recurring-expenses/**/route.ts`

### Não-alterados (mas referenciados)
- `prisma/schema.prisma` — sem mudança de schema (Plan/PlanFeature/Subscription já existem)
- `src/hooks/usePlanFeatures.ts` — já implementado, sem mudanças
- `prisma/seed-plans.ts` — sem mudança (PAID_PLAN_SLUGS validados: basico, profissional, enterprise)

---

## Tasks

### Fase 0 — Setup de framework de testes (pré-requisito)

#### Task 0.1: Instalar vitest e dependências

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Instalar deps**

Run:
```bash
cd "/Users/matheusreboucas/PDV OTICA" && npm install --save-dev vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
```
Expected: deps adicionadas em `package.json`, sem erros.

- [ ] **Step 2: Criar `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: [],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 3: Adicionar script `test` em `package.json`**

Em `scripts`: `"test": "vitest run", "test:watch": "vitest"`.

- [ ] **Step 4: Smoke test**

Create `src/lib/__tests__/smoke.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("vitest funciona", () => expect(1 + 1).toBe(2));
});
```

Run: `npm test`
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/__tests__/smoke.test.ts
git commit -m "chore(test): adiciona vitest + smoke test"
```

#### Task 0.2: Instalar Playwright

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Instalar Playwright**

Run: `npx playwright install --with-deps chromium`

Run: `npm install --save-dev @playwright/test`

- [ ] **Step 2: Criar `playwright.config.ts`**

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 3: Adicionar script `e2e` em `package.json`**

`"e2e": "playwright test", "e2e:ui": "playwright test --ui"`.

- [ ] **Step 4: Smoke E2E**

Create `e2e/smoke.spec.ts`:
```typescript
import { test, expect } from "@playwright/test";
test("smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
});
```

Run server (em outro terminal): `npm run dev`
Run: `npm run e2e -- e2e/smoke.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json playwright.config.ts e2e/smoke.spec.ts
git commit -m "chore(test): adiciona Playwright + smoke E2E"
```

---

### Fase 1 — Catálogo + helpers + cache (Rollout passo 1)

#### Task 1.1: Criar `FEATURES` const e tipos

**Files:**
- Create: `src/lib/plan-feature-catalog.ts`
- Test: `src/lib/__tests__/plan-feature-catalog.test.ts`

- [ ] **Step 1: Test primeiro**

```typescript
// src/lib/__tests__/plan-feature-catalog.test.ts
import { describe, it, expect } from "vitest";
import { FEATURES } from "@/lib/plan-feature-catalog";

describe("FEATURES const", () => {
  it("expõe 13 feature keys", () => {
    expect(Object.keys(FEATURES)).toHaveLength(13);
  });
  it("contém as 13 keys esperadas", () => {
    expect(FEATURES).toMatchObject({
      LENS_TREATMENTS: "lens_treatments",
      STOCK_TRANSFERS: "stock_transfers",
      BRANCH_COMPARISON: "branch_comparison",
      DRE_REPORT: "dre_report",
      CASH_FLOW: "cash_flow",
      FINANCE_ENTRIES: "finance_entries",
      FINANCE_ACCOUNTS: "finance_accounts",
      CHART_OF_ACCOUNTS: "chart_of_accounts",
      SALES_REFUNDS: "sales_refunds",
      BANK_RECONCILIATION: "bank_reconciliation",
      BI_ANALYTICS: "bi_analytics",
      CARD_RECEIVABLES: "card_receivables",
      RECURRING_EXPENSES: "recurring_expenses",
    });
  });
});
```

- [ ] **Step 2: Rodar test, deve falhar**

Run: `npm test -- plan-feature-catalog`
Expected: FAIL (module not found).

- [ ] **Step 3: Implementar mínimo**

```typescript
// src/lib/plan-feature-catalog.ts
export const FEATURES = {
  LENS_TREATMENTS:     "lens_treatments",
  STOCK_TRANSFERS:     "stock_transfers",
  BRANCH_COMPARISON:   "branch_comparison",
  DRE_REPORT:          "dre_report",
  CASH_FLOW:           "cash_flow",
  FINANCE_ENTRIES:     "finance_entries",
  FINANCE_ACCOUNTS:    "finance_accounts",
  CHART_OF_ACCOUNTS:   "chart_of_accounts",
  SALES_REFUNDS:       "sales_refunds",
  BANK_RECONCILIATION: "bank_reconciliation",
  BI_ANALYTICS:        "bi_analytics",
  CARD_RECEIVABLES:    "card_receivables",
  RECURRING_EXPENSES:  "recurring_expenses",
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];
```

- [ ] **Step 4: Rodar test, deve passar**

Run: `npm test -- plan-feature-catalog`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-feature-catalog.ts src/lib/__tests__/plan-feature-catalog.test.ts
git commit -m "feat(plan-gating): catálogo central de feature keys (13 features)"
```

#### Task 1.2: Adicionar `FEATURE_REGISTRY` com mapeamentos

**Files:**
- Modify: `src/lib/plan-feature-catalog.ts`
- Modify: `src/lib/__tests__/plan-feature-catalog.test.ts`

- [ ] **Step 1: Test primeiro**

Adicionar ao test file:
```typescript
import { FEATURE_REGISTRY } from "@/lib/plan-feature-catalog";

describe("FEATURE_REGISTRY", () => {
  it("tem entrada para todas as 13 features", () => {
    for (const key of Object.values(FEATURES)) {
      expect(FEATURE_REGISTRY[key]).toBeDefined();
      expect(FEATURE_REGISTRY[key].label).toBeTruthy();
      expect(FEATURE_REGISTRY[key].pageMatchers.length).toBeGreaterThan(0);
      expect(FEATURE_REGISTRY[key].apiMatchers.length).toBeGreaterThan(0);
    }
  });
  it("SALES_REFUNDS usa regex para dynamic segment", () => {
    const matchers = FEATURE_REGISTRY[FEATURES.SALES_REFUNDS].apiMatchers;
    const hasRegex = matchers.some((m) => m instanceof RegExp);
    expect(hasRegex).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar test, deve falhar**

Run: `npm test -- plan-feature-catalog`
Expected: FAIL.

- [ ] **Step 3: Implementar `FEATURE_REGISTRY`**

Copiar o bloco completo da spec (seção "Catálogo central", linhas ~95-210 do arquivo `docs/superpowers/specs/2026-05-25-plano-basico-feature-gating-design.md`) para `src/lib/plan-feature-catalog.ts`. Inclui:
- type `PathMatcher = string | RegExp`
- interface `FeatureMeta`
- const `FEATURE_REGISTRY` com 13 entradas (paths auditados)

- [ ] **Step 4: Rodar test, deve passar**

Run: `npm test -- plan-feature-catalog`
Expected: 4 passed (2 anteriores + 2 novos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-feature-catalog.ts src/lib/__tests__/plan-feature-catalog.test.ts
git commit -m "feat(plan-gating): FEATURE_REGISTRY com 13 mapeamentos auditados"
```

#### Task 1.3: Adicionar `pathMatchesAny` helper

**Files:**
- Modify: `src/lib/plan-feature-catalog.ts`
- Modify: `src/lib/__tests__/plan-feature-catalog.test.ts`

- [ ] **Step 1: Test primeiro**

```typescript
import { pathMatchesAny } from "@/lib/plan-feature-catalog";

describe("pathMatchesAny", () => {
  it("string prefix bate exato", () => {
    expect(pathMatchesAny("/api/foo", ["/api/foo"])).toBe(true);
  });
  it("string prefix bate sub-path", () => {
    expect(pathMatchesAny("/api/foo/bar", ["/api/foo"])).toBe(true);
  });
  it("string prefix NÃO bate path diferente", () => {
    expect(pathMatchesAny("/api/foobar", ["/api/foo"])).toBe(false);
  });
  it("regex bate dynamic segment", () => {
    const re = /^\/api\/sales\/[^/]+\/refund$/;
    expect(pathMatchesAny("/api/sales/abc123/refund", [re])).toBe(true);
    expect(pathMatchesAny("/api/sales/refund", [re])).toBe(false);
  });
  it("retorna false em lista vazia", () => {
    expect(pathMatchesAny("/api/foo", [])).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar, deve falhar**

Run: `npm test -- plan-feature-catalog`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Adicionar ao final de `src/lib/plan-feature-catalog.ts`:
```typescript
export function pathMatchesAny(path: string, matchers: PathMatcher[]): boolean {
  for (const m of matchers) {
    if (typeof m === "string") {
      if (path === m || path.startsWith(m + "/")) return true;
    } else {
      if (m.test(path)) return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Rodar, deve passar**

Run: `npm test -- plan-feature-catalog`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-feature-catalog.ts src/lib/__tests__/plan-feature-catalog.test.ts
git commit -m "feat(plan-gating): pathMatchesAny helper (string + regex)"
```

#### Task 1.4: Adicionar `findBlockedFeature`

**Files:**
- Modify: `src/lib/plan-feature-catalog.ts`
- Create: `src/lib/__tests__/find-blocked-feature.test.ts`

- [ ] **Step 1: Test primeiro (positivos + negativos)**

```typescript
// src/lib/__tests__/find-blocked-feature.test.ts
import { describe, it, expect } from "vitest";
import { findBlockedFeature, FEATURES } from "@/lib/plan-feature-catalog";

const ALL_FALSE = Object.fromEntries(Object.values(FEATURES).map((k) => [k, false]));
const ALL_TRUE  = Object.fromEntries(Object.values(FEATURES).map((k) => [k, true]));

describe("findBlockedFeature — quando todas features=false", () => {
  it.each([
    ["/dashboard/tratamentos", FEATURES.LENS_TREATMENTS],
    ["/dashboard/estoque/transferencias", FEATURES.STOCK_TRANSFERS],
    ["/dashboard/relatorios/comparativo-lojas", FEATURES.BRANCH_COMPARISON],
    ["/dashboard/financeiro/dre", FEATURES.DRE_REPORT],
    ["/dashboard/relatorios/dre", FEATURES.DRE_REPORT],
    ["/dashboard/financeiro/fluxo-caixa", FEATURES.CASH_FLOW],
    ["/dashboard/financeiro/lancamentos", FEATURES.FINANCE_ENTRIES],
    ["/dashboard/financeiro/contas", FEATURES.FINANCE_ACCOUNTS],
    ["/dashboard/financeiro/plano-contas", FEATURES.CHART_OF_ACCOUNTS],
    ["/dashboard/financeiro/devolucoes", FEATURES.SALES_REFUNDS],
    ["/dashboard/financeiro/conciliacao", FEATURES.BANK_RECONCILIATION],
    ["/dashboard/financeiro/bi", FEATURES.BI_ANALYTICS],
    ["/dashboard/financeiro/cartoes", FEATURES.CARD_RECEIVABLES],
    ["/dashboard/financeiro/despesas-recorrentes", FEATURES.RECURRING_EXPENSES],
    ["/api/sales/abc123/refund", FEATURES.SALES_REFUNDS],
    ["/api/sales/xyz/refunds", FEATURES.SALES_REFUNDS],
    ["/api/recurring-expenses", FEATURES.RECURRING_EXPENSES],
    ["/api/stock-movements/transfer", FEATURES.STOCK_TRANSFERS],
    ["/api/reports/financial/dre", FEATURES.DRE_REPORT],
  ])("bloqueia %s → %s", (path, expectedKey) => {
    expect(findBlockedFeature(path, ALL_FALSE)).toBe(expectedKey);
  });
});

describe("findBlockedFeature — quando todas features=true", () => {
  it.each([
    "/dashboard/tratamentos",
    "/dashboard/financeiro/dre",
    "/api/sales/abc123/refund",
    "/api/recurring-expenses",
  ])("libera %s", (path) => {
    expect(findBlockedFeature(path, ALL_TRUE)).toBeNull();
  });
});

describe("findBlockedFeature — paths fora do catálogo", () => {
  it("retorna null para /dashboard/vendas", () => {
    expect(findBlockedFeature("/dashboard/vendas", ALL_FALSE)).toBeNull();
  });
  it("retorna null para /api/customers", () => {
    expect(findBlockedFeature("/api/customers", ALL_FALSE)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar, deve falhar**

Run: `npm test -- find-blocked-feature`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Adicionar ao final de `src/lib/plan-feature-catalog.ts`:
```typescript
export function findBlockedFeature(
  path: string,
  features: Record<string, boolean>,
): FeatureKey | null {
  for (const [key, meta] of Object.entries(FEATURE_REGISTRY) as [FeatureKey, typeof FEATURE_REGISTRY[FeatureKey]][]) {
    if (features[key] === true) continue;
    if (pathMatchesAny(path, meta.pageMatchers)) return key;
    if (pathMatchesAny(path, meta.apiMatchers)) return key;
  }
  return null;
}
```

- [ ] **Step 4: Rodar, deve passar**

Run: `npm test -- find-blocked-feature`
Expected: ≥ 23 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-feature-catalog.ts src/lib/__tests__/find-blocked-feature.test.ts
git commit -m "feat(plan-gating): findBlockedFeature com cobertura de 13 features"
```

#### Task 1.5: Criar cache LRU

**Files:**
- Create: `src/lib/plan-features-cache.ts`
- Create: `src/lib/__tests__/plan-features-cache.test.ts`

- [ ] **Step 1: Confirmar `lru-cache` disponível**

Run: `node -e "console.log(require('lru-cache').LRUCache)"`
Expected: `[class LRUCache extends LRU]` ou similar. Se falhar, `npm install lru-cache`.

- [ ] **Step 2: Test primeiro (com mock de getSubscriptionInfo)**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/subscription", () => ({
  getSubscriptionInfo: vi.fn(),
}));

import { getSubscriptionInfo } from "@/lib/subscription";
import { getCachedPlanFeatures, invalidatePlanFeaturesCache } from "@/lib/plan-features-cache";

describe("plan-features-cache", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("retorna features convertidas (string→boolean)", async () => {
    (getSubscriptionInfo as any).mockResolvedValue({
      features: { lens_treatments: "false", cash_flow: "true" },
    });
    const r = await getCachedPlanFeatures("co1");
    expect(r.features).toEqual({ lens_treatments: false, cash_flow: true });
    expect(r.hasSubscription).toBe(true);
  });

  it("hasSubscription=false quando getSubscriptionInfo retorna null", async () => {
    (getSubscriptionInfo as any).mockResolvedValue(null);
    const r = await getCachedPlanFeatures("co2");
    expect(r.hasSubscription).toBe(false);
    expect(r.features).toEqual({});
  });

  it("cacheia: 2 chamadas só atingem getSubscriptionInfo 1 vez", async () => {
    (getSubscriptionInfo as any).mockResolvedValue({ features: {} });
    await getCachedPlanFeatures("co3");
    await getCachedPlanFeatures("co3");
    expect(getSubscriptionInfo).toHaveBeenCalledTimes(1);
  });

  it("invalidação força refetch", async () => {
    (getSubscriptionInfo as any).mockResolvedValue({ features: {} });
    await getCachedPlanFeatures("co4");
    invalidatePlanFeaturesCache("co4");
    await getCachedPlanFeatures("co4");
    expect(getSubscriptionInfo).toHaveBeenCalledTimes(2);
  });

  it("erro de DB não cacheia (próxima chamada tenta de novo)", async () => {
    (getSubscriptionInfo as any).mockRejectedValueOnce(new Error("db down"));
    await expect(getCachedPlanFeatures("co5")).rejects.toThrow("db down");
    (getSubscriptionInfo as any).mockResolvedValueOnce({ features: {} });
    const r = await getCachedPlanFeatures("co5");
    expect(r.hasSubscription).toBe(true);
  });
});
```

- [ ] **Step 3: Rodar, deve falhar**

Run: `npm test -- plan-features-cache`
Expected: FAIL.

- [ ] **Step 4: Implementar**

Copiar bloco "Cache de Plan Features" da spec para `src/lib/plan-features-cache.ts`.

- [ ] **Step 5: Rodar, deve passar**

Run: `npm test -- plan-features-cache`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plan-features-cache.ts src/lib/__tests__/plan-features-cache.test.ts
git commit -m "feat(plan-gating): cache LRU 5min com fail-on-error (sem poison)"
```

#### Task 1.6: Adicionar kill switch a `requirePlanFeature`

**Files:**
- Modify: `src/lib/plan-features.ts`

- [ ] **Step 1: Ler arquivo atual**

`Read src/lib/plan-features.ts` para entender o estado.

- [ ] **Step 2: Adicionar kill switch no topo**

Adicionar como primeira linha do corpo de `requirePlanFeature`:
```typescript
if (process.env.DISABLE_PLAN_FEATURE_GATING === "true") return;
```

- [ ] **Step 3: Test do kill switch**

Adicionar `src/lib/__tests__/plan-features.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { requirePlanFeature } from "@/lib/plan-features";

describe("requirePlanFeature kill switch", () => {
  it("retorna sem checar quando DISABLE_PLAN_FEATURE_GATING=true", async () => {
    const orig = process.env.DISABLE_PLAN_FEATURE_GATING;
    process.env.DISABLE_PLAN_FEATURE_GATING = "true";
    await expect(requirePlanFeature("co1", "qualquer_coisa")).resolves.toBeUndefined();
    process.env.DISABLE_PLAN_FEATURE_GATING = orig;
  });
});
```

- [ ] **Step 4: Rodar, deve passar**

Run: `npm test -- plan-features.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-features.ts src/lib/__tests__/plan-features.test.ts
git commit -m "feat(plan-gating): kill switch em requirePlanFeature"
```

---

### Fase 2 — `/api/plan-features` atualização (Rollout passo 2)

#### Task 2.1: Adicionar 13 keys ao `ALL_FEATURES` + kill switch

**Files:**
- Modify: `src/app/api/plan-features/route.ts`

- [ ] **Step 1: Ler arquivo atual**

`Read src/app/api/plan-features/route.ts`. Anotar a estrutura.

- [ ] **Step 2: Modificar ALL_FEATURES e adicionar kill switch**

No topo do arquivo:
```typescript
import { FEATURES } from "@/lib/plan-feature-catalog";

const LEGACY_FEATURES = ["crm", "goals", "campaigns", "cashback", "multi_branch", "reports_advanced"];
const ALL_FEATURES = [...LEGACY_FEATURES, ...Object.values(FEATURES)];
```

No início do handler `GET`:
```typescript
if (process.env.DISABLE_PLAN_FEATURE_GATING === "true") {
  return NextResponse.json({
    features: Object.fromEntries(ALL_FEATURES.map((k) => [k, "true"])),
  });
}
```

- [ ] **Step 3: Test E2E simples (curl)**

Em `e2e/plan-features-endpoint.spec.ts`:
```typescript
import { test, expect } from "@playwright/test";

test("/api/plan-features inclui as 13 keys novas no ALL_FEATURES quando accessEnabled", async ({ request }) => {
  // Setup: logar como usuário com accessEnabled=true OU sem subscription
  // (depende do setup do projeto — usar helper de auth se houver)
  const res = await request.get("/api/plan-features");
  if (res.status() !== 200) test.skip(); // sem auth setup
  const body = await res.json();
  expect(Object.keys(body.features)).toEqual(
    expect.arrayContaining(["lens_treatments", "dre_report", "cash_flow", "sales_refunds"]),
  );
});
```

- [ ] **Step 4: Rodar smoke**

Iniciar dev server (`npm run dev`). Manualmente: `curl -s http://localhost:3000/api/plan-features | jq '.features | keys'`. Confirmar 13 keys novas aparecem.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/plan-features/route.ts
git commit -m "feat(plan-gating): /api/plan-features inclui 13 keys + kill switch"
```

---

### Fase 3 — `<FeatureGate />` refatorado (Rollout passo 3)

#### Task 3.1: Refatorar FeatureGate para inferir label

**Files:**
- Modify: `src/components/plan/feature-gate.tsx`

- [ ] **Step 1: Ler arquivo atual**

`Read src/components/plan/feature-gate.tsx`.

- [ ] **Step 2: Refatorar**

```typescript
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { FEATURE_REGISTRY, type FeatureKey } from "@/lib/plan-feature-catalog";

interface FeatureGateProps {
  feature: FeatureKey;
  featureName?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, featureName, children, fallback }: FeatureGateProps) {
  const { loading, hasFeature } = usePlanFeatures();
  if (loading) return null;
  if (hasFeature(feature)) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  const label = featureName ?? FEATURE_REGISTRY[feature]?.label ?? feature;
  return <UpgradeBadge feature={label} />;
}

function UpgradeBadge({ feature }: { feature: string }) {
  return (
    <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      🔒 {feature} — disponível no plano Profissional
    </div>
  );
}
```

- [ ] **Step 3: Test simples**

`src/components/plan/__tests__/feature-gate.test.tsx`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeatureGate } from "../feature-gate";
import { FEATURES } from "@/lib/plan-feature-catalog";

vi.mock("@/hooks/usePlanFeatures", () => ({
  usePlanFeatures: vi.fn(),
}));
import { usePlanFeatures } from "@/hooks/usePlanFeatures";

describe("FeatureGate", () => {
  it("renderiza children quando hasFeature retorna true", () => {
    (usePlanFeatures as any).mockReturnValue({ loading: false, hasFeature: () => true });
    render(<FeatureGate feature={FEATURES.LENS_TREATMENTS}>OK</FeatureGate>);
    expect(screen.getByText("OK")).toBeDefined();
  });
  it("mostra badge com label do registry quando hasFeature false", () => {
    (usePlanFeatures as any).mockReturnValue({ loading: false, hasFeature: () => false });
    render(<FeatureGate feature={FEATURES.LENS_TREATMENTS}>OK</FeatureGate>);
    expect(screen.getByText(/Tratamentos de Lente/)).toBeDefined();
  });
});
```

Atualizar `vitest.config.ts` para `environment: "jsdom"` quando testando componentes (criar config segmentada se necessário, ou trocar de novo).

- [ ] **Step 4: Rodar test**

Run: `npm test -- feature-gate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/plan/feature-gate.tsx src/components/plan/__tests__/
git commit -m "feat(plan-gating): FeatureGate infere label do FEATURE_REGISTRY"
```

---

### Fase 4 — Gate no layout + middleware + withPlanFeatureGuard (Rollout passo 4)

#### Task 4.1: Criar `withPlanFeatureGuard` wrapper

**Files:**
- Create: `src/lib/with-plan-feature.ts`
- Create: `src/lib/__tests__/with-plan-feature.test.ts`

- [ ] **Step 1: Tests primeiro**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withPlanFeatureGuard } from "@/lib/with-plan-feature";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/plan-features-cache", () => ({ getCachedPlanFeatures: vi.fn() }));

import { auth } from "@/auth";
import { getCachedPlanFeatures } from "@/lib/plan-features-cache";

const makeRequest = (path: string) => new Request(`http://x${path}`);
const passthrough = vi.fn(async (req: Request, ctx: any) => new Response("ok"));

describe("withPlanFeatureGuard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.DISABLE_PLAN_FEATURE_GATING;
  });

  it("kill switch bypassa", async () => {
    process.env.DISABLE_PLAN_FEATURE_GATING = "true";
    const wrapped = withPlanFeatureGuard(passthrough);
    const res = await wrapped(makeRequest("/api/lens-treatments"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(passthrough).toHaveBeenCalled();
  });

  it("allow-list /api/auth bypassa", async () => {
    const wrapped = withPlanFeatureGuard(passthrough);
    const res = await wrapped(makeRequest("/api/auth/session"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it("sem session bypassa (handler trata 401)", async () => {
    (auth as any).mockResolvedValue(null);
    const wrapped = withPlanFeatureGuard(passthrough);
    const res = await wrapped(makeRequest("/api/finance/entries"), { params: Promise.resolve({}) });
    expect(passthrough).toHaveBeenCalled();
  });

  it("bloqueia quando feature=false", async () => {
    (auth as any).mockResolvedValue({ user: { companyId: "co1" } });
    (getCachedPlanFeatures as any).mockResolvedValue({
      features: { finance_entries: false },
      hasSubscription: true,
    });
    const wrapped = withPlanFeatureGuard(passthrough);
    const res = await wrapped(makeRequest("/api/finance/entries"), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("PLAN_FEATURE_REQUIRED");
    expect(body.error.feature).toBe("finance_entries");
  });

  it("libera quando feature=true", async () => {
    (auth as any).mockResolvedValue({ user: { companyId: "co1" } });
    (getCachedPlanFeatures as any).mockResolvedValue({
      features: { finance_entries: true },
      hasSubscription: true,
    });
    const wrapped = withPlanFeatureGuard(passthrough);
    const res = await wrapped(makeRequest("/api/finance/entries"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it("fail-open: DB error não bloqueia", async () => {
    (auth as any).mockResolvedValue({ user: { companyId: "co1" } });
    (getCachedPlanFeatures as any).mockRejectedValue(new Error("db down"));
    const wrapped = withPlanFeatureGuard(passthrough);
    const res = await wrapped(makeRequest("/api/finance/entries"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(passthrough).toHaveBeenCalled();
  });

  it("preserva ctx (params) para handlers com dynamic segment", async () => {
    (auth as any).mockResolvedValue({ user: { companyId: "co1" } });
    (getCachedPlanFeatures as any).mockResolvedValue({
      features: { sales_refunds: true },
      hasSubscription: true,
    });
    const ctx = { params: Promise.resolve({ id: "abc123" }) };
    const wrapped = withPlanFeatureGuard(passthrough);
    await wrapped(makeRequest("/api/sales/abc123/refund"), ctx);
    expect(passthrough).toHaveBeenCalledWith(expect.any(Request), ctx);
  });
});
```

- [ ] **Step 2: Rodar, deve falhar**

Run: `npm test -- with-plan-feature`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Copiar bloco "withPlanFeatureGuard" da spec (seção "Camada 1") para `src/lib/with-plan-feature.ts`.

- [ ] **Step 4: Rodar, deve passar**

Run: `npm test -- with-plan-feature`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/with-plan-feature.ts src/lib/__tests__/with-plan-feature.test.ts
git commit -m "feat(plan-gating): withPlanFeatureGuard wrapper com generic ctx + fail-open"
```

#### Task 4.2: Atualizar `middleware.ts` para setar `x-current-path` em request headers

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Ler middleware atual**

`Read src/middleware.ts`. Identificar onde retorna `NextResponse.next()`.

- [ ] **Step 2: Modificar para setar header em request**

Substituir `return NextResponse.next();` (em todo lugar relevante) por:
```typescript
const requestHeaders = new Headers(req.headers);
requestHeaders.set("x-current-path", req.nextUrl.pathname);
return NextResponse.next({ request: { headers: requestHeaders } });
```

- [ ] **Step 3: Smoke E2E**

`e2e/middleware-header.spec.ts`:
```typescript
import { test, expect } from "@playwright/test";

test("middleware seta x-current-path", async ({ page, context }) => {
  // Sem auth, só checar que middleware roda sem erro
  await page.goto("/dashboard");
  // Validação indireta: página carrega sem 500
});
```

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(plan-gating): middleware seta x-current-path em request headers"
```

#### Task 4.3: Adicionar gate em `(dashboard)/layout.tsx`

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Ler layout atual**

`Read src/app/(dashboard)/layout.tsx`.

- [ ] **Step 2: Adicionar gate**

Copiar bloco "src/app/(dashboard)/layout.tsx" da spec (Camada 1, código com fail-open try/catch).

Garantir que a env var `DISABLE_PLAN_FEATURE_GATING=true` está setada em `.env.local` antes de testar (Passo 4 do rollout — kill switch ligado por padrão).

- [ ] **Step 3: Smoke**

Em `.env.local`: `DISABLE_PLAN_FEATURE_GATING=true`.
Iniciar `npm run dev`. Logar com qualquer usuário. Navegar para `/dashboard/financeiro/dre`. Esperado: página carrega normal.

Remover env var temporariamente. Re-acessar — esperado: redirect.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx
git commit -m "feat(plan-gating): gate em (dashboard)/layout com fail-open"
```

#### Task 4.4: Aplicar `withPlanFeatureGuard` aos 13 grupos de API

Subtarefa por feature. Cada uma é trivial: importar wrapper + envelopar exports. Reagrupando em 1 commit por feature.

Para cada arquivo da lista (em File Structure → API route files), aplicar o padrão:

```typescript
import { withPlanFeatureGuard } from "@/lib/with-plan-feature";
// ... handlers originais agora wrapped:
export const GET = withPlanFeatureGuard(async (req, ctx) => { /* handler original */ });
export const POST = withPlanFeatureGuard(async (req, ctx) => { /* ... */ });
// etc
```

- [ ] **Step 1: Aplicar em `/api/lens-treatments/**`** + commit
- [ ] **Step 2: Aplicar em `/api/stock-transfers/**`** + commit
- [ ] **Step 3: Aplicar em `/api/stock-movements/transfer`** + commit
- [ ] **Step 4: Aplicar em `/api/reports/branch-comparison`** + commit
- [ ] **Step 5: Aplicar em `/api/finance/reports/dre` + `/api/reports/financial/dre`** + commit
- [ ] **Step 6: Aplicar em `/api/finance/reports/cash-flow`** + commit
- [ ] **Step 7: Aplicar em `/api/finance/entries/**`** + commit
- [ ] **Step 8: Aplicar em `/api/finance/accounts/**`** + commit
- [ ] **Step 9: Aplicar em `/api/finance/chart/**`** + commit
- [ ] **Step 10: Aplicar em `/api/sales/[id]/refund` + `/refunds`** + commit
- [ ] **Step 11: Aplicar em `/api/finance/reconciliation/**` (recursivo)** + commit
- [ ] **Step 12: Aplicar em `/api/finance/bi/**` + `/api/finance/aggregate/**`** + commit
- [ ] **Step 13: Aplicar em `/api/finance/card-receivables/**`** + commit
- [ ] **Step 14: Aplicar em `/api/recurring-expenses/**`** + commit

Cada step:
1. Editar export
2. Smoke `npm run build` (Next type-check) — deve passar
3. Commit `feat(plan-gating): wrap <feature> APIs com withPlanFeatureGuard`

#### Task 4.5: Adicionar `requirePlanFeature` no topo dos handlers (defesa interna)

Para cada feature, dentro do handler já wrapped, adicionar como primeira linha após auth:
```typescript
await requirePlanFeature(companyId, FEATURES.LENS_TREATMENTS);
```

- [ ] **Step 1-13:** mesma estrutura da Task 4.4, mas adicionando a chamada interna. Cada feature = 1 commit.

#### Task 4.6: Set `DISABLE_PLAN_FEATURE_GATING=true` em produção (Vercel env var)

- [ ] **Step 1: Ir ao painel Vercel → Settings → Environment Variables**
- [ ] **Step 2: Adicionar `DISABLE_PLAN_FEATURE_GATING=true` em Production**
- [ ] **Step 3: Redeploy**
- [ ] **Step 4: Smoke**: logar com conta real, navegar pelas 13 telas — todas devem carregar (porque kill switch on).

---

### Fase 5 — Sidebar / MobileNav (Rollout passo 5)

#### Task 5.1: Adicionar `requiresFeature` a items de sidebar

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/mobile-nav.tsx`

- [ ] **Step 1: Ler arquivos**

`Read src/components/layout/sidebar.tsx` e `mobile-nav.tsx`. Identificar a estrutura de `navItems`.

- [ ] **Step 2: Adicionar campo `requiresFeature` + import FEATURES**

```typescript
import { FEATURES } from "@/lib/plan-feature-catalog";

// No array de items, para cada um dos 13 itens correspondentes:
{ label: "Tratamentos", href: "/dashboard/tratamentos", icon: ..., requiresFeature: FEATURES.LENS_TREATMENTS },
{ label: "Transferências", href: "/dashboard/estoque/transferencias", icon: ..., requiresFeature: FEATURES.STOCK_TRANSFERS },
// ... 11 outros
```

- [ ] **Step 3: Filtrar items antes de render**

Antes do `.map` que renderiza items:
```typescript
const visibleItems = navItems.filter(
  (i) => !i.requiresFeature || hasFeature(i.requiresFeature),
);
// usar visibleItems.map(...) em vez de navItems.map(...)
```

- [ ] **Step 4: Repetir para `mobile-nav.tsx`**

- [ ] **Step 5: Smoke**

Logar como conta Pro (ou kill switch on) — 13 itens aparecem.
Logar como conta sem feature → some.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/sidebar.tsx src/components/layout/mobile-nav.tsx
git commit -m "feat(plan-gating): sidebar + mobile-nav filtram 13 itens por hasFeature"
```

#### Task 5.2: Aplicar `<FeatureGate>` em 4 botões inline identificados

**Files:**
- Modify: `src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx` (e variantes editar)
- Modify: `src/app/(dashboard)/dashboard/estoque/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/relatorios/page.tsx`

Para cada um:
- [ ] Identificar o botão/seção (ver lista em "Camada 4" da spec)
- [ ] Envolver com `<FeatureGate feature={FEATURES.X}>...</FeatureGate>`
- [ ] Smoke visual
- [ ] Commit

---

### Fase 6 — Seed planos pagos (Rollout passo 6)

#### Task 6.1: Criar `prisma/seed-plan-basico-features.ts`

**Files:**
- Create: `prisma/seed-plan-basico-features.ts`
- Create: `prisma/seed-plan-basico-features-rollback.ts`

- [ ] **Step 1: Criar script principal**

Copiar bloco "Seed/Migração de dados" da spec.

- [ ] **Step 2: Criar rollback**

```typescript
// prisma/seed-plan-basico-features-rollback.ts
import { PrismaClient } from "@prisma/client";
import { FEATURES } from "../src/lib/plan-feature-catalog";

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    const basico = await tx.plan.findUniqueOrThrow({ where: { slug: "basico" } });
    // Reverter preço
    await tx.plan.update({
      where: { id: basico.id },
      data: { priceMonthly: 14900, priceYearly: 149000 },
    });
    // Reverter 13 features → "true" no Básico
    for (const key of Object.values(FEATURES)) {
      await tx.planFeature.upsert({
        where: { planId_key: { planId: basico.id, key } },
        update: { value: "true" },
        create: { planId: basico.id, key, value: "true" },
      });
    }
  }, { timeout: 30_000 });
  console.log("✓ Rollback aplicado: Básico volta com 13 features=true, preço 14900");
}
main().finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Rodar em ambiente de TESTE (não prod!)**

Criar branch Neon de teste (como no QA anterior). Apontar `DATABASE_URL` temporariamente para o branch teste. Rodar:
```bash
DATABASE_URL="<test-branch-url>" npx tsx prisma/seed-plan-basico-features.ts
```
Expected: log de sucesso.

- [ ] **Step 4: Verificar idempotência**

Rodar de novo. Esperado: mesma saída, sem duplicatas em `PlanFeature`.

- [ ] **Step 5: Verificar rollback**

Rodar `npx tsx prisma/seed-plan-basico-features-rollback.ts` no branch teste. Confirmar `PlanFeature.value="true"` para as 13 keys.

- [ ] **Step 6: Deletar branch de teste do Neon**

```bash
npx neonctl branches delete <branch-id> --project-id purple-hill-80369768
```

- [ ] **Step 7: Commit**

```bash
git add prisma/seed-plan-basico-features.ts prisma/seed-plan-basico-features-rollback.ts
git commit -m "feat(plan-gating): seed atômico Básico=false + rollback"
```

#### Task 6.2: Rodar seed em PRODUÇÃO para os planos pagos APENAS

**⚠️ Operação manual. Não automatizar via CI inicialmente.**

- [ ] **Step 1: Backup**

```bash
pg_dump "$DATABASE_URL" --table=PlanFeature --table=Plan > backup-plans-$(date +%Y%m%d).sql
```

- [ ] **Step 2: Modificar temporariamente o script para SÓ atualizar planos pagos**

Adicionar flag `--paid-only` no script, ou criar uma cópia parcial só com o loop dos paid plans (sem mexer no Básico ainda).

- [ ] **Step 3: Rodar contra produção**

```bash
DATABASE_URL="$PROD_DATABASE_URL" npx tsx prisma/seed-plan-basico-features-paid-only.ts
```

- [ ] **Step 4: Verificar**

```sql
SELECT p.slug, pf.key, pf.value
FROM "Plan" p
JOIN "PlanFeature" pf ON pf."planId" = p.id
WHERE pf.key IN ('lens_treatments', 'cash_flow', 'sales_refunds')
  AND p.slug IN ('profissional', 'enterprise');
```
Esperado: 6 linhas com value="true".

---

### Fase 7 — ★ Flip do Básico + Kill Switch (Rollout passo 7) — DIA DO GO-LIVE

**⚠️ Operação manual coordenada com plano de comunicação D-7/D-3/D-0.**

#### Task 7.1: D-7 — Pré-análise de impacto

- [ ] **Step 1: Rodar query analítica**

```sql
SELECT DISTINCT c.id, c.name, c.email
FROM "Company" c
JOIN "Subscription" s ON s."companyId" = c.id AND s.status IN ('ACTIVE','TRIAL')
JOIN "Plan" p ON p.id = s."planId" AND p.slug = 'basico'
LEFT JOIN "AuditLog" al ON al."companyId" = c.id
  AND al."entityType" IN ('FinanceEntry','Refund','RecurringExpense','ReconciliationBatch','LensTreatment','StockTransfer','ChartOfAccounts','FinanceAccount','CardReceivable')
  AND al."createdAt" > NOW() - INTERVAL '30 days'
WHERE al.id IS NOT NULL
GROUP BY c.id;
```
Salvar resultado em `relatorio-impacto-D7.csv`.

- [ ] **Step 2: Enviar para CS**

Daniel CS recebe lista, prepara email D-3.

#### Task 7.2: D-3 — Email aos impactados (manual)

- [ ] **Step 1: CS envia email anunciando mudança + oferecendo trial Pro 30 dias gratuito.**

#### Task 7.3: D-0 — Rodar seed Básico + flip kill switch

- [ ] **Step 1: Backup completo**

```bash
pg_dump "$DATABASE_URL" --table=PlanFeature --table=Plan > backup-plans-D0-$(date +%Y%m%d-%H%M).sql
```

- [ ] **Step 2: Rodar seed completo (planos pagos JÁ atualizados; agora marca Básico)**

```bash
DATABASE_URL="$PROD_DATABASE_URL" npx tsx prisma/seed-plan-basico-features.ts
```
Esperado: log "✓ Plan Básico atualizado: 13 features=false, preço R$ 149,90".

- [ ] **Step 3: Verificar Básico**

```sql
SELECT pf.key, pf.value FROM "PlanFeature" pf
JOIN "Plan" p ON p.id = pf."planId"
WHERE p.slug = 'basico' AND pf.key IN ('lens_treatments','dre_report','sales_refunds');
```
Esperado: 3 linhas value="false".

```sql
SELECT slug, "priceMonthly", "priceYearly" FROM "Plan" WHERE slug = 'basico';
```
Esperado: priceMonthly=14990, priceYearly=149900.

- [ ] **Step 4: Flip kill switch no Vercel**

Painel Vercel → Environment Variables → setar `DISABLE_PLAN_FEATURE_GATING=false` (ou remover a variável).
Redeploy.

- [ ] **Step 5: Smoke test imediato em produção**

Login com conta de teste no Básico:
- Sidebar não mostra 13 itens
- `/dashboard/financeiro/dre` → redirect para `/dashboard?upgrade-required=dre_report`
- `curl -s -H "Cookie: <session>" https://prod/api/finance/entries` → 403 com code

Login com conta de teste no Profissional:
- 13 itens aparecem
- Páginas acessam normal

- [ ] **Step 6: D+0 — Monitorar suporte 24h**

CS prepara macro de resposta. Acompanhar tickets por palavra-chave "DRE", "devolução", "transferência", "lançamento".

#### Task 7.4: Se algo der ruim — reverter

- [ ] **Step 1: Flip kill switch de volta para `true` no Vercel + redeploy** (1 min)
- [ ] **Step 2: Investigar** — sem pressão de bloqueio.
- [ ] **Step 3: (Opcional) Rodar rollback do seed**

```bash
DATABASE_URL="$PROD_DATABASE_URL" npx tsx prisma/seed-plan-basico-features-rollback.ts
```

---

### Fase 8 — Landing atualiza pricing (Rollout passo 8)

#### Task 8.1: Atualizar `pricing-section.tsx` e `pricing.tsx`

**Files:**
- Modify: `src/components/home/pricing-section.tsx`
- Modify: `src/components/landing/pricing.tsx`

- [ ] **Step 1: Ler arquivos atuais**

`Read src/components/home/pricing-section.tsx`
`Read src/components/landing/pricing.tsx`

- [ ] **Step 2: Consumir registry para labels das features**

```typescript
import { FEATURE_REGISTRY, FEATURES } from "@/lib/plan-feature-catalog";

// Em vez de strings cruas, usar:
const featureList = Object.values(FEATURES).map((k) => ({
  key: k,
  label: FEATURE_REGISTRY[k].label,
  description: FEATURE_REGISTRY[k].description,
}));
```

- [ ] **Step 3: Garantir tabela ✓/✗ comparativa entre Básico/Profissional/Enterprise**

(Implementação UI depende do design atual do componente. Se já existe tabela, só atualizar o data source para o registry. Se não existe, adicionar uma section "Comparação completa".)

- [ ] **Step 4: Smoke visual**

`npm run dev`. Acessar `/` ou `/pricing` (a página real que renderiza esses componentes). Confirmar:
- Preço Básico R$ 149,90 aparece
- 13 features aparecem com ✓ em Profissional e ✗ em Básico

- [ ] **Step 5: Commit**

```bash
git add src/components/home/pricing-section.tsx src/components/landing/pricing.tsx
git commit -m "feat(landing): pricing consome FEATURE_REGISTRY + R$ 149,90"
```

---

### Fase 9 — Pós-rollout (Rollout passo 9)

#### Task 9.1: Monitorar 7 dias

- [ ] **Step 1: Dashboard de métricas**

Configurar (se já houver Sentry/Datadog):
- Contador de eventos `plan_features_lookup_failed` (warn)
- Contador de 403 com `code=PLAN_FEATURE_REQUIRED`
- Latência P95 do `(dashboard)/layout` rendering

- [ ] **Step 2: Daily check**

Por 7 dias, conferir tickets de suporte + métricas. Anotar:
- Quantos clientes Básicos pediram upgrade para Pro?
- Houve algum 500 inesperado?
- Algum bug visual na sidebar (item piscando)?

- [ ] **Step 3: Retrospectiva**

D+7: documentar lessons learned em `docs/retros/2026-XX-plano-basico-feature-gating.md` (se o projeto tiver pasta de retros — senão pular).

---

## Critérios de aceite gerais (do plan-as-a-whole)

- [ ] Todos os tests de Fase 0-6 passam (`npm test`)
- [ ] E2E (`npm run e2e`) passa nos 3 specs principais (basico-blocked, profissional-livre, kill-switch)
- [ ] Conta de teste Básica vê 13 telas bloqueadas em produção
- [ ] Conta de teste Profissional vê 13 telas livres em produção
- [ ] Admin troca plano: cache invalida na próxima request (max 5min)
- [ ] Kill switch testado em produção (flip on → tudo libera; flip off → tudo bloqueia)
- [ ] Landing exibe preço R$ 149,90 e tabela comparativa correta
- [ ] Sem regressão em fluxos não-gated (vendas no PDV, cancelar venda, receber AR, cashback, comissões)

---

## Dependências entre Fases

```
Fase 0 (setup tests) ──┐
                       ▼
Fase 1 (catálogo) ────┐
                      ├─► Fase 4 (gate + wrapper + APIs)
Fase 2 (/api/plan-features) ─┤
                      │
Fase 3 (FeatureGate) ─┘

Fase 4 ──► Fase 5 (sidebar/mobile-nav)
       └─► Fase 6 (seed planos pagos) ──► Fase 7 (★ flip Básico + kill switch)
                                              │
                                              └─► Fase 8 (landing)
                                                       │
                                                       └─► Fase 9 (monitoring)
```

Fase 0–6 podem ser implementadas em paralelo (várias devs). Fase 7 é a janela de risco — exige plano de comunicação executado nos D-7 e D-3.

---

## Notas para o executor

1. **Use o subagent-driven-development** se o objetivo for paralelizar — cada Fase pode virar um subagent isolado.
2. **Cada commit isolado é deployable.** O kill switch fica `true` em produção durante toda a Fase 4-6, então mesmo se algo for mergeado prematuramente em prod, nada bloqueia.
3. **Não pular testes.** Cada Task tem um Test antes da Implementation. Se algum teste falhar inexplicavelmente, parar e investigar — provavelmente o catálogo tem um path errado.
4. **Documente exceções.** Se um endpoint API listado nos `apiMatchers` precisar do wrapper desabilitado por algum motivo legítimo (ex: webhook de adquirente que precisa funcionar mesmo no Básico), adicione-o à `ALLOWLIST_PREFIXES` em `withPlanFeatureGuard` e documente o porquê no commit.
5. **Coordenação com CS.** Fase 7 não é puramente técnica — sem o email D-3 enviado, suporte vai explodir no D-0.
