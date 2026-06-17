import { INDEX_BANDS, THICKNESS_DISCLAIMER } from "./lens-optics.constants";

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

export interface FrameSize {
  lensWidthMm: number;
  bridgeMm: number;
}

export interface ThicknessEstimate {
  /** faixa em mm, ou null quando não há medida da armação (falha fechada parcial) */
  thicknessMm: { min: number; max: number } | null;
  weight: "mais leve" | "médio" | "mais pesado";
  disclaimer: string;
}

/**
 * Estima a espessura de BORDA como FAIXA (ordem de grandeza), nunca número de
 * produção. Sem medida da armação → não estima (thicknessMm=null).
 *
 * Modelo: sagitta s ≈ y²/(2R), com raio de curvatura R = (n-1)/|P| (P em
 * dioptrias, R em metros). Espessura de borda cresce com a sagitta e cai quando
 * o índice n sobe (lente mais fina). A FAIXA vai do índice mais ALTO da banda
 * recomendada (min, mais fino) ao mais BAIXO (max, mais grosso). É ordem de
 * grandeza — a saída é faixa + disclaimer, nunca número exato.
 */
export function estimateThickness(p: EyePower, frame: FrameSize | undefined): ThicknessEstimate {
  const absEE = Math.abs(sphericalEquivalent(p));
  const weight: ThicknessEstimate["weight"] = absEE <= 2 ? "mais leve" : absEE <= 5 ? "médio" : "mais pesado";
  if (!frame || absEE === 0) {
    return { thicknessMm: null, weight, disclaimer: THICKNESS_DISCLAIMER };
  }
  // semi-diâmetro efetivo da lente (mm) → metros
  const yMeters = (Math.max(0, (frame.lensWidthMm + frame.bridgeMm) / 2)) / 1000;
  const band = recommendIndex(p).map(Number); // ex [1.61, 1.67]
  const nLow = Math.min(...band);  // índice mais baixo → mais grosso → max
  const nHigh = Math.max(...band); // índice mais alto → mais fino → min
  // sagitta(mm) = (y²/(2R))*1000, R=(n-1)/|P|  ⇒  sagitta = (y² * |P| / (2*(n-1))) * 1000
  const sag = (n: number) => (yMeters * yMeters * absEE) / (2 * (n - 1)) * 1000;
  const min = Math.max(0, Math.round(sag(nHigh) * 10) / 10);
  const max = Math.max(min, Math.round(sag(nLow) * 10) / 10);
  return { thicknessMm: { min, max }, weight, disclaimer: THICKNESS_DISCLAIMER };
}
