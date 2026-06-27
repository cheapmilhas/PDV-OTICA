import { describe, it, expect } from "vitest";
import {
  FEATURES,
  pathMatchesAny,
  findBlockedFeature,
} from "@/lib/plan-feature-catalog";

describe("pathMatchesAny", () => {
  it("string prefix bate exato", () => {
    expect(pathMatchesAny("/api/foo", ["/api/foo"])).toBe(true);
  });
  it("string prefix bate sub-path", () => {
    expect(pathMatchesAny("/api/foo/bar", ["/api/foo"])).toBe(true);
  });
  it("string prefix NÃO bate path que apenas começa com a mesma string sem ser sub-path", () => {
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
  it("aceita múltiplos matchers (qualquer match conta)", () => {
    expect(pathMatchesAny("/api/bar", ["/api/foo", "/api/bar"])).toBe(true);
  });
});

const ALL_FALSE = Object.fromEntries(
  Object.values(FEATURES).map((k) => [k, false]),
);
const ALL_TRUE = Object.fromEntries(
  Object.values(FEATURES).map((k) => [k, true]),
);

describe("findBlockedFeature — features=false bloqueiam", () => {
  it.each([
    ["/dashboard/tratamentos", FEATURES.LENS_TREATMENTS],
    ["/dashboard/tratamentos/novo", FEATURES.LENS_TREATMENTS],
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
    ["/dashboard/financeiro/conciliacao/abc123", FEATURES.BANK_RECONCILIATION],
    ["/dashboard/financeiro/bi", FEATURES.BI_ANALYTICS],
    ["/dashboard/financeiro/cartoes", FEATURES.CARD_RECEIVABLES],
    ["/dashboard/financeiro/despesas-recorrentes", FEATURES.RECURRING_EXPENSES],
    ["/api/lens-treatments", FEATURES.LENS_TREATMENTS],
    ["/api/lens-treatments/abc", FEATURES.LENS_TREATMENTS],
    ["/api/stock-transfers", FEATURES.STOCK_TRANSFERS],
    ["/api/stock-movements/transfer", FEATURES.STOCK_TRANSFERS],
    ["/api/reports/branch-comparison", FEATURES.BRANCH_COMPARISON],
    ["/api/finance/reports/dre", FEATURES.DRE_REPORT],
    ["/api/reports/financial/dre", FEATURES.DRE_REPORT],
    ["/api/finance/reports/cash-flow", FEATURES.CASH_FLOW],
    ["/api/finance/entries", FEATURES.FINANCE_ENTRIES],
    ["/api/finance/accounts/abc", FEATURES.FINANCE_ACCOUNTS],
    ["/api/finance/chart", FEATURES.CHART_OF_ACCOUNTS],
    ["/api/sales/abc123/refund", FEATURES.SALES_REFUNDS],
    ["/api/sales/xyz789/refunds", FEATURES.SALES_REFUNDS],
    ["/api/sales/xyz789/refund/details", FEATURES.SALES_REFUNDS],
    ["/api/finance/reconciliation", FEATURES.BANK_RECONCILIATION],
    ["/api/finance/reconciliation/batches/abc", FEATURES.BANK_RECONCILIATION],
    ["/api/finance/bi", FEATURES.BI_ANALYTICS],
    ["/api/finance/aggregate", FEATURES.BI_ANALYTICS],
    ["/api/finance/card-receivables", FEATURES.CARD_RECEIVABLES],
    ["/api/recurring-expenses", FEATURES.RECURRING_EXPENSES],
    // Q7.4 P2-2: features que faltavam na cobertura
    ["/dashboard/financeiro/lotes-estoque", FEATURES.INVENTORY_LOTS],
    ["/api/goals", FEATURES.GOALS],
    ["/api/inventory/lots", FEATURES.INVENTORY_LOTS],
  ])("bloqueia %s → %s", (path, expectedKey) => {
    expect(findBlockedFeature(path, ALL_FALSE)).toBe(expectedKey);
  });
});

it("NÃO bloqueia /dashboard/metas por plano (gating de goals é por-aba agora)", () => {
  expect(findBlockedFeature("/dashboard/metas", ALL_FALSE)).toBeNull();
});

describe("findBlockedFeature — features=true liberam", () => {
  it.each([
    "/dashboard/tratamentos",
    "/dashboard/financeiro/dre",
    "/dashboard/financeiro/lancamentos",
    "/dashboard/financeiro/devolucoes",
    "/api/sales/abc123/refund",
    "/api/recurring-expenses",
    "/api/finance/reports/cash-flow",
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
  it("retorna null para /api/sales/abc (sem /refund)", () => {
    expect(findBlockedFeature("/api/sales/abc", ALL_FALSE)).toBeNull();
  });
  it("retorna null para /api/products", () => {
    expect(findBlockedFeature("/api/products", ALL_FALSE)).toBeNull();
  });
});

describe("findBlockedFeature — apenas features ausentes (não definidas) bloqueiam", () => {
  it("se feature não está nas features (undefined), bloqueia", () => {
    const empty: Record<string, boolean> = {};
    expect(findBlockedFeature("/dashboard/tratamentos", empty)).toBe(
      FEATURES.LENS_TREATMENTS,
    );
  });
});
