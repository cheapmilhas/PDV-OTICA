import { describe, it, expect } from "vitest";
import { computeCashOnHand, type CashMovementLike } from "./cash-on-hand";

const mk = (over: Partial<CashMovementLike>): CashMovementLike => ({
  type: "SALE_PAYMENT", direction: "IN", method: "CASH", amount: 0, ...over,
});

describe("computeCashOnHand", () => {
  it("soma só dinheiro físico (CASH); ignora PIX e débito", () => {
    const movs = [
      mk({ type: "OPENING_FLOAT", method: "CASH", direction: "IN", amount: 200 }),
      mk({ method: "CASH", direction: "IN", amount: 100 }),
      mk({ method: "PIX", direction: "IN", amount: 50 }),       // ignorado
      mk({ method: "DEBIT_CARD", direction: "IN", amount: 30 }), // ignorado
    ];
    expect(computeCashOnHand(movs)).toBe(300);
  });

  it("subtrai saídas em dinheiro (sangria, baixa de conta)", () => {
    const movs = [
      mk({ type: "OPENING_FLOAT", method: "CASH", direction: "IN", amount: 200 }),
      mk({ type: "WITHDRAWAL", method: "CASH", direction: "OUT", amount: 80 }),
    ];
    expect(computeCashOnHand(movs)).toBe(120);
  });

  it("PIX puro não vira saldo de dinheiro (bug do caso Ultra)", () => {
    const movs = [
      mk({ type: "OPENING_FLOAT", method: "CASH", direction: "IN", amount: 0 }),
      mk({ method: "PIX", direction: "IN", amount: 50 }),
    ];
    expect(computeCashOnHand(movs)).toBe(0);
  });

  it("sem movimentos → 0", () => {
    expect(computeCashOnHand([])).toBe(0);
  });
});
