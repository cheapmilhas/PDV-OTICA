# Plano Básico — Feature Gating das 13 Funcionalidades

**Status:** design aprovado, aguardando spec review
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

interface FeatureMeta {
  label: string;            // PT-BR p/ UI, landing, admin
  description: string;      // texto explicativo p/ landing
  pageRoutes: string[];     // rotas dashboard a bloquear via middleware
  apiPrefixes: string[];    // prefixes de API a bloquear via middleware
  sidebarKey?: string;      // chave do item na sidebar
}

export const FEATURE_REGISTRY: Record<FeatureKey, FeatureMeta> = {
  [FEATURES.LENS_TREATMENTS]: {
    label: "Tratamentos de Lente",
    description: "Cadastro e gestão de tratamentos ópticos (anti-reflexo, fotossensível etc).",
    pageRoutes: ["/dashboard/tratamentos"],
    apiPrefixes: ["/api/lens-treatments"],
    sidebarKey: "tratamentos",
  },
  [FEATURES.STOCK_TRANSFERS]: {
    label: "Transferências entre Filiais",
    description: "Mover estoque entre filiais com aprovação.",
    pageRoutes: ["/dashboard/estoque/transferencias"],
    apiPrefixes: ["/api/stock-transfers"],
    sidebarKey: "estoque-transferencias",
  },
  [FEATURES.BRANCH_COMPARISON]: {
    label: "Comparativo de Lojas",
    description: "Relatório comparando performance entre filiais.",
    pageRoutes: ["/dashboard/relatorios/comparativo-lojas"],
    apiPrefixes: ["/api/reports/branch-comparison"],
    sidebarKey: "relatorios-comparativo",
  },
  [FEATURES.DRE_REPORT]: {
    label: "DRE Dinâmico",
    description: "Demonstrativo de Resultados do Exercício.",
    pageRoutes: ["/dashboard/financeiro/dre", "/dashboard/relatorios/dre"],
    apiPrefixes: ["/api/finance/reports/dre"],
    sidebarKey: "financeiro-dre",
  },
  [FEATURES.CASH_FLOW]: {
    label: "Fluxo de Caixa",
    description: "Projeção e histórico de fluxo de caixa.",
    pageRoutes: ["/dashboard/financeiro/fluxo-caixa"],
    apiPrefixes: ["/api/finance/reports/cash-flow"],
    sidebarKey: "financeiro-fluxo",
  },
  [FEATURES.FINANCE_ENTRIES]: {
    label: "Lançamentos Financeiros",
    description: "Listagem e gestão manual de lançamentos contábeis.",
    pageRoutes: ["/dashboard/financeiro/lancamentos"],
    apiPrefixes: ["/api/finance/entries"],
    sidebarKey: "financeiro-lancamentos",
  },
  [FEATURES.FINANCE_ACCOUNTS]: {
    label: "Contas Financeiras",
    description: "Contas bancárias, caixa e cartão.",
    pageRoutes: ["/dashboard/financeiro/contas"],
    apiPrefixes: ["/api/finance/accounts"],
    sidebarKey: "financeiro-contas",
  },
  [FEATURES.CHART_OF_ACCOUNTS]: {
    label: "Plano de Contas",
    description: "Plano de contas contábil personalizado.",
    pageRoutes: ["/dashboard/financeiro/plano-contas"],
    apiPrefixes: ["/api/finance/chart"],
    sidebarKey: "financeiro-plano",
  },
  [FEATURES.SALES_REFUNDS]: {
    label: "Devoluções",
    description: "Workflow formal de devolução de mercadoria.",
    pageRoutes: ["/dashboard/financeiro/devolucoes"],
    apiPrefixes: ["/api/sales/refunds"],
    sidebarKey: "financeiro-devolucoes",
  },
  [FEATURES.BANK_RECONCILIATION]: {
    label: "Conciliação Bancária",
    description: "Importação e match de extratos bancários.",
    pageRoutes: ["/dashboard/financeiro/conciliacao"],
    apiPrefixes: ["/api/finance/reconciliation"],
    sidebarKey: "financeiro-conciliacao",
  },
  [FEATURES.BI_ANALYTICS]: {
    label: "BI Analítico",
    description: "Dashboards analíticos avançados.",
    pageRoutes: ["/dashboard/financeiro/bi"],
    apiPrefixes: ["/api/finance/bi", "/api/finance/aggregate"],
    sidebarKey: "financeiro-bi",
  },
  [FEATURES.CARD_RECEIVABLES]: {
    label: "Cartões",
    description: "Visão de recebíveis de cartão e previsão.",
    pageRoutes: ["/dashboard/financeiro/cartoes"],
    apiPrefixes: ["/api/finance/card-receivables"],
    sidebarKey: "financeiro-cartoes",
  },
  [FEATURES.RECURRING_EXPENSES]: {
    label: "Despesas Recorrentes",
    description: "Cadastro de despesas fixas com agenda recorrente.",
    pageRoutes: ["/dashboard/financeiro/despesas-recorrentes"],
    apiPrefixes: ["/api/finance/recurring-expenses"],
    sidebarKey: "financeiro-despesas",
  },
};
```

---

## Camadas de Enforcement

### Camada 1 — Middleware Next.js (`src/middleware.ts`)

Roda em toda request a `/dashboard/*` e `/api/*`. Lê sessão NextAuth, busca features do plano (cache 5min) e:

- Rota dashboard bloqueada → redirect `/dashboard?upgrade-required=<feature>` + toast no destino
- Rota API bloqueada → `403 { error: { code: "PLAN_FEATURE_REQUIRED", feature: "<key>" } }`

```typescript
// src/middleware.ts (esqueleto)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { findBlockedFeature } from "@/lib/plan-feature-catalog";
import { getCachedPlanFeatures } from "@/lib/plan-features-cache";
import { getSessionFromCookie } from "@/lib/auth-edge";

export async function middleware(req: NextRequest) {
  const session = await getSessionFromCookie(req);
  if (!session?.companyId) return NextResponse.next();

  const features = await getCachedPlanFeatures(session.companyId);
  const blocked = findBlockedFeature(req.nextUrl.pathname, features);
  if (!blocked) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "PLAN_FEATURE_REQUIRED", feature: blocked } },
      { status: 403 },
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = "/dashboard";
  url.searchParams.set("upgrade-required", blocked);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
```

`findBlockedFeature(path, features)`:
```typescript
export function findBlockedFeature(
  path: string,
  features: Record<string, boolean>,
): FeatureKey | null {
  for (const [key, meta] of Object.entries(FEATURE_REGISTRY)) {
    if (features[key] === true) continue; // habilitada
    if (meta.pageRoutes.some((r) => path === r || path.startsWith(r + "/"))) return key as FeatureKey;
    if (meta.apiPrefixes.some((p) => path === p || path.startsWith(p + "/"))) return key as FeatureKey;
  }
  return null;
}
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
const cache = new Map<string, { features: Record<string, boolean>; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function getCachedPlanFeatures(companyId: string): Promise<Record<string, boolean>> {
  const now = Date.now();
  const hit = cache.get(companyId);
  if (hit && hit.expiresAt > now) return hit.features;

  const info = await getSubscriptionInfo(companyId);
  const features = info?.features
    ? Object.fromEntries(Object.entries(info.features).map(([k, v]) => [k, v === "true"]))
    : {}; // sem subscription → tudo liberado (modo accessEnabled)
  cache.set(companyId, { features, expiresAt: now + TTL_MS });
  return features;
}

export function invalidatePlanFeaturesCache(companyId: string) {
  cache.delete(companyId);
}
```

**Invalidação:** chamada em `subscriptionService.changePlan(companyId, newPlanId)` e no endpoint admin de troca de plano.

**Cuidado serverless:** em deploy Vercel cada lambda tem seu próprio cache. Aceitável — em até 5min todas convergem. Se quiser invalidação cross-instance, usar Redis (fora de escopo dessa entrega).

---

## Seed/Migração de dados

`prisma/seed-plan-basico-features.ts` — idempotente:

```typescript
import { PrismaClient } from "@prisma/client";
import { FEATURES } from "../src/lib/plan-feature-catalog";

const prisma = new PrismaClient();

async function main() {
  // 1) Atualiza preço do Básico
  const basico = await prisma.plan.findUniqueOrThrow({ where: { slug: "basico" } });
  await prisma.plan.update({
    where: { id: basico.id },
    data: { priceMonthly: 14990, priceYearly: 149900 },
  });

  // 2) Garante 13 features = "false" no Básico
  for (const key of Object.values(FEATURES)) {
    await prisma.planFeature.upsert({
      where: { planId_key: { planId: basico.id, key } },
      update: { value: "false" },
      create: { planId: basico.id, key, value: "false" },
    });
  }

  // 3) Garante 13 features = "true" em planos pagos
  for (const slug of ["profissional", "premium", "enterprise"]) {
    const plan = await prisma.plan.findUnique({ where: { slug } });
    if (!plan) continue;
    for (const key of Object.values(FEATURES)) {
      await prisma.planFeature.upsert({
        where: { planId_key: { planId: plan.id, key } },
        update: { value: "true" },
        create: { planId: plan.id, key, value: "true" },
      });
    }
  }

  console.log("✓ Plan Básico atualizado: 13 features=false, preço R$ 149,90");
}

main().finally(() => prisma.$disconnect());
```

Rodável via `npx tsx prisma/seed-plan-basico-features.ts`. Não altera schema. Não destrói dados de cliente.

---

## Site/Landing

`src/components/home/pricing-section.tsx` + `src/components/landing/pricing.tsx`:
- Leem `Plan.features` do banco (já implementado). Após o seed, exibem corretamente.
- Refatorar para consumir o `FEATURE_REGISTRY` em vez de strings cruas — usa `label` do catálogo para os nomes.
- Mostrar tabela comparativa explícita com ✓/✗ para todas as 13 features entre Básico/Profissional/Premium.

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

## Plano de Rollout (8 passos)

Cada passo é deployável independentemente; o "switch" real é o Passo 6.

```
1. Catálogo + middleware + cache       (deploy)   nenhum efeito ainda
2. requirePlanFeature nas 13 APIs      (deploy)   nenhum efeito (features default true se ausentes? Não: fallback "sem subscription = livre" mantém compatibilidade)
3. Sidebar/MobileNav com requiresFeature  (deploy) hasFeature retorna true sem PlanFeature → segue mostrando
4. <FeatureGate> nos botões inline     (deploy)   idem
5. Seed Profissional/Premium = true    (run)      planos pagos garantidos
6. Seed Básico = false + preço 14990   (run)      ⚠ clientes do Básico perdem acesso (esperado)
7. Landing atualiza pricing visual     (deploy)   reflete preço novo + feature list
8. Smoke test em prod                  (manual)   contas de teste em ambos os planos
```

## Kill Switch

`DISABLE_PLAN_FEATURE_GATING=true` em env vars curto-circuita o middleware e o `requirePlanFeature`. Roda imediatamente sem deploy.

```typescript
export async function requirePlanFeature(companyId: string, feature: FeatureKey) {
  if (process.env.DISABLE_PLAN_FEATURE_GATING === "true") return;
  // resto
}

// middleware.ts
if (process.env.DISABLE_PLAN_FEATURE_GATING === "true") return NextResponse.next();
```

---

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

- [ ] Catálogo `src/lib/plan-feature-catalog.ts` com 13 features + registry de páginas/APIs/sidebar
- [ ] Middleware bloqueia 13 rotas e 13 prefixes de API quando feature=false
- [ ] Cache 5min com invalidação por companyId
- [ ] 13 famílias de API com `requirePlanFeature` no topo (defesa em profundidade)
- [ ] Sidebar + MobileNav filtram itens por `hasFeature`
- [ ] `<FeatureGate>` aplicado nos 4 pontos inline identificados
- [ ] Seed idempotente atualiza preço (14990) e 13 features no Básico
- [ ] Seed garante 13 features=true nos planos pagos
- [ ] Landing exibe preço R$ 149,90 e tabela comparativa correta
- [ ] Admin SaaS pode trocar plano de cliente e invalidação roda
- [ ] Testes unit + integration + E2E passam
- [ ] Kill switch `DISABLE_PLAN_FEATURE_GATING` funciona
- [ ] Smoke test em produção: cliente Básico vê 13 telas bloqueadas; cliente Pro vê tudo

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
