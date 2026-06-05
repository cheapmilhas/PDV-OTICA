import { describe, it, expect } from "vitest";
import { aggregateTrends, type MetricSampleRow } from "./system-trends";

function sample(over: Partial<MetricSampleRow>): MetricSampleRow {
  return {
    reqCount: 0,
    errorCount: 0,
    p50Ms: null,
    p95Ms: null,
    slowQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    ...over,
  };
}

describe("aggregateTrends", () => {
  it("retorna zeros para frota sem amostras", () => {
    const t = aggregateTrends([]);
    expect(t.reqCount).toBe(0);
    expect(t.errorCount).toBe(0);
    expect(t.errorRatePct).toBe(0);
    expect(t.p95Ms).toBeNull();
  });

  it("soma contadores de várias instâncias", () => {
    const t = aggregateTrends([
      sample({ reqCount: 100, errorCount: 2, slowQueries: 1, cacheHits: 50, cacheMisses: 10 }),
      sample({ reqCount: 300, errorCount: 6, slowQueries: 3, cacheHits: 150, cacheMisses: 50 }),
    ]);
    expect(t.reqCount).toBe(400);
    expect(t.errorCount).toBe(8);
    expect(t.slowQueries).toBe(4);
    expect(t.cacheHits).toBe(200);
    expect(t.cacheMisses).toBe(60);
    expect(t.errorRatePct).toBe(2); // 8/400
  });

  it("faz média de p95 ponderada por reqCount (não média simples)", () => {
    // amostra grande com p95=100, amostra minúscula com p95=1000:
    // média simples = 550; ponderada por req ≈ 109
    const t = aggregateTrends([
      sample({ reqCount: 1000, p95Ms: 100 }),
      sample({ reqCount: 10, p95Ms: 1000 }),
    ]);
    expect(t.p95Ms).toBe(109); // round((1000*100 + 10*1000) / 1010)
  });

  it("ignora amostras com p95 nulo na média ponderada", () => {
    const t = aggregateTrends([
      sample({ reqCount: 100, p95Ms: 200 }),
      sample({ reqCount: 100, p95Ms: null }),
    ]);
    expect(t.p95Ms).toBe(200);
  });

  it("conta o número de amostras (instâncias×janelas)", () => {
    const t = aggregateTrends([sample({ reqCount: 1 }), sample({ reqCount: 1 }), sample({ reqCount: 1 })]);
    expect(t.sampleCount).toBe(3);
  });
});
