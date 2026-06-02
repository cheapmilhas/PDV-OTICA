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
  it("neutraliza injeção de fórmula (= + - @)", () => {
    expect(csvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell("-1")).toBe(`"'-1"`);
    expect(csvCell("@x")).toBe(`"'@x"`);
  });
  it("trata null/undefined/number", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
  });
});

describe("csvRow", () => {
  it("junta células sanitizadas com vírgula", () => {
    expect(csvRow(["a", "b,c"])).toBe('"a","b,c"');
  });
});
