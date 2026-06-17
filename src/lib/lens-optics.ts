import { INDEX_BANDS, THICKNESS_DISCLAIMER, INPUT_LIMITS, FRAME_LIMITS } from "./lens-optics.constants";

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
  /** peso qualitativo; só é significativo quando thicknessMm !== null */
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
  // y = semi-corda nasal aproximada (lensWidth+bridge)/2 — sem PD monocular, esta é
  // uma SUPERESTIMATIVA conservadora (mais espesso = expectativa segura na venda).
  // NÃO trocar por lensWidth/2 sem reconsiderar: a saída é faixa + disclaimer de propósito.
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

export interface LensInput {
  od: EyePower;
  oe: EyePower;
}

export interface EyeResult {
  /** índices recomendados (elemento 0 = índice mais baixo/grosso, último = mais alto/fino); [] quando entrada atípica (falha fechada) */
  index: string[];
  thickness: ThicknessEstimate;
}

export interface LensAnalysis {
  valid: boolean;
  od: EyeResult;
  oe: EyeResult;
  alerts: string[];
}

function inputPlausible(p: EyePower): boolean {
  if (p.sph < INPUT_LIMITS.sphMin || p.sph > INPUT_LIMITS.sphMax) return false;
  if (p.cyl < INPUT_LIMITS.cylMin || p.cyl > INPUT_LIMITS.cylMax) return false;
  if (p.axis != null && (p.axis < INPUT_LIMITS.axisMin || p.axis > INPUT_LIMITS.axisMax)) return false;
  if (p.add != null && (p.add < INPUT_LIMITS.addMin || p.add > INPUT_LIMITS.addMax)) return false;
  return true;
}

function framePlausible(f: FrameSize): boolean {
  return (
    f.lensWidthMm >= FRAME_LIMITS.lensWidthMin && f.lensWidthMm <= FRAME_LIMITS.lensWidthMax &&
    f.bridgeMm >= FRAME_LIMITS.bridgeMin && f.bridgeMm <= FRAME_LIMITS.bridgeMax
  );
}

function eyeResult(p: EyePower, frame: FrameSize | undefined): EyeResult {
  return { index: recommendIndex(p), thickness: estimateThickness(p, frame) };
}

export function analyzeLens(input: LensInput, frame: FrameSize | undefined): LensAnalysis {
  const alerts: string[] = [];
  const safeFrame = frame && framePlausible(frame) ? frame : undefined;
  if (frame && !safeFrame) alerts.push("Medida da armação atípica — confirme antes de estimar espessura.");

  const odOk = inputPlausible(input.od);
  const oeOk = inputPlausible(input.oe);
  if (!odOk || !oeOk) {
    if (input.od.cyl > 0 || input.oe.cyl > 0) {
      alerts.push("Cilíndrico em notação positiva detectado — o sistema usa notação negativa (ex.: -1,00).");
    }
    alerts.push("Valor de grau atípico — confirme a receita.");
    const empty: EyeResult = { index: [], thickness: estimateThickness({ sph: 0, cyl: 0 }, undefined) };
    return { valid: false, od: odOk ? eyeResult(input.od, safeFrame) : empty, oe: oeOk ? eyeResult(input.oe, safeFrame) : empty, alerts };
  }

  // sanity-checks (não invalidam, só alertam)
  for (const [label, p] of [["OD", input.od], ["OE", input.oe]] as const) {
    if (Math.abs(p.cyl) >= 2 && (p.axis === 0 || p.axis === 180)) {
      alerts.push(`${label}: cilíndrico alto com eixo ${p.axis} — confira o eixo.`);
    }
    if (p.add != null && p.add > 0) {
      alerts.push(`${label}: adição informada — confirme se é multifocal/perto.`);
    }
  }
  if (Math.abs(sphericalEquivalent(input.od) - sphericalEquivalent(input.oe)) >= 4) {
    alerts.push("Assimetria grande entre OD e OE — confirme a receita.");
  }

  return { valid: true, od: eyeResult(input.od, safeFrame), oe: eyeResult(input.oe, safeFrame), alerts };
}
