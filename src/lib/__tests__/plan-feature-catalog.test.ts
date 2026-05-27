import { describe, it, expect } from "vitest";
import { FEATURES, FEATURE_REGISTRY } from "@/lib/plan-feature-catalog";

describe("FEATURES const", () => {
  it("expõe 16 feature keys", () => {
    expect(Object.keys(FEATURES)).toHaveLength(16);
  });

  it("contém as 16 keys esperadas com valores corretos", () => {
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
      CASHBACK: "cashback",
      GOALS: "goals",
      INVENTORY_LOTS: "inventory_lots",
    });
  });
});

describe("FEATURE_REGISTRY", () => {
  it("tem entrada para cada uma das features", () => {
    for (const key of Object.values(FEATURES)) {
      expect(FEATURE_REGISTRY[key]).toBeDefined();
      expect(FEATURE_REGISTRY[key].label).toBeTruthy();
      expect(FEATURE_REGISTRY[key].description).toBeTruthy();
      expect(FEATURE_REGISTRY[key].pageMatchers.length).toBeGreaterThan(0);
      expect(FEATURE_REGISTRY[key].apiMatchers.length).toBeGreaterThan(0);
    }
  });

  it("SALES_REFUNDS usa regex para dynamic segment do refund", () => {
    const matchers = FEATURE_REGISTRY[FEATURES.SALES_REFUNDS].apiMatchers;
    const hasRegex = matchers.some((m) => m instanceof RegExp);
    expect(hasRegex).toBe(true);
  });

  it("DRE_REPORT cobre tanto /api/finance/reports/dre quanto /api/reports/financial/dre", () => {
    const matchers = FEATURE_REGISTRY[FEATURES.DRE_REPORT].apiMatchers as string[];
    expect(matchers).toContain("/api/finance/reports/dre");
    expect(matchers).toContain("/api/reports/financial/dre");
  });

  it("STOCK_TRANSFERS cobre /api/stock-transfers e /api/stock-movements/transfer", () => {
    const matchers = FEATURE_REGISTRY[FEATURES.STOCK_TRANSFERS].apiMatchers as string[];
    expect(matchers).toContain("/api/stock-transfers");
    expect(matchers).toContain("/api/stock-movements/transfer");
  });

  it("RECURRING_EXPENSES usa /api/recurring-expenses (sem prefixo /finance)", () => {
    const matchers = FEATURE_REGISTRY[FEATURES.RECURRING_EXPENSES].apiMatchers as string[];
    expect(matchers).toContain("/api/recurring-expenses");
    expect(matchers).not.toContain("/api/finance/recurring-expenses");
  });

  it("BI_ANALYTICS cobre /api/finance/bi e /api/finance/aggregate", () => {
    const matchers = FEATURE_REGISTRY[FEATURES.BI_ANALYTICS].apiMatchers as string[];
    expect(matchers).toContain("/api/finance/bi");
    expect(matchers).toContain("/api/finance/aggregate");
  });
});
