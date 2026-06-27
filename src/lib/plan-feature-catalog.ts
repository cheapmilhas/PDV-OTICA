/**
 * Catálogo central de feature keys do sistema de planos.
 *
 * Cada key corresponde a uma funcionalidade que pode ser ligada/desligada por plano
 * (via PlanFeature no banco). O Plano Básico tem todas as 15 keys = "false";
 * planos pagos (Profissional, Enterprise) têm todas = "true".
 *
 * Use em conjunto com:
 *  - requirePlanFeature(companyId, FEATURES.X) — server-side guard
 *  - hasFeature(FEATURES.X) — client-side check (usePlanFeatures hook)
 *  - <FeatureGate feature={FEATURES.X}> — UI inline gating
 *  - withPlanFeatureGuard wrapper — API route handlers
 */
export const FEATURES = {
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
  GOALS: "goals",
  INVENTORY_LOTS: "inventory_lots",
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

/**
 * Um matcher pode ser:
 *  - string com prefixo exato: "/api/foo" casa "/api/foo", "/api/foo/", "/api/foo/bar"
 *  - RegExp: para dynamic segments (ex: /api/sales/[id]/refund)
 */
export type PathMatcher = string | RegExp;

export interface FeatureMeta {
  /** Label PT-BR para UI, landing, admin. */
  label: string;
  /** Texto curto explicativo para landing/tooltip. */
  description: string;
  /** Rotas de dashboard a bloquear via gate no layout. */
  pageMatchers: PathMatcher[];
  /** Prefixos/regex de API a bloquear via withPlanFeatureGuard wrapper. */
  apiMatchers: PathMatcher[];
  /** Identificador estável usado pela sidebar config (opcional). */
  sidebarKey?: string;
}

/**
 * PATHS AUDITADOS contra src/app/api e src/app/(dashboard)/dashboard em 2026-05-25.
 * Em caso de mudança de rotas, atualizar AQUI; sidebar/middleware/wrappers consomem
 * deste registry, então rota errada vira buraco de gating.
 */
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
      "/api/stock-movements/transfer",
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
      "/api/reports/financial/dre",
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
    apiMatchers: ["/api/recurring-expenses"],
    sidebarKey: "financeiro-despesas",
  },
  [FEATURES.GOALS]: {
    label: "Metas",
    description: "Metas de venda e comissão por vendedor/loja.",
    // pageMatchers vazio de propósito: o gating de `goals` na página /dashboard/metas
    // é POR ABA (FeatureGate na aba Ranking), não por URL — a página hospeda também
    // Comissões/Config (só-permissão). NÃO re-adicionar "/dashboard/metas" aqui.
    pageMatchers: [],
    apiMatchers: ["/api/goals"],
    sidebarKey: "metas",
  },
  [FEATURES.INVENTORY_LOTS]: {
    label: "Lotes de Estoque",
    description: "Controle FIFO de lotes de estoque com custo histórico.",
    pageMatchers: ["/dashboard/financeiro/lotes-estoque"],
    apiMatchers: ["/api/inventory/lots"],
    sidebarKey: "estoque-lotes",
  },
};

/**
 * Verifica se um path bate em qualquer matcher da lista.
 *
 * String matchers casam exato OU como prefixo de sub-path (`/api/foo` casa
 * `/api/foo`, `/api/foo/bar`, mas NÃO `/api/foobar`). Use RegExp quando
 * precisar de dynamic segment com `:id` no meio do path.
 */
export function pathMatchesAny(path: string, matchers: PathMatcher[]): boolean {
  for (const m of matchers) {
    if (typeof m === "string") {
      if (path === m || path.startsWith(m + "/")) return true;
    } else if (m.test(path)) {
      return true;
    }
  }
  return false;
}

/**
 * Encontra a primeira feature do catálogo que está BLOQUEADA para esse path,
 * dado o mapa de features ativas (key → boolean).
 *
 * Retorna a FeatureKey bloqueada, ou null se o path não cai em nenhuma feature
 * gated OU se a feature correspondente está ativa.
 *
 * Convenções:
 *  - feature === true → liberada, segue procurando
 *  - feature === false ou undefined → bloqueada se o path bater
 */
export function findBlockedFeature(
  path: string,
  features: Record<string, boolean>,
): FeatureKey | null {
  for (const [key, meta] of Object.entries(FEATURE_REGISTRY) as Array<
    [FeatureKey, FeatureMeta]
  >) {
    if (features[key] === true) continue;
    if (pathMatchesAny(path, meta.pageMatchers)) return key;
    if (pathMatchesAny(path, meta.apiMatchers)) return key;
  }
  return null;
}
