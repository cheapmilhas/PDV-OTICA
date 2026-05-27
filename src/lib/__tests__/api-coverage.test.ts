import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/plan-features-cache", () => ({
  getCachedPlanFeatures: vi.fn(),
}));

import { withPlanFeatureGuard } from "@/lib/with-plan-feature";
import { FEATURES } from "@/lib/plan-feature-catalog";
import { auth } from "@/auth";
import { getCachedPlanFeatures } from "@/lib/plan-features-cache";

/**
 * Para cada uma das 16 features, escolhemos UM path representativo
 * (preferindo cobrir dynamic segments quando aplicável).
 */
const SAMPLES: Array<[keyof typeof FEATURES, string]> = [
  ["LENS_TREATMENTS", "/api/lens-treatments"],
  ["STOCK_TRANSFERS", "/api/stock-transfers"],
  ["BRANCH_COMPARISON", "/api/reports/branch-comparison"],
  ["DRE_REPORT", "/api/finance/reports/dre"],
  ["CASH_FLOW", "/api/finance/reports/cash-flow"],
  ["FINANCE_ENTRIES", "/api/finance/entries"],
  ["FINANCE_ACCOUNTS", "/api/finance/accounts"],
  ["CHART_OF_ACCOUNTS", "/api/finance/chart"],
  ["SALES_REFUNDS", "/api/sales/abc123/refund"],
  ["BANK_RECONCILIATION", "/api/finance/reconciliation"],
  ["BI_ANALYTICS", "/api/finance/bi"],
  ["CARD_RECEIVABLES", "/api/finance/card-receivables"],
  ["RECURRING_EXPENSES", "/api/recurring-expenses"],
];

const makeRequest = (path: string) => new Request(`http://localhost${path}`);
const makeCtx = () => ({ params: Promise.resolve({}) });

describe("Cobertura wrapper das 13 APIs", () => {
  const originalEnv = process.env.DISABLE_PLAN_FEATURE_GATING;

  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.DISABLE_PLAN_FEATURE_GATING;
    (auth as any).mockResolvedValue({ user: { companyId: "co1" } });
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.DISABLE_PLAN_FEATURE_GATING;
    else process.env.DISABLE_PLAN_FEATURE_GATING = originalEnv;
  });

  it.each(SAMPLES)(
    "%s bloqueia %s quando feature=false",
    async (featureKeyName, path) => {
      const featureValue = FEATURES[featureKeyName];
      (getCachedPlanFeatures as any).mockResolvedValue({
        features: { [featureValue]: false },
        hasSubscription: true,
      });
      const handler = vi.fn(async () => new Response("ok"));
      const wrapped = withPlanFeatureGuard(handler);

      const res = await wrapped(makeRequest(path), makeCtx());

      expect(res.status).toBe(403);
      const body = (await res.json()) as {
        error: { code: string; feature: string };
      };
      expect(body.error.code).toBe("PLAN_FEATURE_REQUIRED");
      expect(body.error.feature).toBe(featureValue);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each(SAMPLES)(
    "%s libera %s quando feature=true",
    async (featureKeyName, path) => {
      const featureValue = FEATURES[featureKeyName];
      (getCachedPlanFeatures as any).mockResolvedValue({
        features: { [featureValue]: true },
        hasSubscription: true,
      });
      const handler = vi.fn(async () => new Response("ok"));
      const wrapped = withPlanFeatureGuard(handler);

      const res = await wrapped(makeRequest(path), makeCtx());

      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    },
  );

  it("kill switch libera todas as 13 APIs sem consultar DB", async () => {
    process.env.DISABLE_PLAN_FEATURE_GATING = "true";
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPlanFeatureGuard(handler);

    for (const [, path] of SAMPLES) {
      vi.resetAllMocks();
      const res = await wrapped(makeRequest(path), makeCtx());
      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalled();
      expect(getCachedPlanFeatures).not.toHaveBeenCalled();
    }
  });
});
