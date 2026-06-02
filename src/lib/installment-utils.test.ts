import { describe, it, expect } from "vitest";
import { calculateInstallments, sumOnCreditAmount } from "./installment-utils";

describe("calculateInstallments — aritmética de parcelas", () => {
  it("divide igualmente quando não há resto", () => {
    const r = calculateInstallments(300, 3, new Date("2026-06-01"));
    expect(r.map((i) => Number(i.amount))).toEqual([100, 100, 100]);
  });

  it("joga o resto do arredondamento na ÚLTIMA parcela (soma bate com total)", () => {
    const r = calculateInstallments(100, 3, new Date("2026-06-01"));
    const valores = r.map((i) => Number(i.amount));
    // 33.33 + 33.33 + 33.34 = 100.00
    expect(valores[0]).toBe(33.33);
    expect(valores[1]).toBe(33.33);
    expect(valores[2]).toBe(33.34);
    expect(valores.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });

  it("numera as parcelas a partir de 1", () => {
    const r = calculateInstallments(200, 2, new Date("2026-06-01"));
    expect(r.map((i) => i.installmentNumber)).toEqual([1, 2]);
  });

  it("espaça as datas pelo intervalo (default 30 dias)", () => {
    const r = calculateInstallments(200, 2, new Date("2026-06-01"));
    expect(r[0].dueDate).toEqual(new Date("2026-06-01"));
    expect(r[1].dueDate).toEqual(new Date("2026-07-01"));
  });

  it("respeita intervalo customizado", () => {
    const r = calculateInstallments(200, 2, new Date("2026-06-01"), 15);
    expect(r[1].dueDate).toEqual(new Date("2026-06-16"));
  });
});

describe("sumOnCreditAmount — soma de pagamentos a prazo (H2)", () => {
  it("soma STORE_CREDIT + BALANCE_DUE (bug H2: antes validava isolado)", () => {
    const payments = [
      { method: "STORE_CREDIT", amount: 399.85 },
      { method: "BALANCE_DUE", amount: 399.85 },
    ];
    // a soma (799.70) é o que deve ir ao limite — não cada um isolado.
    expect(sumOnCreditAmount(payments)).toBeCloseTo(799.7, 2);
  });

  it("ignora métodos à vista (CASH/PIX/cartão)", () => {
    const payments = [
      { method: "CASH", amount: 100 },
      { method: "PIX", amount: 50 },
      { method: "STORE_CREDIT", amount: 200 },
    ];
    expect(sumOnCreditAmount(payments)).toBe(200);
  });

  it("retorna 0 quando não há pagamento a prazo", () => {
    expect(sumOnCreditAmount([{ method: "CASH", amount: 100 }])).toBe(0);
    expect(sumOnCreditAmount([])).toBe(0);
  });
});
