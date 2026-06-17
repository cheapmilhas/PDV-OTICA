import { describe, it, expect } from "vitest";
import { recommendIndex, estimateThickness } from "./lens-optics";
import { THICKNESS_DISCLAIMER } from "./lens-optics.constants";

describe("recommendIndex", () => {
  it("grau baixo (-1.50) → índice básico 1.50/1.56", () => {
    expect(recommendIndex({ sph: -1.5, cyl: 0 })).toEqual(["1.50", "1.56"]);
  });
  it("grau médio (-3.00) → 1.56/1.61", () => {
    expect(recommendIndex({ sph: -3, cyl: 0 })).toEqual(["1.56", "1.61"]);
  });
  it("grau alto (-6.50) → 1.67/1.74", () => {
    expect(recommendIndex({ sph: -6.5, cyl: 0 })).toEqual(["1.67", "1.74"]);
  });
  it("usa o equivalente esférico (sph + cyl/2): -4.00 esf -2.00 cil → |EE|=5 → 1.61/1.67", () => {
    expect(recommendIndex({ sph: -4, cyl: -2 })).toEqual(["1.61", "1.67"]);
  });
  it("propriedade: índice nunca 'diminui' quando o grau aumenta", () => {
    const low = recommendIndex({ sph: -1, cyl: 0 });
    const high = recommendIndex({ sph: -8, cyl: 0 });
    expect(Number(high[0])).toBeGreaterThanOrEqual(Number(low[0]));
  });
});

describe("estimateThickness", () => {
  it("sem medida da armação → não estima espessura (faixa null), só disclaimer", () => {
    const r = estimateThickness({ sph: -4, cyl: 0 }, undefined);
    expect(r.thicknessMm).toBeNull();
    expect(r.disclaimer).toBe(THICKNESS_DISCLAIMER);
  });
  it("com medida → devolve FAIXA (min<=max), peso qualitativo e disclaimer", () => {
    const r = estimateThickness({ sph: -6, cyl: 0 }, { lensWidthMm: 55, bridgeMm: 18 });
    expect(r.thicknessMm).not.toBeNull();
    expect(r.thicknessMm!.min).toBeLessThanOrEqual(r.thicknessMm!.max);
    expect(["mais leve", "médio", "mais pesado"]).toContain(r.weight);
    expect(r.disclaimer).toBe(THICKNESS_DISCLAIMER);
  });
  it("nunca devolve espessura negativa", () => {
    const r = estimateThickness({ sph: -10, cyl: 0 }, { lensWidthMm: 60, bridgeMm: 18 });
    if (r.thicknessMm) expect(r.thicknessMm.min).toBeGreaterThanOrEqual(0);
  });
  it("invariante: o mínimo da faixa (índice mais fino) é < ou = o máximo (índice mais grosso)", () => {
    const r = estimateThickness({ sph: -6, cyl: 0 }, { lensWidthMm: 55, bridgeMm: 18 });
    expect(r.thicknessMm!.min).toBeLessThanOrEqual(r.thicknessMm!.max);
  });
  it("grau zero → não estima espessura (sem sagitta)", () => {
    const r = estimateThickness({ sph: 0, cyl: 0 }, { lensWidthMm: 55, bridgeMm: 18 });
    expect(r.thicknessMm).toBeNull();
  });
});
