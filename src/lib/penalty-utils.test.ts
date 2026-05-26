import { describe, it, expect } from "vitest";
import { calculatePenalties } from "./penalty-utils";

const DUE = new Date("2026-05-01T00:00:00Z");

describe("calculatePenalties", () => {
  it("não cobra nada se data de referência é antes do vencimento", () => {
    const ref = new Date("2026-04-30T00:00:00Z");
    const r = calculatePenalties(
      { amount: 100, dueDate: DUE, finePercent: 2, interestPercent: 1 },
      ref,
    );
    expect(r).toEqual({ fine: 0, interest: 0, daysLate: 0, totalWithPenalties: 100 });
  });

  it("não cobra nada no dia do vencimento", () => {
    const r = calculatePenalties(
      { amount: 100, dueDate: DUE, finePercent: 2, interestPercent: 1 },
      DUE,
    );
    expect(r.fine).toBe(0);
    expect(r.interest).toBe(0);
    expect(r.daysLate).toBe(0);
  });

  it("respeita dias de carência", () => {
    const ref = new Date("2026-05-04T00:00:00Z"); // 3 dias atrasado
    const r = calculatePenalties(
      { amount: 100, dueDate: DUE, finePercent: 2, interestPercent: 1, graceDays: 5 },
      ref,
    );
    expect(r.fine).toBe(0);
    expect(r.interest).toBe(0);
    expect(r.daysLate).toBe(0);
  });

  it("calcula multa após carência", () => {
    const ref = new Date("2026-05-08T00:00:00Z"); // 7 dias atrasado, carência 5
    const r = calculatePenalties(
      { amount: 100, dueDate: DUE, finePercent: 2, interestPercent: 0, graceDays: 5 },
      ref,
    );
    expect(r.fine).toBe(2); // 2% de 100
    expect(r.daysLate).toBe(2);
  });

  it("calcula juros proporcionais ao tempo (30 dias = 1 mês)", () => {
    const ref = new Date("2026-05-31T00:00:00Z"); // 30 dias atrasado
    const r = calculatePenalties(
      { amount: 100, dueDate: DUE, finePercent: 0, interestPercent: 3 },
      ref,
    );
    // 30 dias = 1 mês de 3% = R$ 3
    expect(r.interest).toBe(3);
    expect(r.daysLate).toBe(30);
  });

  it("calcula juros proporcionais a 15 dias (meio mês)", () => {
    const ref = new Date("2026-05-16T00:00:00Z"); // 15 dias atrasado
    const r = calculatePenalties(
      { amount: 100, dueDate: DUE, finePercent: 0, interestPercent: 3 },
      ref,
    );
    // 15/30 * 3% * 100 = 1.5
    expect(r.interest).toBe(1.5);
  });

  it("soma multa + juros no total", () => {
    const ref = new Date("2026-05-31T00:00:00Z"); // 30 dias atrasado
    const r = calculatePenalties(
      { amount: 100, dueDate: DUE, finePercent: 2, interestPercent: 3 },
      ref,
    );
    expect(r.fine).toBe(2);
    expect(r.interest).toBe(3);
    expect(r.totalWithPenalties).toBe(105);
  });

  it("aceita amount como Decimal-like (number)", () => {
    const r = calculatePenalties(
      { amount: 1234.56, dueDate: DUE, finePercent: 2, interestPercent: 0 },
      new Date("2026-05-08T00:00:00Z"),
    );
    expect(r.fine).toBe(24.69);
  });

  it("retorna zero para valor zero", () => {
    const r = calculatePenalties(
      { amount: 0, dueDate: DUE, finePercent: 5, interestPercent: 5 },
      new Date("2026-06-01T00:00:00Z"),
    );
    expect(r.fine).toBe(0);
    expect(r.interest).toBe(0);
  });

  it("graceDays null trata como zero", () => {
    const ref = new Date("2026-05-02T00:00:00Z"); // 1 dia atrasado
    const r = calculatePenalties(
      { amount: 100, dueDate: DUE, finePercent: 2, interestPercent: 0, graceDays: null },
      ref,
    );
    expect(r.fine).toBe(2);
    expect(r.daysLate).toBe(1);
  });

  it("percentuais null tratados como zero", () => {
    const r = calculatePenalties(
      { amount: 100, dueDate: DUE, finePercent: null, interestPercent: null },
      new Date("2026-06-01T00:00:00Z"),
    );
    expect(r.fine).toBe(0);
    expect(r.interest).toBe(0);
    expect(r.totalWithPenalties).toBe(100);
  });
});
