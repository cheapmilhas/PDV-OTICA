import { describe, it, expect } from "vitest";
import {
  computeCashBalance,
  withdrawalExceedsCash,
  paymentExceedsPayable,
} from "./finance-validation";

describe("computeCashBalance", () => {
  it("soma entradas e subtrai saídas", () => {
    expect(
      computeCashBalance([
        { direction: "IN", amount: 100 }, // fundo de troco
        { direction: "IN", amount: 50 }, // venda
        { direction: "OUT", amount: 30 }, // sangria anterior
      ])
    ).toBe(120);
  });
  it("zero sem movimentos", () => {
    expect(computeCashBalance([])).toBe(0);
  });
});

describe("withdrawalExceedsCash (A4 - sangria)", () => {
  it("permite sangria igual ao saldo", () => {
    expect(withdrawalExceedsCash(100, 100)).toBe(false);
  });
  it("permite sangria menor que o saldo", () => {
    expect(withdrawalExceedsCash(50, 100)).toBe(false);
  });
  it("bloqueia sangria maior que o saldo", () => {
    expect(withdrawalExceedsCash(150, 100)).toBe(true);
  });
  it("bloqueia sangria com saldo zero", () => {
    expect(withdrawalExceedsCash(10, 0)).toBe(true);
  });
  it("tolera ruído de centavos (não bloqueia por 1 centavo)", () => {
    expect(withdrawalExceedsCash(100.005, 100)).toBe(false);
  });
});

describe("paymentExceedsPayable (A5 - pagar conta)", () => {
  it("permite pagar o valor exato", () => {
    expect(paymentExceedsPayable(100, 100)).toBe(false);
  });
  it("permite pagamento parcial", () => {
    expect(paymentExceedsPayable(60, 100)).toBe(false);
  });
  it("bloqueia pagar mais que o valor da conta", () => {
    expect(paymentExceedsPayable(150, 100)).toBe(true);
  });
  it("tolera ruído de centavos", () => {
    expect(paymentExceedsPayable(100.005, 100)).toBe(false);
  });
});
