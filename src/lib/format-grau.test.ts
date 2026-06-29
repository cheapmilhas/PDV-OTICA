import { describe, it, expect } from "vitest";
import { formatGrau } from "./format-grau";

describe("formatGrau", () => {
  describe("dioptria (esférico/cilíndrico/adição)", () => {
    it("negativo: -1 → -1,00", () => {
      expect(formatGrau(-1, "dioptria")).toBe("-1,00");
    });
    it("negativo com decimal: -1.5 → -1,50", () => {
      expect(formatGrau(-1.5, "dioptria")).toBe("-1,50");
    });
    it("positivo ganha sinal +: 0.75 → +0,75", () => {
      expect(formatGrau(0.75, "dioptria")).toBe("+0,75");
    });
    it("zero sem sinal: 0 → 0,00", () => {
      expect(formatGrau(0, "dioptria")).toBe("0,00");
    });
    it("string com ponto: '-0.5' → -0,50", () => {
      expect(formatGrau("-0.5", "dioptria")).toBe("-0,50");
    });
    it("string com minus unicode: '−2' → -2,00", () => {
      expect(formatGrau("−2", "dioptria")).toBe("-2,00");
    });
  });

  describe("eixo", () => {
    it("inteiro sem sinal: 75 → 75", () => {
      expect(formatGrau(75, "eixo")).toBe("75");
    });
    it("string '120' → 120", () => {
      expect(formatGrau("120", "eixo")).toBe("120");
    });
    it("arredonda decimal: 89.6 → 90", () => {
      expect(formatGrau(89.6, "eixo")).toBe("90");
    });
  });

  describe("medida (dnp/altura)", () => {
    it("inteiro: 32 → 32", () => {
      expect(formatGrau(32, "medida")).toBe("32");
    });
    it("decimal com vírgula: 18.5 → 18,5", () => {
      expect(formatGrau(18.5, "medida")).toBe("18,5");
    });
  });

  describe("vazios", () => {
    it("null → —", () => { expect(formatGrau(null, "dioptria")).toBe("—"); });
    it("undefined → —", () => { expect(formatGrau(undefined, "eixo")).toBe("—"); });
    it("string vazia → —", () => { expect(formatGrau("", "medida")).toBe("—"); });
    it("lixo não-numérico → —", () => { expect(formatGrau("abc", "dioptria")).toBe("—"); });
  });
});
