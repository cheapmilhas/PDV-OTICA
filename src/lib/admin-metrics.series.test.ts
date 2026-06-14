import { describe, it, expect } from "vitest";
import {
  computeMrrSeries,
  type SubscriptionForSeries,
} from "./admin-metrics";

/**
 * `now` FIXO p/ determinismo: junho/2026. Os meses esperados nos últimos 6
 * meses são jan..jun de 2026.
 */
const NOW = new Date("2026-06-15T12:00:00Z");

function sub(
  createdAt: string,
  overrides: Partial<SubscriptionForSeries> = {}
): SubscriptionForSeries {
  return {
    priceMonthly: 14990,
    priceYearly: 0,
    billingCycle: "MONTHLY",
    discountPercent: null,
    discountExpiresAt: null,
    createdAt: new Date(createdAt),
    ...overrides,
  };
}

describe("computeMrrSeries", () => {
  it("retorna `months` pontos em ordem cronológica, último mês === mês de now", () => {
    const series = computeMrrSeries([], NOW, 6);
    expect(series).toHaveLength(6);
    const keys = series.map((p) => p.key);
    // ordenado, mais antigo primeiro
    expect(keys).toEqual([...keys].sort());
    // janela dos últimos 6 meses até jun/2026
    expect(keys).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    expect(series[series.length - 1].key).toBe("2026-06");
  });

  it("sub criada no mês atual só conta no último bucket, não nos anteriores", () => {
    const series = computeMrrSeries([sub("2026-06-02T00:00:00Z")], NOW, 6);
    // jan..mai = 0; jun = 149.9
    expect(series.slice(0, 5).map((p) => p.mrr)).toEqual([0, 0, 0, 0, 0]);
    expect(series[5].mrr).toBe(149.9);
  });

  it("sub criada antes da janela conta em TODOS os buckets", () => {
    const series = computeMrrSeries([sub("2025-01-01T00:00:00Z")], NOW, 6);
    expect(series.map((p) => p.mrr)).toEqual([
      149.9, 149.9, 149.9, 149.9, 149.9, 149.9,
    ]);
  });

  it("valor de MRR em reais (MONTHLY priceMonthly=14990 → 149.9)", () => {
    const series = computeMrrSeries([sub("2025-12-01T00:00:00Z")], NOW, 1);
    expect(series).toHaveLength(1);
    expect(series[0].key).toBe("2026-06");
    expect(series[0].mrr).toBe(149.9);
  });

  it("subs vazias → todos os pontos com mrr 0", () => {
    const series = computeMrrSeries([], NOW, 6);
    expect(series.every((p) => p.mrr === 0)).toBe(true);
  });

  it("conta a soma de várias subs existentes até o fim do mês (mês a mês)", () => {
    const series = computeMrrSeries(
      [sub("2026-03-10T00:00:00Z"), sub("2026-05-10T00:00:00Z")],
      NOW,
      6
    );
    // jan,fev = 0; mar,abr = 149.9; mai,jun = 299.8
    expect(series.map((p) => p.mrr)).toEqual([
      0, 0, 149.9, 149.9, 299.8, 299.8,
    ]);
  });

  it("rótulo curto pt-BR sem ponto final", () => {
    const series = computeMrrSeries([], NOW, 3);
    expect(series.map((p) => p.month)).toEqual(["abr", "mai", "jun"]);
    expect(series.every((p) => !p.month.includes("."))).toBe(true);
  });
});
