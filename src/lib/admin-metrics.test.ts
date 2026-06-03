import { describe, it, expect } from "vitest";
import {
  computeTrend,
  formatTrend,
  monthlyValueOfSubscription,
  computeMRR,
  computeChurnRate,
  type SubscriptionForMRR,
} from "./admin-metrics";

const NOW = new Date("2026-06-02T12:00:00.000Z");

function sub(overrides: Partial<SubscriptionForMRR> = {}): SubscriptionForMRR {
  return {
    priceMonthly: 10000, // R$100,00
    priceYearly: 96000, // R$960,00 (R$80/mês)
    billingCycle: "MONTHLY",
    discountPercent: null,
    discountExpiresAt: null,
    ...overrides,
  };
}

describe("computeTrend — variação período atual vs anterior", () => {
  it("crescimento normal → up com percent positivo", () => {
    const t = computeTrend(120, 100);
    expect(t).toEqual({ current: 120, previous: 100, percent: 20, direction: "up" });
  });

  it("queda → down com percent negativo", () => {
    const t = computeTrend(80, 100);
    expect(t).toEqual({ current: 80, previous: 100, percent: -20, direction: "down" });
  });

  it("sem mudança → flat, 0%", () => {
    expect(computeTrend(100, 100)).toEqual({ current: 100, previous: 100, percent: 0, direction: "flat" });
  });

  it("anterior zero e atual > 0 → up com percent null (não +∞%)", () => {
    expect(computeTrend(5, 0)).toEqual({ current: 5, previous: 0, percent: null, direction: "up" });
  });

  it("ambos zero → flat, 0%", () => {
    expect(computeTrend(0, 0)).toEqual({ current: 0, previous: 0, percent: 0, direction: "flat" });
  });

  it("arredonda o percentual", () => {
    // (133-100)/100 = 33% ; (105-100)/100 = 5%
    expect(computeTrend(133, 100).percent).toBe(33);
    expect(computeTrend(105, 100).percent).toBe(5);
  });

  it("queda a zero → -100%, down", () => {
    expect(computeTrend(0, 100)).toEqual({ current: 0, previous: 100, percent: -100, direction: "down" });
  });
});

describe("formatTrend — texto para UI", () => {
  it("positivo com sinal +", () => {
    expect(formatTrend(computeTrend(112, 100))).toBe("+12%");
  });
  it("negativo com sinal -", () => {
    expect(formatTrend(computeTrend(92, 100))).toBe("-8%");
  });
  it("estável", () => {
    expect(formatTrend(computeTrend(100, 100))).toBe("estável");
  });
  it("crescimento do zero → 'novo'", () => {
    expect(formatTrend(computeTrend(5, 0))).toBe("novo");
  });
});

describe("monthlyValueOfSubscription — valor mensal efetivo (centavos)", () => {
  it("MONTHLY sem desconto → priceMonthly", () => {
    expect(monthlyValueOfSubscription(sub(), NOW)).toBe(10000);
  });

  it("YEARLY sem desconto → priceYearly/12 arredondado", () => {
    expect(monthlyValueOfSubscription(sub({ billingCycle: "YEARLY" }), NOW)).toBe(8000);
  });

  it("YEARLY com divisão não-exata arredonda ao centavo", () => {
    // 95000/12 = 7916,67 → 7917
    expect(monthlyValueOfSubscription(sub({ billingCycle: "YEARLY", priceYearly: 95000 }), NOW)).toBe(7917);
  });

  it("desconto permanente (sem expiração) conta sempre", () => {
    expect(
      monthlyValueOfSubscription(sub({ discountPercent: 20, discountExpiresAt: null }), NOW)
    ).toBe(8000);
  });

  it("desconto vigente (expira no futuro) é aplicado", () => {
    const future = new Date("2026-12-31T00:00:00.000Z");
    expect(
      monthlyValueOfSubscription(sub({ discountPercent: 10, discountExpiresAt: future }), NOW)
    ).toBe(9000);
  });

  it("desconto expirado (no passado) NÃO é aplicado → valor cheio", () => {
    const past = new Date("2026-01-01T00:00:00.000Z");
    expect(
      monthlyValueOfSubscription(sub({ discountPercent: 50, discountExpiresAt: past }), NOW)
    ).toBe(10000);
  });

  it("desconto sobre ciclo anual aplica após normalizar", () => {
    // YEARLY 96000 → 8000/mês ; 25% off → 6000
    expect(
      monthlyValueOfSubscription(
        sub({ billingCycle: "YEARLY", discountPercent: 25, discountExpiresAt: null }),
        NOW
      )
    ).toBe(6000);
  });

  it("discountPercent 0 ou null → sem desconto", () => {
    expect(monthlyValueOfSubscription(sub({ discountPercent: 0 }), NOW)).toBe(10000);
  });
});

describe("computeMRR — soma do valor mensal efetivo", () => {
  it("soma várias subscriptions em centavos", () => {
    const subs = [sub(), sub({ billingCycle: "YEARLY" }), sub({ discountPercent: 20, discountExpiresAt: null })];
    // 10000 + 8000 + 8000 = 26000
    expect(computeMRR(subs, NOW)).toBe(26000);
  });

  it("lista vazia → 0", () => {
    expect(computeMRR([], NOW)).toBe(0);
  });
});

describe("computeChurnRate — taxa do período", () => {
  it("base 0 → 0 (sem divisão por zero)", () => {
    expect(computeChurnRate({ canceledInPeriod: 3, activeAtPeriodStart: 0 })).toBe(0);
  });

  it("3 cancelados de 100 ativos → 0,03", () => {
    expect(computeChurnRate({ canceledInPeriod: 3, activeAtPeriodStart: 100 })).toBeCloseTo(0.03);
  });

  it("nenhum cancelamento → 0", () => {
    expect(computeChurnRate({ canceledInPeriod: 0, activeAtPeriodStart: 50 })).toBe(0);
  });
});
