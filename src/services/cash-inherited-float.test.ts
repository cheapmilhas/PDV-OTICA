import { describe, it, expect } from "vitest";
import { resolveInheritedFloat } from "./cash.service";

// Rotina 21/06: o caixa auto-aberto deve herdar o fundo de troco do último
// caixa fechado (closingDeclaredCash), em vez de abrir sempre com R$0.

describe("resolveInheritedFloat (fundo de troco herdado)", () => {
  it("herda o saldo declarado do último fechamento", () => {
    expect(resolveInheritedFloat(200)).toBe(200);
    expect(resolveInheritedFloat(37.5)).toBe(37.5);
  });

  it("retorna 0 quando não há caixa fechado anterior (null/undefined)", () => {
    expect(resolveInheritedFloat(null)).toBe(0);
    expect(resolveInheritedFloat(undefined)).toBe(0);
  });

  it("nunca herda valor negativo (caixa fechou no vermelho)", () => {
    expect(resolveInheritedFloat(-50)).toBe(0);
  });

  it("trata zero como zero (caixa anterior fechou vazio)", () => {
    expect(resolveInheritedFloat(0)).toBe(0);
  });

  it("ignora valores não finitos com segurança", () => {
    expect(resolveInheritedFloat(NaN)).toBe(0);
    expect(resolveInheritedFloat(Infinity)).toBe(0);
  });
});
