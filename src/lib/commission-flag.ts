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
 * DEFAULT (env não setada) = "new". A regra nova é a oficial; "legacy" é só o
 * botão de pânico: trocar a env para `legacy` reverte sem precisar de deploy.
 *
 * Espelha o padrão de flags por env do sistema (ex.: DISABLE_PLAN_FEATURE_GATING,
 * whatsapp-flag.ts). Lido no SERVIDOR (gravador + rotas) e propagado à UI por uma
 * rota leve, NUNCA confiando em valor vindo do client.
 */

export type CommissionEngine = "new" | "legacy";

/** Modo efetivo do motor de comissão (default "new"). */
export function getCommissionEngine(): CommissionEngine {
  return process.env.COMMISSION_ENGINE === "legacy" ? "legacy" : "new";
}

/** true quando a regra nova está ativa (default). */
export function isNewCommissionEngine(): boolean {
  return getCommissionEngine() === "new";
}

/** true quando o modo de emergência (cálculo antigo) está ligado. */
export function isLegacyCommissionEngine(): boolean {
  return getCommissionEngine() === "legacy";
}
