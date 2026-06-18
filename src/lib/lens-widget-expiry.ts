/** TTL de inatividade do widget de lentes: limpa os dados após 10 min sem edição. */
export const LENS_WIDGET_TTL_MS = 10 * 60 * 1000;

/** true se passou mais que o TTL desde a última edição. null (nunca editado) → false. */
export function isExpired(
  lastEditedAt: number | null,
  now: number,
  ttlMs: number = LENS_WIDGET_TTL_MS,
): boolean {
  if (lastEditedAt == null) return false;
  return now - lastEditedAt > ttlMs;
}
