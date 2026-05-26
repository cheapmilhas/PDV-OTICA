import { describe, it, expect } from "vitest";
import { FEATURES } from "@/lib/plan-feature-catalog";

describe("FEATURES const", () => {
  it("expõe 13 feature keys", () => {
    expect(Object.keys(FEATURES)).toHaveLength(13);
  });

  it("contém as 13 keys esperadas com valores corretos", () => {
    expect(FEATURES).toEqual({
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
