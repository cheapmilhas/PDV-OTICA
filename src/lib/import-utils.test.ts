import { describe, it, expect } from "vitest";
import { parseSpreadsheetDate, parseBooleanField } from "./import-utils";

describe("parseSpreadsheetDate (bug rotina 21/06 — Cliente desde)", () => {
  it("parseia dd/MM/yyyy em texto", () => {
    const d = parseSpreadsheetDate("10/01/2020");
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2020);
    expect(d?.getMonth()).toBe(0); // janeiro
    expect(d?.getDate()).toBe(10);
  });

  it("parseia serial Excel (número) — 44197 = 01/01/2021", () => {
    // 44197 dias após o epoch Excel (1899-12-30) = 01/01/2021.
    const d = parseSpreadsheetDate(44197);
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2021);
    expect(d?.getMonth()).toBe(0); // janeiro
    expect(d?.getDate()).toBe(1);
  });

  it("retorna null para vazio/undefined/null", () => {
    expect(parseSpreadsheetDate("")).toBeNull();
    expect(parseSpreadsheetDate("   ")).toBeNull();
    expect(parseSpreadsheetDate(undefined)).toBeNull();
    expect(parseSpreadsheetDate(null)).toBeNull();
  });

  it("retorna null para data inválida (não quebra o import)", () => {
    expect(parseSpreadsheetDate("não é data")).toBeNull();
    expect(parseSpreadsheetDate("32/13/2020")).toBeNull();
  });

  it("aceita data em formato textual com espaços", () => {
    const d = parseSpreadsheetDate("  05/06/2018  ");
    expect(d?.getFullYear()).toBe(2018);
    expect(d?.getMonth()).toBe(5); // junho
  });
});

// Guard de regressão para a função pré-existente.
describe("parseBooleanField (não regrediu)", () => {
  it("reconhece sim/não", () => {
    expect(parseBooleanField("Sim", false)).toEqual({ value: true, recognized: true });
    expect(parseBooleanField("Não", true)).toEqual({ value: false, recognized: true });
  });
  it("usa default quando vazio", () => {
    expect(parseBooleanField("", true)).toEqual({ value: true, recognized: true });
  });
});
