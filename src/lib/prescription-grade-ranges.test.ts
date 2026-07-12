// src/lib/prescription-grade-ranges.test.ts
import { describe, it, expect } from "vitest";
import { GRADE_RANGES, checkRange } from "./prescription-grade-ranges";

describe("GRADE_RANGES", () => {
  it("faixas corretas (fonte única)", () => {
    expect(GRADE_RANGES.cil).toEqual([-10, 10]);   // NÃO -10..0 (bug antigo da OS)
    expect(GRADE_RANGES.dnp).toEqual([20, 80]);     // NÃO 20..40
    expect(GRADE_RANGES.altura).toEqual([10, 40]);  // NÃO 10..45
    expect(GRADE_RANGES.esf).toEqual([-30, 30]);
    expect(GRADE_RANGES.add).toEqual([0.5, 4]);
    expect(GRADE_RANGES.eixo).toEqual([0, 180]);
  });
});

describe("checkRange", () => {
  it("aceita vazio (campo opcional)", () => {
    expect(checkRange("cil", "")).toBe(true);
    expect(checkRange("cil", null)).toBe(true);
    expect(checkRange("cil", undefined)).toBe(true);
  });
  it("aceita cilíndrico positivo (astigmatismo transposto)", () => {
    expect(checkRange("cil", "+0,75")).toBe(true);
    expect(checkRange("cil", "0.75")).toBe(true);   // ponto=decimal
  });
  it("rejeita fora da faixa", () => {
    expect(checkRange("cil", "+11")).toBe(false);
    expect(checkRange("altura", "99")).toBe(false);
  });
  it("rejeita não-numérico / múltiplos sinais", () => {
    expect(checkRange("esf", "--2,25")).toBe(false);
    expect(checkRange("esf", "abc")).toBe(false);
  });
});
