import { describe, it, expect } from "vitest";
import {
  computeMrrAtRisk,
  computeOverdueSummary,
  bucketByCategory,
  type SubscriptionAtRisk,
  type OverdueInvoice,
} from "./client-health-snapshot";

const NOW = new Date("2026-06-05T00:00:00.000Z");

function riskSub(over: Partial<SubscriptionAtRisk> = {}): SubscriptionAtRisk {
  return {
    status: "PAST_DUE",
    priceMonthly: 14990,
    priceYearly: 0,
    billingCycle: "MONTHLY",
    discountPercent: null,
    discountExpiresAt: null,
    ...over,
  };
}

describe("computeMrrAtRisk", () => {
  it("soma só PAST_DUE e SUSPENDED (centavos)", () => {
    const r = computeMrrAtRisk(
      [
        riskSub({ status: "PAST_DUE", priceMonthly: 14990 }),
        riskSub({ status: "SUSPENDED", priceMonthly: 29990 }),
        riskSub({ status: "ACTIVE", priceMonthly: 99999 }), // ignorado
        riskSub({ status: "TRIAL", priceMonthly: 88888 }), // ignorado
      ],
      NOW,
    );
    expect(r.mrrAtRiskCents).toBe(14990 + 29990);
    expect(r.atRiskCount).toBe(2);
  });

  it("zero quando não há assinaturas em risco", () => {
    const r = computeMrrAtRisk([riskSub({ status: "ACTIVE" })], NOW);
    expect(r.mrrAtRiskCents).toBe(0);
    expect(r.atRiskCount).toBe(0);
  });
});

describe("computeOverdueSummary", () => {
  it("conta e soma faturas OVERDUE", () => {
    const invoices: OverdueInvoice[] = [
      { status: "OVERDUE", total: 14990 },
      { status: "OVERDUE", total: 29990 },
      { status: "PAID", total: 99999 },
    ];
    const r = computeOverdueSummary(invoices);
    expect(r.overdueCount).toBe(2);
    expect(r.overdueTotalCents).toBe(44980);
  });

  it("zero quando não há OVERDUE", () => {
    const r = computeOverdueSummary([{ status: "PAID", total: 100 }]);
    expect(r.overdueCount).toBe(0);
    expect(r.overdueTotalCents).toBe(0);
  });
});

describe("bucketByCategory", () => {
  it("distribui por categoria, tratando null como sem-categoria", () => {
    const r = bucketByCategory([
      { healthCategory: "CRITICAL" },
      { healthCategory: "CRITICAL" },
      { healthCategory: "AT_RISK" },
      { healthCategory: "HEALTHY" },
      { healthCategory: "THRIVING" },
      { healthCategory: null },
    ]);
    expect(r.CRITICAL).toBe(2);
    expect(r.AT_RISK).toBe(1);
    expect(r.HEALTHY).toBe(1);
    expect(r.THRIVING).toBe(1);
    expect(r.UNKNOWN).toBe(1);
  });

  it("tudo zero para lista vazia", () => {
    const r = bucketByCategory([]);
    expect(r).toEqual({ CRITICAL: 0, AT_RISK: 0, HEALTHY: 0, THRIVING: 0, UNKNOWN: 0 });
  });
});
