# Plano Básico — Feature Gating das 13 Funcionalidades

**Status:** design revisado (architect-reviewed v2), aguardando re-review
**Autor:** Matheus + Claude
**Data:** 2026-05-25
**Tipo:** Mudança de escopo de plano + infraestrutura de feature gating

---

## Objetivo

Ajustar o plano **Básico** do SaaS (R$ 149,90/mês, slug `basico`) para excluir 13 funcionalidades hoje disponíveis. Garantir que, quando o admin colocar um cliente nesse plano (pelo dashboard de admin do SaaS), o sistema **esconde 100%** essas funcionalidades — sidebar, página direta e API. Espelhar a oferta na landing/site.

Sem quebrar o sistema, sem destruir dados existentes, sem afetar fluxos críticos do PDV (vendas, caixa, OS, clientes, produtos).

## 13 funcionalidades excluídas do Básico

| # | Funcionalidade | Justificativa de plano |
|---|---|---|
| 1 | Tratamentos de lente | Recurso óptico especializado |
| 2 | Transferências entre filiais | Cliente Básico tem 1 filial só |
| 3 | Comparativo de lojas (relatório) | Idem |
| 4 | DRE Dinâmico | Contábil/Gestão avançada |
| 5 | Fluxo de Caixa | Contábil/Gestão avançada |
| 6 | Lançamentos financeiros | Contábil/Gestão avançada |
| 7 | Contas financeiras | Contábil/Gestão avançada |
| 8 | Plano de contas | Contábil/Gestão avançada |
| 9 | Devoluções formais (Refund) | Operação avançada — cancelar venda no PDV continua livre |
| 10 | Conciliação bancária | Contábil/Gestão avançada |
| 11 | BI Analítico | Analytics avançado |
| 12 | Cartões (CardReceivable view) | Visão financeira avançada |
| 13 | Despesas recorrentes | Contábil/Gestão avançada |

## Escopo NÃO incluído (deliberadamente fora)

- Cancelar venda no PDV continua liberado em todos os planos
- Receber Contas a Receber (parcelas de crediário) continua liberado
- Recibo de pagamento continua liberado
- Estoque básico, ajuste manual, produtos, fornecedores continuam liberados
- Comissões/metas: mantém status atual (já gated por feature `goals`)
- Não há grandfathering — clientes hoje no Básico perdem acesso imediato (alinhado com o stakeholder)

---

## Arquitetura

Reusa 80% da infraestrutura existente:

| Componente existente | Reuso |
|---|---|
| `Plan` / `PlanFeature` / `Subscription` (Prisma) | Sem mudança de schema |
| `src/lib/plan-features.ts` (`requirePlanFeature`) | Adiciona chamadas |
| `src/components/plan/feature-gate.tsx` (`<FeatureGate />`) | Adiciona usos inline |
| `src/hooks/usePlanFeatures.ts` (`hasFeature`) | Adiciona usos na sidebar |
| `/admin/configuracoes/planos` (CRUD planos) | Sem mudança (talvez UI mais clara, opcional) |
| Landing `src/components/{home/pricing-section,landing/pricing}.tsx` | Consome catálogo novo |

Novos componentes:

1. **Catálogo central** `src/lib/plan-feature-catalog.ts` — `FEATURES` const + `FEATURE_REGISTRY` mapeando feature → rotas/APIs/labels
2. **Middleware Next.js** `src/middleware.ts` — bloqueio por rota usando o registry
3. **Cache de plan features** `src/lib/plan-features-cache.ts` — TTL 5min em memória + invalidação por companyId
4. **Seed/Migration de dados** `prisma/seed-plan-basico-features.ts` — idempotente, ajusta preço + 13 PlanFeature do Básico, garante presença nos planos pagos

---

## Catálogo central

`src/lib/plan-feature-catalog.ts`:

