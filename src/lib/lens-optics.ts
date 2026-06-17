import { INDEX_BANDS } from "./lens-optics.constants";

export interface EyePower {
  sph: number;
  cyl: number;
  axis?: number;
  add?: number;
}

/** Equivalente esférico = esf + cil/2 (cil em notação negativa). */
export function sphericalEquivalent(p: EyePower): number {
  return p.sph + p.cyl / 2;
}

/** Faixa de índice recomendada pelo |equivalente esférico|. */
export function recommendIndex(p: EyePower): string[] {
  const absEE = Math.abs(sphericalEquivalent(p));
  const band =
    INDEX_BANDS.find((b) => absEE <= b.maxAbsPower) ??
    INDEX_BANDS[INDEX_BANDS.length - 1];
  return band.indices;
}
