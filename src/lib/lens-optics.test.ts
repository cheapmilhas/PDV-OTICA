import { describe, it, expect } from "vitest";
import { recommendIndex } from "./lens-optics";

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