```typescript
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

/**
 * Um matcher pode ser:
 *  - string com prefixo exato: "/api/foo" casa "/api/foo", "/api/foo/", "/api/foo/bar"
 *  - RegExp: para dynamic segments (ex: /api/sales/[id]/refund)
 */
type PathMatcher = string | RegExp;

interface FeatureMeta {
  label: string;              // PT-BR p/ UI, landing, admin
  description: string;        // texto explicativo p/ landing
  pageMatchers: PathMatcher[]; // rotas dashboard a bloquear via middleware
  apiMatchers: PathMatcher[];  // APIs a bloquear via middleware
  sidebarKey?: string;        // chave do item na sidebar
}

// PATHS AUDITADOS contra src/app/api e src/app/(dashboard)/dashboard em 2026-05-25.
export const FEATURE_REGISTRY: Record<FeatureKey, FeatureMeta> = {
  [FEATURES.LENS_TREATMENTS]: {
    label: "Tratamentos de Lente",
    description: "Cadastro e gestão de tratamentos ópticos (anti-reflexo, fotossensível etc).",
    pageMatchers: ["/dashboard/tratamentos"],
    apiMatchers: ["/api/lens-treatments"],
    sidebarKey: "tratamentos",
  },
  [FEATURES.STOCK_TRANSFERS]: {
    label: "Transferências entre Filiais",
    description: "Mover estoque entre filiais com aprovação.",
    pageMatchers: ["/dashboard/estoque/transferencias"],
    apiMatchers: [
      "/api/stock-transfers",
      "/api/stock-movements/transfer", // caminho secundário usado pelo módulo de ajuste
    ],
    sidebarKey: "estoque-transferencias",
  },
  [FEATURES.BRANCH_COMPARISON]: {
    label: "Comparativo de Lojas",
    description: "Relatório comparando performance entre filiais.",
    pageMatchers: ["/dashboard/relatorios/comparativo-lojas"],
    apiMatchers: ["/api/reports/branch-comparison"],
    sidebarKey: "relatorios-comparativo",
  },
  [FEATURES.DRE_REPORT]: {
    label: "DRE Dinâmico",
    description: "Demonstrativo de Resultados do Exercício.",
    pageMatchers: ["/dashboard/financeiro/dre", "/dashboard/relatorios/dre"],
    apiMatchers: [
      "/api/finance/reports/dre",
      "/api/reports/financial/dre", // caminho legado
    ],
    sidebarKey: "financeiro-dre",
  },
  [FEATURES.CASH_FLOW]: {
    label: "Fluxo de Caixa",
    description: "Projeção e histórico de fluxo de caixa.",
    pageMatchers: ["/dashboard/financeiro/fluxo-caixa"],
    apiMatchers: ["/api/finance/reports/cash-flow"],
    sidebarKey: "financeiro-fluxo",
  },
  [FEATURES.FINANCE_ENTRIES]: {
    label: "Lançamentos Financeiros",
    description: "Listagem e gestão manual de lançamentos contábeis.",
    pageMatchers: ["/dashboard/financeiro/lancamentos"],
    apiMatchers: ["/api/finance/entries"],
    sidebarKey: "financeiro-lancamentos",
  },
  [FEATURES.FINANCE_ACCOUNTS]: {
    label: "Contas Financeiras",
    description: "Contas bancárias, caixa e cartão.",
    pageMatchers: ["/dashboard/financeiro/contas"],
    apiMatchers: ["/api/finance/accounts"],
    sidebarKey: "financeiro-contas",
  },
  [FEATURES.CHART_OF_ACCOUNTS]: {
    label: "Plano de Contas",
    description: "Plano de contas contábil personalizado.",
    pageMatchers: ["/dashboard/financeiro/plano-contas"],
    apiMatchers: ["/api/finance/chart"],
    sidebarKey: "financeiro-plano",
  },
  [FEATURES.SALES_REFUNDS]: {
    label: "Devoluções",
    description: "Workflow formal de devolução de mercadoria.",
    pageMatchers: ["/dashboard/financeiro/devolucoes"],
    apiMatchers: [
      // Dynamic segment :id — precisa regex
      /^\/api\/sales\/[^/]+\/refund(?:s)?(?:\/.*)?$/,
    ],
    sidebarKey: "financeiro-devolucoes",
  },
  [FEATURES.BANK_RECONCILIATION]: {
    label: "Conciliação Bancária",
    description: "Importação e match de extratos bancários.",
    pageMatchers: ["/dashboard/financeiro/conciliacao"],
    apiMatchers: ["/api/finance/reconciliation"],
    sidebarKey: "financeiro-conciliacao",
  },
  [FEATURES.BI_ANALYTICS]: {
    label: "BI Analítico",
    description: "Dashboards analíticos avançados.",
    pageMatchers: ["/dashboard/financeiro/bi"],
    apiMatchers: ["/api/finance/bi", "/api/finance/aggregate"],
    sidebarKey: "financeiro-bi",
  },
  [FEATURES.CARD_RECEIVABLES]: {
    label: "Cartões",
    description: "Visão de recebíveis de cartão e previsão.",
    pageMatchers: ["/dashboard/financeiro/cartoes"],
    apiMatchers: ["/api/finance/card-receivables"],
    sidebarKey: "financeiro-cartoes",
  },
  [FEATURES.RECURRING_EXPENSES]: {
    label: "Despesas Recorrentes",
    description: "Cadastro de despesas fixas com agenda recorrente.",
    pageMatchers: ["/dashboard/financeiro/despesas-recorrentes"],
    apiMatchers: ["/api/recurring-expenses"], // sem prefixo /finance
    sidebarKey: "financeiro-despesas",
  },
};

/**
 * Helper único de match. Reusa em middleware, testes, FeatureGate.
 */
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

---

## Camadas de Enforcement

### Camada 1 — Middleware Next.js (`src/middleware.ts`)

**Runtime: Node.js (não Edge).** Decisão crítica: middleware roda como Node Function (`export const runtime = "nodejs"`, suportado desde Next 14.1). Justificativa:
- Prisma não roda em Edge runtime.
- O middleware precisa chamar `getCachedPlanFeatures()` que consulta `Subscription`+`PlanFeature` via Prisma.
- Alternativa rejeitada: middleware Edge fazendo `fetch` interno a um endpoint Node — duplica latência e introduz ponto de falha.

**Já existe middleware no projeto** em `src/middleware.ts` cuidando de auth admin (jose.jwtVerify Edge-safe). Precisamos:
1. Mover o middleware existente para `runtime: "nodejs"`, OU
2. Compor: middleware Edge atual chama um novo gate Node via redirect interno, OU
3. Mover o feature-gating para `(dashboard)/layout.tsx` server component (mais simples, não toca middleware existente)

**Decisão recomendada:** opção 3 (não tocar no middleware existente, fazer gating no `layout.tsx`). Layout do dashboard já é server component (não-Edge), tem acesso a `auth()` e Prisma, e roda em toda navegação.

```typescript
// src/app/(dashboard)/layout.tsx (esqueleto adicional ao layout existente)
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCachedPlanFeatures } from "@/lib/plan-features-cache";
import { findBlockedFeature } from "@/lib/plan-feature-catalog";
import { headers } from "next/headers";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");

  // Kill switch
  if (process.env.DISABLE_PLAN_FEATURE_GATING !== "true") {
    const headersList = await headers();
    const path = headersList.get("x-current-path") ?? "";

    // Fail-open: erro de DB libera a request com log.
    let features: Record<string, boolean> | null = null;
    try {
      const cached = await getCachedPlanFeatures(session.user.companyId);
      features = cached.features;
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "plan_features_lookup_failed",
          companyId: session.user.companyId,
          path,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      // segue sem bloquear
    }

    if (features) {
      const blocked = findBlockedFeature(path, features);
      if (blocked) {
        redirect(`/dashboard?upgrade-required=${blocked}`);
      }
    }
  }

  return <>{children}</>;
}
```

Para que o layout enxergue `x-current-path`, o middleware Edge precisa setar o header **no REQUEST** (não no response), usando o padrão oficial Next 14:

```typescript
// src/middleware.ts (adição mínima, mantém Edge runtime)
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  // ... lógica existente de admin auth ...

  // Reescrever request headers para o server component enxergar.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-current-path", req.nextUrl.pathname);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}
