/**
 * Constantes do motor óptico (Fase 1). Calibração ancorada na tabela de índice
 * por grau padrão da indústria óptica; o dono/óptico valida no playground antes
 * de ativar a feature (ver spec, Fase 1 — fonte de calibração).
 *
 * REGRA: o motor NUNCA é fonte de número de produção. Espessura/peso saem como
 * FAIXA + disclaimer. Falha fechada: entrada/saída atípica → não exibe número.
 */

/** Faixa de índice recomendada por |grau equivalente esférico| (dioptrias). */
export interface IndexBand {
  /** limite superior (inclusive) de |grau| para esta faixa */
  maxAbsPower: number;
  /** índices recomendados, do mais barato/grosso ao mais fino */
  indices: string[];
}

export const INDEX_BANDS: IndexBand[] = [
  { maxAbsPower: 2, indices: ["1.50", "1.56"] },
  { maxAbsPower: 4, indices: ["1.56", "1.61"] },
  { maxAbsPower: 6, indices: ["1.61", "1.67"] },
  { maxAbsPower: Infinity, indices: ["1.67", "1.74"] },
];

/** Limites plausíveis de entrada (guarda-corpo). Fora disso → falha fechada. */
export const INPUT_LIMITS = {
  sphMin: -30,
  sphMax: 30,
  cylMin: -10, // cilíndrico em notação negativa
  cylMax: 0,
  axisMin: 0,
  axisMax: 180,
  addMin: 0,
  addMax: 4,
} as const;

/** Limites plausíveis da medida da armação (mm). */
export const FRAME_LIMITS = {
  lensWidthMin: 30,
  lensWidthMax: 70,
  bridgeMin: 10,
  bridgeMax: 30,
} as const;

/** Disclaimer fixo, não-removível, em toda saída que envolva espessura/peso. */
export const THICKNESS_DISCLAIMER =
  "Estimativa para orientação de venda. A espessura/peso final dependem do laboratório, material e montagem.";
