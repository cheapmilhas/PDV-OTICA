/**
 * Validações puras de boundary financeiro (Fase 2). Extraídas para serem
 * testáveis e usadas pelos services/rotas reais — assim o teste cobre o
 * caminho de produção, não uma reimplementação.
 *
 * Tolerância de 0.01 absorve ruído de ponto-flutuante em centavos.
 */

const EPSILON = 0.01;

/**
 * Saldo em dinheiro de um turno = soma das entradas CASH menos as saídas CASH
 * (inclui o fundo de troco de abertura, que é um movimento OPENING_FLOAT IN CASH).
 */
export function computeCashBalance(
  movements: Array<{ direction: "IN" | "OUT"; amount: number }>
): number {
  return movements.reduce(
    (sum, m) => sum + (m.direction === "IN" ? m.amount : -m.amount),
    0
  );
}

/** A4: uma sangria em dinheiro não pode exceder o saldo em dinheiro do caixa. */
export function withdrawalExceedsCash(
  withdrawalAmount: number,
  cashBalance: number
): boolean {
  return withdrawalAmount > cashBalance + EPSILON;
}

/** A5: o valor pago de uma conta a pagar não pode exceder o valor da conta. */
export function paymentExceedsPayable(
  paidAmount: number,
  payableAmount: number
): boolean {
  return paidAmount > payableAmount + EPSILON;
}