```

**Por que `request.headers` e não `res.headers.set`:** `res.headers` escreve no response (visível ao browser/client); `request.headers` reescreve o request que o server component recebe. `headers()` do `next/headers` lê os request headers, não response.

Para bloqueio de **APIs**, não dá pra usar layout. Cada handler de API precisa chamar `requirePlanFeature` no topo (Camada 2). Para um único ponto de falha menor, criar wrapper que **preserva a assinatura `(req, ctx)`** do Next 14 (necessária para handlers com dynamic segments como `[id]`):

```typescript
// src/lib/with-plan-feature.ts
import { auth } from "@/auth";
import { getCachedPlanFeatures } from "@/lib/plan-features-cache";
import { findBlockedFeature } from "@/lib/plan-feature-catalog";
import { NextResponse } from "next/server";

// Tipo genérico para route context (Next 14: { params: Promise<Record<string,string>> })
type RouteContext = { params: Promise<Record<string, string>> };

const ALLOWLIST_PREFIXES = [
  "/api/auth",
  "/api/plan-features",
  "/api/admin",
  "/api/health",
];

export function withPlanFeatureGuard<C extends RouteContext = RouteContext>(
  handler: (req: Request, ctx: C) => Promise<Response>,
): (req: Request, ctx: C) => Promise<Response> {
  return async (req: Request, ctx: C) => {
    if (process.env.DISABLE_PLAN_FEATURE_GATING === "true") return handler(req, ctx);

    const path = new URL(req.url).pathname;
    if (ALLOWLIST_PREFIXES.some((p) => path.startsWith(p))) return handler(req, ctx);

    const session = await auth();
    if (!session?.user?.companyId) return handler(req, ctx); // delega ao handler para 401

    // Fail-open em erro de DB: log + libera a request.
    let features: Record<string, boolean>;
    try {
      const cached = await getCachedPlanFeatures(session.user.companyId);
      features = cached.features;
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "plan_features_lookup_failed",
          companyId: session.user.companyId,
          path,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return handler(req, ctx); // fail-open
    }

    const blocked = findBlockedFeature(path, features);
    if (blocked) {
      return NextResponse.json(
        { error: { code: "PLAN_FEATURE_REQUIRED", feature: blocked } },
        { status: 403 },
      );
    }
    return handler(req, ctx);
  };
}
```

Cada handler API listado nos `apiMatchers` envolve seu export, preservando `(req, ctx)`:

```typescript
// Exemplo: src/app/api/sales/[id]/refunds/route.ts
export const GET = withPlanFeatureGuard(async (req, { params }) => {
  const { id } = await params;
  // ... resto do handler
});
```

Redundante com `requirePlanFeature` interno mas centraliza o catálogo. **Crítico:** assinatura `(req, ctx)` é obrigatória — 5 dos 13 grupos de APIs têm dynamic segments (refunds, recurring-expenses/[id], finance/accounts/[id], reconciliation/batches/[id], stock-transfers/[id]).

`findBlockedFeature(path, features)`:
```typescript
import { FEATURE_REGISTRY, pathMatchesAny, type FeatureKey } from "./plan-feature-catalog";

