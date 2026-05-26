import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock antes do import do módulo sob teste (vitest hoist)
vi.mock("@/lib/subscription", () => ({
  getSubscriptionInfo: vi.fn(),
}));

import { getSubscriptionInfo } from "@/lib/subscription";
import {
  getCachedPlanFeatures,
  invalidatePlanFeaturesCache,
} from "@/lib/plan-features-cache";

describe("plan-features-cache", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("converte features string → boolean", async () => {
    (getSubscriptionInfo as any).mockResolvedValue({
      features: { lens_treatments: "false", cash_flow: "true" },
    });
    invalidatePlanFeaturesCache("co1"); // limpar entre testes
    const r = await getCachedPlanFeatures("co1");
    expect(r.features).toEqual({ lens_treatments: false, cash_flow: true });
    expect(r.hasSubscription).toBe(true);
  });

  it("hasSubscription=false quando getSubscriptionInfo retorna null", async () => {
    (getSubscriptionInfo as any).mockResolvedValue(null);
    invalidatePlanFeaturesCache("co2");
    const r = await getCachedPlanFeatures("co2");
    expect(r.hasSubscription).toBe(false);
    expect(r.features).toEqual({});
  });

  it("cacheia: 2 chamadas só atingem getSubscriptionInfo 1 vez", async () => {
    (getSubscriptionInfo as any).mockResolvedValue({ features: {} });
    invalidatePlanFeaturesCache("co3");
    await getCachedPlanFeatures("co3");
    await getCachedPlanFeatures("co3");
    expect(getSubscriptionInfo).toHaveBeenCalledTimes(1);
  });

  it("invalidação força refetch", async () => {
    (getSubscriptionInfo as any).mockResolvedValue({ features: {} });
    invalidatePlanFeaturesCache("co4");
    await getCachedPlanFeatures("co4");
    invalidatePlanFeaturesCache("co4");
    await getCachedPlanFeatures("co4");
    expect(getSubscriptionInfo).toHaveBeenCalledTimes(2);
  });

  it("erro de DB não cacheia (próxima chamada tenta de novo)", async () => {
    invalidatePlanFeaturesCache("co5");
    (getSubscriptionInfo as any).mockRejectedValueOnce(new Error("db down"));
    await expect(getCachedPlanFeatures("co5")).rejects.toThrow("db down");

    (getSubscriptionInfo as any).mockResolvedValueOnce({ features: {} });
    const r = await getCachedPlanFeatures("co5");
    expect(r.hasSubscription).toBe(true);
    expect(getSubscriptionInfo).toHaveBeenCalledTimes(2);
  });

  it("cache isolado por companyId", async () => {
    invalidatePlanFeaturesCache("coA");
    invalidatePlanFeaturesCache("coB");
    (getSubscriptionInfo as any).mockImplementation(async (id: string) => ({
      features: { lens_treatments: id === "coA" ? "true" : "false" },
    }));
    const a = await getCachedPlanFeatures("coA");
    const b = await getCachedPlanFeatures("coB");
    expect(a.features.lens_treatments).toBe(true);
    expect(b.features.lens_treatments).toBe(false);
  });
});
