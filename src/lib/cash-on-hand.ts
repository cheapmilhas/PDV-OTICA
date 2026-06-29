export interface CashMovementLike {
  type: string;
  direction: "IN" | "OUT";
  method: string;
  amount: number;
}

/**
 * Saldo de DINHEIRO FÍSICO em caixa: só movimentos method="CASH".
 * PIX/débito/cartão NÃO são dinheiro na gaveta (aparecem na conferência por forma).
 */
export function computeCashOnHand(movements: CashMovementLike[]): number {
  return movements.reduce((sum, m) => {
    if (m.method !== "CASH") return sum;
    return sum + (m.direction === "IN" ? m.amount : -m.amount);
  }, 0);
}
