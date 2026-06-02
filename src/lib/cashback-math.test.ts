import { describe, it, expect } from "vitest";
import { applyCashbackAdjustment, expirableAmount } from "./cashback-math";

describe("applyCashbackAdjustment — piso 0 no ajuste manual (M9)", () => {
  it("crédito normal soma ao saldo", () => {
    expect(applyCashbackAdjustment(30, 20)).toEqual({ newBalance: 50, appliedAmount: 20 });
  });

  it("débito dentro do saldo subtrai normalmente", () => {
    expect(applyCashbackAdjustment(30, -10)).toEqual({ newBalance: 20, appliedAmount: -10 });
  });

  it("débito MAIOR que o saldo zera (não fica negativo) — bug M9", () => {
    // -100 sobre 30 deixava saldo -70; agora vai a 0 e aplica só -30.
    expect(applyCashbackAdjustment(30, -100)).toEqual({ newBalance: 0, appliedAmount: -30 });
  });

  it("débito exato ao saldo zera", () => {
    expect(applyCashbackAdjustment(30, -30)).toEqual({ newBalance: 0, appliedAmount: -30 });
  });

  it("débito sobre saldo já zero = sem efeito (appliedAmount 0)", () => {
    // o serviço usa appliedAmount===0 para lançar erro informativo, sem poluir o ledger.
    expect(applyCashbackAdjustment(0, -100)).toEqual({ newBalance: 0, appliedAmount: 0 });
  });
});

describe("expirableAmount — piso 0 na expiração (M5)", () => {
  it("expira o movimento todo quando o saldo cobre", () => {
    expect(expirableAmount(50, 80)).toBe(50);
  });

  it("expira só o que resta quando o saldo é menor (cliente já usou parte) — bug M5", () => {
    // movimento de 50 expirando, mas só 30 de saldo → expira 30 (não 50, que daria saldo -20).
    expect(expirableAmount(50, 30)).toBe(30);
  });

  it("não expira nada quando o saldo é zero", () => {
    expect(expirableAmount(50, 0)).toBe(0);
  });

  it("não expira valor negativo quando saldo é negativo (defensivo)", () => {
    expect(expirableAmount(50, -10)).toBe(0);
  });
});
