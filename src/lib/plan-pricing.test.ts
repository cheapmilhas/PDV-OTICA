import { describe, it, expect } from "vitest";
import { planValueForCycle } from "./plan-pricing";

describe("planValueForCycle", () => {
  const plan = { priceMonthly: 9900, priceYearly: 99000 }; // centavos
  it("MONTHLY → priceMonthly em reais", () => {
    expect(planValueForCycle(plan, "MONTHLY")).toBe(99);
  });
  it("YEARLY → priceYearly em reais", () => {
    expect(planValueForCycle(plan, "YEARLY")).toBe(990);
  });
  it("preserva centavos fracionários", () => {
    expect(planValueForCycle({ priceMonthly: 12990, priceYearly: 0 }, "MONTHLY")).toBe(129.9);
  });
});
