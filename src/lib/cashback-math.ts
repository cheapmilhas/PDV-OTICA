/**
 * Lógica PURA de aritmética de cashback (Fase 2 — prevenção de bugs).
 *
 * Extraída de cashback.service para ser testável sem banco. Aqui mora a regra
 * do PISO 0 que já errou nos bugs M9 (ajuste manual negativo deixava saldo
 * negativo) e M5 (expiração decrementava valor cheio sobre saldo parcialmente
 * usado → saldo negativo).
 *
 * Invariante central: o saldo de cashback NUNCA fica abaixo de zero.
 */

export interface CashbackAdjustResult {
  /** Novo saldo após o ajuste, com piso 0. */
  newBalance: number;
  /** Valor REALMENTE aplicado (= amount, salvo se houve clamp no piso). */
  appliedAmount: number;
}

/**
 * Aplica um ajuste (crédito positivo ou débito negativo) ao saldo, com piso 0.
 * O `appliedAmount` reflete o que de fato mudou o saldo — é ele que deve ir ao
 * ledger (não o valor solicitado), para o movimento bater com o saldo (M9).
 *
 * @example applyCashbackAdjustment(30, -100) => { newBalance: 0, appliedAmount: -30 }
 * @example applyCashbackAdjustment(30, +20)  => { newBalance: 50, appliedAmount: +20 }
 * @example applyCashbackAdjustment(0, -100)  => { newBalance: 0, appliedAmount: 0 }  (sem efeito)
 */
export function applyCashbackAdjustment(
  currentBalance: number,
  amount: number
): CashbackAdjustResult {
  const newBalance = Math.max(0, currentBalance + amount);
  const appliedAmount = newBalance - currentBalance;
  return { newBalance, appliedAmount };
}

/**
 * Quanto de um movimento de crédito pode expirar, dado o saldo atual (M5).
 * Nunca expira mais do que o saldo disponível (piso 0) nem mais do que o
 * próprio valor do movimento.
 *
 * @example expirableAmount(movimento=50, saldo=30) => 30  (cliente já usou 20)
 * @example expirableAmount(movimento=50, saldo=80) => 50  (expira o movimento todo)
 * @example expirableAmount(movimento=50, saldo=0)  => 0   (nada a expirar)
 */
export function expirableAmount(movementAmount: number, currentBalance: number): number {
  return Math.min(movementAmount, Math.max(0, currentBalance));
}
