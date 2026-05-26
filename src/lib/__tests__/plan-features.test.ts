import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/subscription", () => ({
  getSubscriptionInfo: vi.fn(),
}));

import { requirePlanFeature } from "@/lib/plan-features";
import { getSubscriptionInfo } from "@/lib/subscription";

describe("requirePlanFeature", () => {
  const originalEnv = process.env.DISABLE_PLAN_FEATURE_GATING;

  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.DISABLE_PLAN_FEATURE_GATING;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.DISABLE_PLAN_FEATURE_GATING;
    else process.env.DISABLE_PLAN_FEATURE_GATING = originalEnv;
  });

  it("kill switch: DISABLE_PLAN_FEATURE_GATING=true bypassa tudo (não chama DB)", async () => {
    process.env.DISABLE_PLAN_FEATURE_GATING = "true";
    await expect(
      requirePlanFeature("co1", "qualquer_feature"),
    ).resolves.toBeUndefined();
    expect(getSubscriptionInfo).not.toHaveBeenCalled();
  });

  it("sem subscription → não enforça (libera)", async () => {
    (getSubscriptionInfo as any).mockResolvedValue(null);
    await expect(requirePlanFeature("co2", "lens_treatments")).resolves.toBeUndefined();
  });

  it("feature='true' → passa", async () => {
    (getSubscriptionInfo as any).mockResolvedValue({
      features: { lens_treatments: "true" },
    });
    await expect(requirePlanFeature("co3", "lens_treatments")).resolves.toBeUndefined();
  });

  it("feature='false' → lança forbiddenError", async () => {
    (getSubscriptionInfo as any).mockResolvedValue({
      features: { lens_treatments: "false" },
    });
    await expect(requirePlanFeature("co4", "lens_treatments")).rejects.toThrow();
  });

  it("feature ausente → lança forbiddenError (default fechado)", async () => {
    (getSubscriptionInfo as any).mockResolvedValue({
      features: {},
    });
    await expect(requirePlanFeature("co5", "lens_treatments")).rejects.toThrow();
  });
});
