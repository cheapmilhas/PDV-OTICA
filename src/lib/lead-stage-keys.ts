/**
 * Flags ESTÁVEIS de identidade de estágio do funil. Um estágio identificado por
 * `systemKey` é imune a rename do `name` pelo dono. Só estágios com semântica de
 * sistema recebem uma flag (não é um systemKey global — decisão /forja 2026-07-09).
 */
export const LEAD_STAGE_KEYS = {
  /** "Exame feito": destino do sinal automático de venda só-de-exame. */
  EXAM_DONE: "EXAM_DONE",
} as const;

export type LeadStageKey = (typeof LEAD_STAGE_KEYS)[keyof typeof LEAD_STAGE_KEYS];

/** Localizador puro: acha um estágio pela flag estável. Null se nenhum tiver. */
export function findStageByKey<T extends { systemKey: string | null }>(
  stages: readonly T[],
  key: LeadStageKey,
): T | null {
  return stages.find((s) => s.systemKey === key) ?? null;
}
