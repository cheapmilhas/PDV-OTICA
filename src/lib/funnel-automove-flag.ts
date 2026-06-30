/**
 * Kill-switch do auto-move do funil (Funil Inteligente — Fatia 3), POR ÓTICA.
 * Espelha o padrão de `commission-flag.ts` (COMMISSION_ENGINE_NEW_COMPANIES).
 *
 * Env `FUNNEL_AUTOMOVE_COMPANIES` = lista de companyId separados por vírgula.
 * Só as óticas NESSA lista têm auto-move ligado. Vazio/ausente = TODAS desligadas
 * (fail-safe: a IA não move card de ninguém por padrão). Reversão = remover da
 * lista + redeploy.
 *
 * Lido SEMPRE no SERVIDOR. Todos os consumidores passam o companyId.
 */
export function isFunnelAutoMoveOn(companyId: string | undefined | null): boolean {
  if (!companyId) return false; // sem tenant → nunca liga
  const raw = process.env.FUNNEL_AUTOMOVE_COMPANIES ?? "";
  const allow = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(companyId);
}
