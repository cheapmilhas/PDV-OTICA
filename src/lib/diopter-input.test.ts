// src/lib/diopter-input.test.ts
import { describe, it, expect } from "vitest";
import { flipSign, sanitizeSign, formatDiopter } from "./diopter-input";

describe("sanitizeSign", () => {
  it("colapsa sinais múltiplos e força posição 0", () => {
    expect(sanitizeSign("--2,25")).toBe("-2,25");
    expect(sanitizeSign("2-,25")).toBe("-2,25");
    expect(sanitizeSign("+-2,25")).toBe("-2,25");
    expect(sanitizeSign("2,25-")).toBe("-2,25");
    expect(sanitizeSign("++2,25")).toBe("2,25"); // + é redundante → sem sinal
    expect(sanitizeSign("2,25")).toBe("2,25");
    expect(sanitizeSign("")).toBe("");
  });
});

describe("flipSign", () => {
  it("alterna o sinal preservando o número", () => {
    expect(flipSign("2,25")).toBe("-2,25");
    expect(flipSign("-2,25")).toBe("2,25");
  });
  it("campo vazio permanece vazio (não vira '-' órfão)", () => {
    expect(flipSign("")).toBe("");
  });
  it("normaliza sinal sujo antes de alternar", () => {
    // "2,25-" normaliza para "-2,25" (negativo) → flip vira "2,25"
    expect(flipSign("2,25-")).toBe("2,25");
    // "--2,25" normaliza para "-2,25" (negativo) → flip vira "2,25"
    expect(flipSign("--2,25")).toBe("2,25");
  });
});

describe("formatDiopter", () => {
  it("formata com sufixo D e vírgula", () => {
    expect(formatDiopter("-2,25")).toBe("−2,25 D");
    expect(formatDiopter("2.25")).toBe("+2,25 D"); // ponto=decimal na dioptria
    expect(formatDiopter("")).toBe("—");
  });
});