export function findBlockedFeature(
  path: string,
  features: Record<string, boolean>,
): FeatureKey | null {
  for (const [key, meta] of Object.entries(FEATURE_REGISTRY)) {
    if (features[key] === true) continue; // habilitada
    if (pathMatchesAny(path, meta.pageMatchers)) return key as FeatureKey;
    if (pathMatchesAny(path, meta.apiMatchers)) return key as FeatureKey;
  }
  return null;
}
```

**Allow-list de hot paths (não passa pelo guard):**
- `/api/auth/*` — NextAuth handlers
- `/api/plan-features` — usado pelo hook usePlanFeatures (recursão se não excluído)
- `/api/health`, `/api/admin-auth/*`
- Assets estáticos (já fora do matcher por construção)

Implementar como early-return em `withPlanFeatureGuard`:
```typescript
const ALLOWLIST_PREFIXES = ["/api/auth", "/api/plan-features", "/api/admin", "/api/health"];
if (ALLOWLIST_PREFIXES.some((p) => path.startsWith(p))) return handler(req);
```

### Camada 2 — API endpoints (`requirePlanFeature`)

Para cada API listada nos `apiPrefixes` do catálogo, adicionar `await requirePlanFeature(companyId, FEATURES.X)` no topo do handler. Redundante com middleware (defesa em profundidade).

### Camada 3 — Sidebar (`src/components/layout/sidebar.tsx` + `mobile-nav.tsx`)

Estender config de items com `requiresFeature?: FeatureKey` e filtrar antes do render:

```typescript
const navItems = [
  // ... existentes
  { label: "Tratamentos", href: "/dashboard/tratamentos",
    requiresFeature: FEATURES.LENS_TREATMENTS, sidebarKey: "tratamentos" },
  // ... 12 outros
];

const visible = navItems.filter(
  (i) => !i.requiresFeature || hasFeature(i.requiresFeature),
);
```

### Camada 4 — Botões inline (`<FeatureGate />`)

Locais identificados onde botões precisam ser escondidos dentro de páginas liberadas:

- `src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx` — botão "Devolver mercadoria" → `<FeatureGate feature={FEATURES.SALES_REFUNDS}>`
- `src/app/(dashboard)/dashboard/ordens-servico/{nova,[id]/editar}/page.tsx` — seletor de Tratamentos → `<FeatureGate feature={FEATURES.LENS_TREATMENTS}>`
- `src/app/(dashboard)/dashboard/estoque/page.tsx` — botão "Nova transferência" → `<FeatureGate feature={FEATURES.STOCK_TRANSFERS}>`
- `src/app/(dashboard)/dashboard/relatorios/page.tsx` — index de relatórios: filtrar os 2 que dependem de features (comparativo-lojas, dre)

---

## Cache de Plan Features

`src/lib/plan-features-cache.ts`:

```typescript
import { LRUCache } from "lru-cache"; // já no node_modules (NextAuth depende)
import { getSubscriptionInfo } from "@/lib/subscription";

interface CachedFeatures {
  features: Record<string, boolean>;
  // null indica "sem subscription = libera tudo" (modo accessEnabled);
  // diferente de {} que é "subscription explícita sem features true"
  hasSubscription: boolean;
}

// LRU com cap em 500 empresas e TTL 5min.
const cache = new LRUCache<string, CachedFeatures>({
  max: 500,
  ttl: 5 * 60 * 1000,
});

export async function getCachedPlanFeatures(
  companyId: string,
): Promise<{ features: Record<string, boolean>; hasSubscription: boolean }> {
  const hit = cache.get(companyId);
  if (hit) return hit;

  let info;
  try {
    info = await getSubscriptionInfo(companyId);
  } catch (err) {
    // DB falhou — NÃO armazena no cache (evita cache poisoning de erro).
    // Lança para o caller decidir comportamento de fail-open ou fail-closed.
    throw err;
  }

  const value: CachedFeatures = info?.features
    ? {
        features: Object.fromEntries(
          Object.entries(info.features).map(([k, v]) => [k, v === "true"]),
        ),
        hasSubscription: true,
      }
    : { features: {}, hasSubscription: false };

  cache.set(companyId, value);
  return value;
}

export function invalidatePlanFeaturesCache(companyId: string) {
  cache.delete(companyId);
}
```

**Comportamento de fail-open:** `findBlockedFeature` e o layout/wrapper devem tratar a exceção do `getCachedPlanFeatures` como "não bloquear" (fail-open). Justificativa: indisponibilidade de DB transitória não deve bloquear a UI inteira do cliente. Em troca, logar com `level: warn` e contar métrica.

**Sem subscription (`hasSubscription: false`):** modo `accessEnabled`/admin/contas de teste. Não aplica bloqueio. Comportamento já existente em `requirePlanFeature` (linhas 19-20).

**Invalidação:** chamada em `subscriptionService.changePlan(companyId, newPlanId)` e no endpoint admin de troca de plano.

**Cuidado serverless:** em deploy Vercel cada lambda tem seu próprio cache. Aceitável — em até 5min todas convergem. Se quiser invalidação cross-instance, usar Redis (fora de escopo dessa entrega).

---

## Seed/Migração de dados

`prisma/seed-plan-basico-features.ts` — idempotente, em **transação atômica**:

```typescript
import { PrismaClient } from "@prisma/client";
import { FEATURES } from "../src/lib/plan-feature-catalog";

const prisma = new PrismaClient();

// Planos considerados "pagos" (recebem todas as 13 features = true).
// Auditar contra prisma/seed-plans.ts: hoje existem "basico", "profissional", "enterprise".
// "premium" só será incluído se for criado posteriormente.
const PAID_PLAN_SLUGS = ["profissional", "enterprise"];

async function main() {
  await prisma.$transaction(async (tx) => {
    // 1) Atualiza preço do Básico
    const basico = await tx.plan.findUniqueOrThrow({ where: { slug: "basico" } });
    await tx.plan.update({
      where: { id: basico.id },
      data: { priceMonthly: 14990, priceYearly: 149900 },
    });

    // 2) Garante 13 features = "false" no Básico
    for (const key of Object.values(FEATURES)) {
      await tx.planFeature.upsert({
        where: { planId_key: { planId: basico.id, key } },
        update: { value: "false" },
        create: { planId: basico.id, key, value: "false" },
      });
    }

    // 3) Garante 13 features = "true" em planos pagos
    for (const slug of PAID_PLAN_SLUGS) {
      const plan = await tx.plan.findUnique({ where: { slug } });
      if (!plan) {
        console.warn(`[seed] Plano ${slug} não encontrado — pulando (verificar se foi removido).`);
        continue;
      }
      for (const key of Object.values(FEATURES)) {
        await tx.planFeature.upsert({
          where: { planId_key: { planId: plan.id, key } },
          update: { value: "true" },
          create: { planId: plan.id, key, value: "true" },
        });
      }
    }
  }, { timeout: 30_000 });

  console.log("✓ Plan Básico atualizado: 13 features=false, preço R$ 149,90");
  console.log(`✓ Planos pagos (${PAID_PLAN_SLUGS.join(", ")}): 13 features=true`);
}

main().finally(() => prisma.$disconnect());
```

Rodável via `npx tsx prisma/seed-plan-basico-features.ts`. Não altera schema. Não destrói dados de cliente.

**Atenção destrutiva:** o seed sobrescreve `PlanFeature.value` das 13 keys nos planos pagos. Se algum cliente em plano pago tem essas features explicitamente como `"false"` (configuração custom), elas viram `"true"`. Hoje não há esse cenário (features estão ausentes nos planos pagos). Documentar na release notes.

**Rollback do seed:** `prisma/seed-plan-basico-features-rollback.ts` reverte para `value: "true"` em todas as 13 keys do Básico (caso a mudança de escopo precise ser revertida sem rotear pelo kill switch).

---

## Site/Landing

`src/components/home/pricing-section.tsx` + `src/components/landing/pricing.tsx`:
- Leem `Plan.features` do banco (já implementado). Após o seed, exibem corretamente.
- Refatorar para consumir o `FEATURE_REGISTRY` em vez de strings cruas — usa `label` do catálogo para os nomes.
- Mostrar tabela comparativa explícita com ✓/✗ para todas as 13 features entre os planos existentes (Básico, Profissional, Enterprise).

## Endpoint `/api/plan-features` — atualização obrigatória

Hoje em `src/app/api/plan-features/route.ts:7` há um array hardcoded `ALL_FEATURES` com 6 features (`crm`, `goals`, `campaigns`, `cashback`, `multi_branch`, `reports_advanced`). Esse endpoint é consumido pelo hook `usePlanFeatures` no cliente.

**Mudanças obrigatórias:**

1. Adicionar as 13 keys novas ao array, para que contas com `accessEnabled=true` (admin SaaS, contas de teste sem subscription) continuem vendo TUDO liberado:

```typescript
// src/app/api/plan-features/route.ts
import { FEATURES } from "@/lib/plan-feature-catalog";

const ALL_FEATURES = [
  // legacy
  "crm", "goals", "campaigns", "cashback", "multi_branch", "reports_advanced",
  // 13 novas (consumidas do catálogo central)
  ...Object.values(FEATURES),
];
```

2. Honrar o kill switch:

```typescript
if (process.env.DISABLE_PLAN_FEATURE_GATING === "true") {
  return NextResponse.json({
    features: Object.fromEntries(ALL_FEATURES.map((k) => [k, "true"])),
  });
}
```

Sem essas duas mudanças, o kill switch fica inconsistente entre backend e UI, e admins SaaS perdem acesso visual às 13 features.

## Componente `<FeatureGate />` — refator menor

Hoje (`src/components/plan/feature-gate.tsx`) o componente exige prop `featureName: string` para a mensagem de upgrade. Refatorar para inferir do registry quando não passado:

```typescript
interface FeatureGateProps {
  feature: FeatureKey;
  featureName?: string; // override opcional
  children: React.ReactNode;
}

export function FeatureGate({ feature, featureName, children }: FeatureGateProps) {
  const { hasFeature, loading } = usePlanFeatures();
  if (loading) return null;
  if (hasFeature(feature)) return <>{children}</>;
  const label = featureName ?? FEATURE_REGISTRY[feature]?.label ?? feature;
  return <UpgradeBadge feature={label} />;
}
```

Fonte única de verdade — label aparece consistentemente na landing, na sidebar (tooltip), e no badge inline.

---

## Admin SaaS

`/admin/configuracoes/planos` — sem mudança obrigatória; CRUD genérico de planos+features já funciona. Opcional: UI dedicada que lista as 13 features do catálogo como checkboxes.

`/admin/companies/[id]` — adicionar:
- Dropdown "Plano atual" (lê `Subscription.planId`)
- Tabela das 13 features com status efetivo
- Botão "Aplicar mudança de plano" → muda `Subscription.planId` + chama `invalidatePlanFeaturesCache(companyId)`

---

## Testes

### Unit
- `plan-feature-catalog.test.ts`: cobertura — toda `FEATURES.X` tem `FEATURE_REGISTRY[X]` válido
- `findBlockedFeature.test.ts`: 13 casos positivos (path bate, feature false → retorna key) + 13 negativos (feature true → retorna null) + path fora do catálogo → null
- `requirePlanFeature` (já tem): cobrir os 3 caminhos
- `plan-features-cache.test.ts`: hit dentro do TTL, miss após TTL, invalidação manual

### Integration (DB de teste)
- Seed rodado 2x → mesmo resultado, sem duplicatas
- Após seed: `Plan.findUnique({slug:'basico'}).features` tem todas as 13 keys como "false"
- Após seed: `Plan.findUnique({slug:'profissional'}).features` tem todas as 13 keys como "true"

### E2E (Playwright)
- Login como conta no Básico → sidebar não lista os 13 itens
- Acessar `/dashboard/financeiro/dre` direto via URL → redirect + toast
- `POST /api/finance/entries` via fetch autenticado → 403 com `code:PLAN_FEATURE_REQUIRED`
- Login como conta no Profissional → 13 itens visíveis; acesso livre
- Admin troca cliente PRO→BASIC: após cache invalidate, cliente perde acesso

---

## Plano de Rollout (revisado — 9 passos)

Cada passo é deployável independentemente; o "switch" real é o Passo 7.

```
0. Pré-rollout: análise de impacto (1 dia antes do Passo 7)
   - SQL: empresas em Básico que usaram qualquer das 13 features no último mês.
   - Decidir: notificar e oferecer trial Pro 30d, ou bloquear sem aviso?
   - Aliar com produto/CS sobre comunicação (ver "Plano de Comunicação" abaixo).

1. Catálogo + helpers + cache LRU       (deploy)   nenhum efeito (não há matchers ativos ainda)
2. /api/plan-features inclui 13 keys   (deploy)   ALL_FEATURES atualizado; sem subscription = livre
3. <FeatureGate> refatorado            (deploy)   nenhum efeito (feature ainda não está em nenhum lugar)
4. (dashboard)/layout.tsx com gate     (deploy)   ⚠ DISABLE_PLAN_FEATURE_GATING=true em prod por padrão
                                                  Nada bloqueia ainda.
   + withPlanFeatureGuard nos 13 grupos de API
   + middleware existente seta x-current-path header
   + requirePlanFeature continua nos handlers (defesa interna)
5. Sidebar/MobileNav com requiresFeature  (deploy) hasFeature retorna true sem PlanFeature → segue mostrando
6. Seed planos pagos = true             (run)      planos pagos ganham todas as 13 features
                                                   ainda sem efeito (Básico ainda livre).
7. ★ Seed Básico = false + preço 14990  (run + flip)
   E flip do kill switch: DISABLE_PLAN_FEATURE_GATING=false
   ⚠ Aqui clientes do Básico perdem acesso. Smoke test em conta de teste IMEDIATAMENTE.
8. Landing atualiza pricing visual      (deploy)   reflete preço novo + feature list
9. Pós-rollout: monitorar suporte e métricas por 7 dias
```

**Atomicidade do Passo 7:** o seed E o flip do kill switch devem acontecer juntos. Sugestão operacional: rodar o seed primeiro (atomic via $transaction); só após sucesso, fazer `vercel env rm DISABLE_PLAN_FEATURE_GATING` ou setar `false` no painel. Janela de inconsistência < 1 minuto.

## Kill Switch

`DISABLE_PLAN_FEATURE_GATING=true` em env vars curto-circuita TODAS as 4 camadas de enforcement. Roda imediatamente sem deploy.

**Pontos de aplicação (todos obrigatórios para consistência):**

```typescript
// 1. src/lib/plan-features.ts (requirePlanFeature)
export async function requirePlanFeature(companyId: string, feature: FeatureKey) {
  if (process.env.DISABLE_PLAN_FEATURE_GATING === "true") return;
  // resto...
}

// 2. src/app/(dashboard)/layout.tsx
if (process.env.DISABLE_PLAN_FEATURE_GATING !== "true") {
  // checagem de blocked
}

// 3. src/lib/with-plan-feature.ts (wrapper de API)
if (process.env.DISABLE_PLAN_FEATURE_GATING === "true") return handler(req);

// 4. src/app/api/plan-features/route.ts (UI)
if (process.env.DISABLE_PLAN_FEATURE_GATING === "true") {
  return NextResponse.json({
    features: Object.fromEntries(ALL_FEATURES.map((k) => [k, "true"])),
  });
}
```

Quando kill switch está ligado, sidebar mostra tudo, FeatureGate libera tudo, API responde, layout não redireciona. Estado consistente entre frontend e backend.

**Modo de uso:** ligar via painel Vercel (`DISABLE_PLAN_FEATURE_GATING=true`) e fazer redeploy de zero-config (env var change). Em emergência: trocar o valor invalida cache de features de todos os clientes na próxima request (TTL 5min).

---

## Plano de Comunicação

Mesmo sem grandfathering automático, é responsabilidade aliar com produto/CS antes do Passo 7:

1. **D-7 antes do flip:** rodar query analítica e exportar lista de empresas Básicas que tocaram em qualquer das 13 features no último mês.
   ```sql
   -- Empresas Básicas que usaram DRE recentemente (exemplo)
   SELECT DISTINCT c.id, c.name, c.email, MAX(al."createdAt") as ultima_acao
   FROM "Company" c
   JOIN "Subscription" s ON s."companyId" = c.id AND s.status IN ('ACTIVE','TRIAL')
   JOIN "Plan" p ON p.id = s."planId" AND p.slug = 'basico'
   LEFT JOIN "AuditLog" al ON al."companyId" = c.id
     AND al."entityType" = 'FinanceEntry'
     AND al."createdAt" > NOW() - INTERVAL '30 days'
   WHERE al.id IS NOT NULL
   GROUP BY c.id;
   ```
2. **D-3:** email com aviso da mudança + oferta de trial Profissional 30 dias gratuito para os impactados.
3. **D-0 (Passo 7):** suporte preparado com macro de resposta para "perdi acesso a X".
4. **D+7:** monitorar tickets de suporte e métricas de upgrade Básico→Profissional.

## Riscos identificados e mitigação

| Risco | Mitigação |
|---|---|
| Cliente Básico perde fluxo crítico não listado | Confirmado: cancelar venda + recebimento de AR + cashback ficam liberados |
| Middleware atrasa request (cache miss) | Cache 5min em memória; query simples; warm-up implícito |
| Cache stale após mudança de plano | `invalidatePlanFeaturesCache(companyId)` em `changePlan` + endpoint admin |
| FinanceEntry continua gerando para Básico | Intencional. Backend mantém integridade. UI escondida. Upgrade futuro vê tudo. |
| Bug `branch_stocks.cost_price` (drift schema do QA anterior) | Independente; resolver em release separada para não acoplar riscos |
| Cancelar venda confundido com Devolução | Cancelar = `saleService.cancel` (livre). Devolução = `/financeiro/devolucoes` com modelo `Refund` (gated). |
| Falha de invalidação cross-lambda (Vercel) | Aceitável — convergência em 5min. Redis fora de escopo. |

---

## Critérios de aceite

### Funcionais
- [ ] Catálogo `src/lib/plan-feature-catalog.ts` com 13 features + registry com `pageMatchers` (string|RegExp) e `apiMatchers` (string|RegExp), incluindo dynamic segments para `/api/sales/[id]/refund(s)`
- [ ] `(dashboard)/layout.tsx` redireciona para `/dashboard?upgrade-required=<feature>` quando rota bloqueada (Node runtime, usa Prisma + cache)
- [ ] Wrapper `withPlanFeatureGuard` aplicado nas 13 famílias de API (allow-list para `/api/auth`, `/api/plan-features`, `/api/admin`, `/api/health`)
- [ ] `requirePlanFeature` continua no topo dos handlers das 13 APIs (defesa em profundidade)
- [ ] Sidebar + MobileNav filtram itens por `hasFeature`
- [ ] `<FeatureGate>` refatorado: infere `featureName` do registry; aplicado nos 4 pontos inline
- [ ] `/api/plan-features` retorna as 13 keys novas no `ALL_FEATURES` (para contas `accessEnabled`)

### Dados
- [ ] Seed roda dentro de `prisma.$transaction` atômica
- [ ] Seed atualiza preço Básico (14990 / 149900)
- [ ] Seed marca 13 features=false no Básico; 13 features=true em `["profissional", "enterprise"]`
- [ ] Seed loga warning quando plano não encontrado (em vez de continue silencioso)
- [ ] Seed roda 2x = mesmo estado final (idempotente)
- [ ] Rollback script `seed-plan-basico-features-rollback.ts` existe e funciona

### Cache e performance
- [ ] Cache LRU com `max: 500` empresas e `ttl: 5min`
- [ ] Erros de DB não corrompem cache (não armazena exception)
- [ ] Cache invalidado via `invalidatePlanFeaturesCache(companyId)` em `subscriptionService.changePlan` e admin endpoint de troca de plano
- [ ] Latência adicional do gate no layout: P95 < 50ms (medir antes/depois)

### Kill switch
- [ ] `DISABLE_PLAN_FEATURE_GATING=true` curto-circuita: `requirePlanFeature`, layout gate, withPlanFeatureGuard, `/api/plan-features`
- [ ] Com kill switch ligado, cliente Básico vê todas as 13 telas como se fosse Pro
- [ ] Com kill switch ligado, sidebar não esconde nada

### Comportamentos especiais
- [ ] Cliente com `Subscription = null` (modo `accessEnabled`) NÃO é bloqueado
- [ ] Cliente com DB indisponível NÃO é bloqueado (fail-open com log warn)
- [ ] Sale.cancel (do PDV) continua livre em todos os planos
- [ ] Receber AccountReceivable continua livre em todos os planos

### Testes
- [ ] Unit: `pathMatchesAny` (string + regex), `findBlockedFeature` (13 positivos + 13 negativos), `requirePlanFeature` (3 cases)
- [ ] Integration: seed em DB de teste, idempotência, rollback
- [ ] E2E: Básico bloqueado, Pro livre, troca de plano invalida cache, kill switch funciona

### Site/Admin
- [ ] Landing exibe preço R$ 149,90 e tabela ✓/✗ correta entre Básico/Profissional/Enterprise
- [ ] Landing consome `label` do `FEATURE_REGISTRY`
- [ ] Admin `/admin/companies/[id]` permite trocar plano + invalida cache automaticamente

### Smoke test pós-rollout
- [ ] Conta de teste Básico: 13 telas redirecionam; APIs respondem 403
- [ ] Conta de teste Profissional: 13 telas livres
- [ ] Admin troca conta de teste Pro → Básico em runtime; próxima request reflete

## Não-objetivos

- Não implementa Redis nem invalidação cross-region
- Não implementa "trial gracioso" de feature (cliente teste 7 dias antes de bloqueio)
- Não implementa exportação automática de dados ao downgrade
- Não corrige bugs pré-existentes do QA (branch_stocks drift, timeout 5s do saleService — release separada)

---

## Próximos passos após aprovação desta spec

1. Review automático via `spec-document-reviewer` subagent
2. Review humano (você)
3. Após aprovação humana: invocar skill `writing-plans` para gerar plano de execução
4. Execução em fases conforme rollout acima
