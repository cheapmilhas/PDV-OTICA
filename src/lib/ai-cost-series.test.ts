import { describe, it, expect } from "vitest";
import { buildAiCostSeries } from "./ai-cost-series";

// now fixo no meio de junho/2026 (meio-dia BRT ≈ 15:00Z) para rótulos estáveis.
const NOW = new Date("2026-06-15T15:00:00Z");

describe("buildAiCostSeries", () => {
  it("devolve `months` pontos em ordem cronológica com key YYYY-MM", () => {
    const s = buildAiCostSeries({
      monthlyCostUsd: new Map(),
      now: NOW,
      months: 6,
      usdBrlRate: 5,
      globalMarkupPercent: 0,
    });
    expect(s).toHaveLength(6);
    expect(s.map((p) => p.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    // rótulo curto pt-BR
    expect(s[0].month).toBe("jan");
    expect(s[5].month).toBe("jun");
  });

  it("mês sem custo → zeros", () => {
    const s = buildAiCostSeries({
      monthlyCostUsd: new Map(),
      now: NOW,
      months: 3,
      usdBrlRate: 5,
      globalMarkupPercent: 100,
    });
    for (const p of s) {
      expect(p.costBrl).toBe(0);
      expect(p.profitBrl).toBe(0);
    }
  });

  it("markup 100% → lucro = custo (dobra o preço)", () => {
    const s = buildAiCostSeries({
      monthlyCostUsd: new Map([["2026-06", 2]]), // 2 USD no mês corrente
      now: NOW,
      months: 6,
      usdBrlRate: 5,
      globalMarkupPercent: 100,
    });
    const jun = s.find((p) => p.key === "2026-06")!;
    // custo = 2×5 = R$10; preço = 2×5×2 = R$20; lucro = R$10
    expect(jun.costBrl).toBeCloseTo(10, 6);
    expect(jun.profitBrl).toBeCloseTo(10, 6);
  });

  it("markup 0% → lucro 0 (preço = custo)", () => {
    const s = buildAiCostSeries({
      monthlyCostUsd: new Map([["2026-06", 3]]),
      now: NOW,
      months: 1,
      usdBrlRate: 5,
      globalMarkupPercent: 0,
    });
    expect(s[0].costBrl).toBeCloseTo(15, 6);
    expect(s[0].profitBrl).toBeCloseTo(0, 6);
  });

  it("markup negativo (subsídio) → lucro negativo, mas preço nunca abaixo de 0", () => {
    const s = buildAiCostSeries({
      monthlyCostUsd: new Map([["2026-06", 2]]),
      now: NOW,
      months: 1,
      usdBrlRate: 5,
      globalMarkupPercent: -50,
    });
    // custo R$10; preço = 2×5×0.5 = R$5; lucro = -R$5 (subsídio)
    expect(s[0].costBrl).toBeCloseTo(10, 6);
    expect(s[0].profitBrl).toBeCloseTo(-5, 6);
  });

  it("virada de mês em BRT: 30/jun 23:30 BRT (= 01/jul 02:30Z) fica em junho", () => {
    // 2026-07-01T02:30:00Z = 2026-06-30 23:30 em America/Sao_Paulo (UTC-3)
    const rollover = new Date("2026-07-01T02:30:00Z");
    const s = buildAiCostSeries({
      monthlyCostUsd: new Map(),
      now: rollover,
      months: 2,
      usdBrlRate: 5,
      globalMarkupPercent: 0,
    });
    // último bucket deve ser junho (BRT), não julho (UTC)
    expect(s[s.length - 1].key).toBe("2026-06");
    expect(s[s.length - 1].month).toBe("jun");
  });
});
