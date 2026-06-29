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

/**
 * Limites de USO de cashback numa venda, em forma pura (testável sem banco).
 *
 * Existem duas travas anti-fraude, ambas configuráveis por filial:
 *  - `maxUsagePercent`: o cashback usado não pode passar de X% do total da venda.
 *  - `minPurchaseMultiplier`: o total da venda precisa ser >= cashbackUsado × N
 *    (compra mínima proporcional ao resgate).
 *
 * IMPORTANTE — valor `null`/`0`/negativo = "sem limite" (não aplica a trava).
 * Respeitar isso evita bloquear óticas que deixaram o campo zerado de propósito.
 *
 * Originalmente essas regras só viviam em `validateUsage` (preview). O débito
 * real da venda não as reaplicava, então um POST direto em /api/sales com
 * `cashbackUsed` alto resgatava acima do teto. Esta função centraliza a regra
 * para que preview E débito usem exatamente a mesma lógica.
 */
export interface CashbackLimitsConfig {
  /** % máximo do total da venda que pode ser pago em cashback. null/0 = sem teto. */
  maxUsagePercent: number | null;
  /** Multiplicador de compra mínima (total >= cashbackUsed × mult). null/0 = sem mínimo. */
  minPurchaseMultiplier: number | null;
}

/**
 * Verifica os limites de uso de cashback. Retorna a mensagem de erro do PRIMEIRO
 * limite violado, ou `null` se está tudo dentro das regras (caminho feliz).
 *
 * @example assertCashbackLimits({maxUsagePercent: 50, minPurchaseMultiplier: 2}, 100, 60) =>
 *   "Cashback não pode ultrapassar 50% do valor da venda (R$ 50.00)"
 * @example assertCashbackLimits({maxUsagePercent: null, minPurchaseMultiplier: 0}, 10, 10) => null (sem limites)
 */
export function assertCashbackLimits(
  config: CashbackLimitsConfig,
  saleTotal: number,
  cashbackUsed: number
): string | null {
  if (cashbackUsed <= 0) return null;

  const minMultiplier = Number(config.minPurchaseMultiplier ?? 0);
  if (minMultiplier > 0) {
    const minPurchaseToUse = cashbackUsed * minMultiplier;
    if (saleTotal < minPurchaseToUse) {
      return `Compra mínima para usar R$ ${cashbackUsed.toFixed(
        2
      )} de cashback: R$ ${minPurchaseToUse.toFixed(2)}`;
    }
  }

  const maxPercent = Number(config.maxUsagePercent ?? 0);
  if (maxPercent > 0) {
    const maxUsage = (saleTotal * maxPercent) / 100;
    if (cashbackUsed > maxUsage) {
      return `Cashback não pode ultrapassar ${maxPercent}% do valor da venda (R$ ${maxUsage.toFixed(
        2
      )})`;
    }
  }

  return null;
}
