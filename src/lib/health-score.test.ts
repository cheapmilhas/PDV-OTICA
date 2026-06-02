import { describe, it, expect } from "vitest";
import { HealthCategory } from "@prisma/client";
import { weightedHealthScore, healthCategoryForScore, HEALTH_WEIGHTS } from "./health-score";

describe("weightedHealthScore — média ponderada das dimensões", () => {
  it("score máximo (todas 100) = 100", () => {
    expect(
      weightedHealthScore({ usageScore: 100, billingScore: 100, engagementScore: 100, supportScore: 100 })
    ).toBe(100);
  });

  it("score mínimo (todas 0) = 0", () => {
    expect(
      weightedHealthScore({ usageScore: 0, billingScore: 0, engagementScore: 0, supportScore: 0 })
    ).toBe(0);
  });

  it("aplica os pesos corretos (billing pesa mais)", () => {
    // só billing=100, resto 0 → 35
    expect(
      weightedHealthScore({ usageScore: 0, billingScore: 100, engagementScore: 0, supportScore: 0 })
    ).toBe(35);
    // só usage=100 → 30
    expect(
      weightedHealthScore({ usageScore: 100, billingScore: 0, engagementScore: 0, supportScore: 0 })
    ).toBe(30);
  });

  it("os pesos somam 1", () => {
    const sum = HEALTH_WEIGHTS.usage + HEALTH_WEIGHTS.billing + HEALTH_WEIGHTS.engagement + HEALTH_WEIGHTS.support;
    expect(sum).toBeCloseTo(1, 5);
  });

  it("arredonda para inteiro", () => {
    // 50,50,50,50 = 50 exato; 55,55,55,55 = 55
    expect(
      weightedHealthScore({ usageScore: 55, billingScore: 55, engagementScore: 55, supportScore: 55 })
    ).toBe(55);
  });
});

describe("healthCategoryForScore — faixa → categoria", () => {
  it("100 e 81 → THRIVING", () => {
    expect(healthCategoryForScore(100)).toBe(HealthCategory.THRIVING);
    expect(healthCategoryForScore(81)).toBe(HealthCategory.THRIVING);
  });

  it("80 e 61 → HEALTHY", () => {
    expect(healthCategoryForScore(80)).toBe(HealthCategory.HEALTHY);
    expect(healthCategoryForScore(61)).toBe(HealthCategory.HEALTHY);
  });

  it("60 e 41 → AT_RISK", () => {
    expect(healthCategoryForScore(60)).toBe(HealthCategory.AT_RISK);
    expect(healthCategoryForScore(41)).toBe(HealthCategory.AT_RISK);
  });

  it("40 e 0 → CRITICAL", () => {
    expect(healthCategoryForScore(40)).toBe(HealthCategory.CRITICAL);
    expect(healthCategoryForScore(0)).toBe(HealthCategory.CRITICAL);
  });
});
