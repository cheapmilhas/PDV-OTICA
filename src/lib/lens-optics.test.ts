import { describe, it, expect } from "vitest";
import { recommendIndex, estimateThickness, analyzeLens, sphericalEquivalent } from "./lens-optics";
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

describe("analyzeLens (entrada unificada + sanity-check + falha fechada)", () => {
  const ok = { od: { sph: -2, cyl: -1, axis: 90 }, oe: { sph: -2, cyl: -1, axis: 90 } };

  it("grau plausível → retorna índice + alertas (array) sem erro de validação", () => {
    const r = analyzeLens(ok, undefined);
    expect(r.valid).toBe(true);
    expect(r.od.index.length).toBeGreaterThan(0);
    expect(Array.isArray(r.alerts)).toBe(true);
  });

  it("FALHA FECHADA: esf fora da faixa (-40) → valid=false, sem números, pede conferir", () => {
    const r = analyzeLens({ od: { sph: -40, cyl: 0 }, oe: { sph: -2, cyl: 0 } }, undefined);
    expect(r.valid).toBe(false);
    expect(r.od.index).toEqual([]); // não exibe recomendação em entrada atípica
    expect(r.alerts.some((a) => /atípico|confir/i.test(a))).toBe(true);
  });

  it("sanity: cilíndrico alto com eixo 0 → alerta", () => {
    const r = analyzeLens({ od: { sph: 0, cyl: -3, axis: 0 }, oe: { sph: 0, cyl: -3, axis: 0 } }, undefined);
    expect(r.alerts.some((a) => /eixo/i.test(a))).toBe(true);
  });

  it("sanity: assimetria grande OD x OE → alerta", () => {
    const r = analyzeLens({ od: { sph: -1, cyl: 0 }, oe: { sph: -7, cyl: 0 } }, undefined);
    expect(r.alerts.some((a) => /assimetr/i.test(a))).toBe(true);
  });
});

describe("cobertura adicional (hipermetropia, zero-cross, fail-closed parcial, threshold)", () => {
  it("hipermetropia +4.00 esf -1.00 cil → EE=3.5 → banda [1.56, 1.61]", () => {
    expect(recommendIndex({ sph: 4, cyl: -1 })).toEqual(["1.56", "1.61"]);
  });
  it("esf +2 cil -4 → EE=0 → espessura null mesmo com armação", () => {
    const r = estimateThickness({ sph: 2, cyl: -4 }, { lensWidthMm: 55, bridgeMm: 18 });
    expect(r.thicknessMm).toBeNull();
  });
  it("equivalente esférico direto: sph=-4, cyl=-2 → -5", () => {
    expect(sphericalEquivalent({ sph: -4, cyl: -2 })).toBe(-5);
  });
  it("OE inválido, OD válido → valid=false, od tem índice, oe não tem", () => {
    const r = analyzeLens({ od: { sph: -2, cyl: 0 }, oe: { sph: -40, cyl: 0 } }, undefined);
    expect(r.valid).toBe(false);
    expect(r.od.index.length).toBeGreaterThan(0);
    expect(r.oe.index).toEqual([]);
  });
  it("assimetria exatamente 4D → dispara alerta", () => {
    const r = analyzeLens({ od: { sph: -1, cyl: 0 }, oe: { sph: -5, cyl: 0 } }, undefined);
    expect(r.alerts.some((a) => /assimetr/i.test(a))).toBe(true);
  });
  it("cilíndrico positivo → alerta específico de notação + valid false", () => {
    const r = analyzeLens({ od: { sph: -2, cyl: 1 }, oe: { sph: -2, cyl: 0 } }, undefined);
    expect(r.valid).toBe(false);
    expect(r.alerts.some((a) => /notação positiva/i.test(a))).toBe(true);
  });
});
