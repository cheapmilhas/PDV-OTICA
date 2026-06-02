import { describe, it, expect } from "vitest";
import { computeTrend, formatTrend } from "./admin-metrics";

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
