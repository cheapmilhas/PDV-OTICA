import { describe, it, expect } from "vitest";
import { csvCell, csvRow } from "./csv-safe";

describe("csvCell", () => {
  it("envolve valor simples em aspas", () => {
    expect(csvCell("Ótica Bom Ver")).toBe('"Ótica Bom Ver"');
  });
  it("escapa aspas internas dobrando-as", () => {
    expect(csvCell('Ele disse "oi"')).toBe('"Ele disse ""oi"""');
  });
  it("mantém vírgula e quebra de linha dentro das aspas", () => {
    expect(csvCell("a,b\nc")).toBe('"a,b\nc"');
  });
  it("neutraliza injeção de fórmula em STRINGS (= + - @)", () => {
    expect(csvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell("-1")).toBe(`"'-1"`); // string "-1" continua protegida
    expect(csvCell("@x")).toBe(`"'@x"`);
  });
  it("trata null/undefined", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
  it("emite NÚMEROS crus (sem aspas, sem prefixo) — preserva negativos/decimais no Excel", () => {
    expect(csvCell(42)).toBe("42");
    expect(csvCell(-5000)).toBe("-5000"); // valor monetário negativo permanece número
    expect(csvCell(12.5)).toBe("12.5");
    expect(csvCell(0)).toBe("0");
  });
});

describe("csvRow", () => {
  it("junta células sanitizadas com vírgula", () => {
    expect(csvRow(["a", "b,c"])).toBe('"a","b,c"');
  });
});
