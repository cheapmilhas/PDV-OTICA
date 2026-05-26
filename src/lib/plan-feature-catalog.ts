/**
 * Catálogo central de feature keys do sistema de planos.
 *
 * Cada key corresponde a uma funcionalidade que pode ser ligada/desligada por plano
 * (via PlanFeature no banco). O Plano Básico tem todas as 13 keys = "false";
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
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];
