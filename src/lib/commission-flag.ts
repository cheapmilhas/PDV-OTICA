/**
 * Kill-switch do motor de comissão — Comissão Fase 2.
 *
 * A env `COMMISSION_ENGINE` escolhe qual cálculo de comissão vale:
 *   - "new"     → regra NOVA (computeSellerCommission: níveis + campanha).
 *                 A venda NÃO grava mais Commission por venda; a tela mostra a
 *                 comissão do mês pela regra nova, read-only (sem aprovar/pagar).
 *   - "legacy"  → comportamento ANTIGO de emergência: applyCommissionInTx grava
 *                 Commission por venda, a tela mostra o relatório legado com
 *                 lifecycle PENDENTE→APROVADA→PAGA.
 *
 * DEFAULT FAIL-SAFE = "legacy". SÓ `COMMISSION_ENGINE=new` (exato) liga a regra
 * nova; QUALQUER outro valor (ausente, "", "newx", "News", inválido) cai em
 * "legacy" (comportamento de hoje). Assim, se a env falhar/sumir num deploy
 * futuro, o sistema NÃO liga a regra nova sozinho e não zera os vendedores.
 *
 * Espelha o padrão de flags por env do sistema (ex.: DISABLE_PLAN_FEATURE_GATING,
 * whatsapp-flag.ts). Lido no SERVIDOR (gravador + rotas) e propagado à UI por uma
 * rota leve, NUNCA confiando em valor vindo do client.
 */

export type CommissionEngine = "new" | "legacy";

/**
 * Modo efetivo do motor de comissão. FAIL-SAFE: só "new" exato liga a regra
 * nova; todo o resto (ausente/inválido) → "legacy".
 */
export function getCommissionEngine(): CommissionEngine {
  return process.env.COMMISSION_ENGINE === "new" ? "new" : "legacy";
}

/** true quando a regra nova está ativa (default). */
export function isNewCommissionEngine(): boolean {
  return getCommissionEngine() === "new";
}

/** true quando o modo de emergência (cálculo antigo) está ligado. */
export function isLegacyCommissionEngine(): boolean {
  return getCommissionEngine() === "legacy";
}
