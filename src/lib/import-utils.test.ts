import { describe, it, expect } from "vitest";
import { parseSpreadsheetDate, parseBooleanField } from "./import-utils";

describe("parseSpreadsheetDate (bug rotina 21/06 — Cliente desde)", () => {
  // Verifica pelo dia em UTC: é o que sobrevive ao round-trip banco→exibição.
  it("parseia dd/MM/yyyy em texto (fixado em meia-noite UTC)", () => {
    const d = parseSpreadsheetDate("10/01/2020");
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString()).toBe("2020-01-10T00:00:00.000Z");
  });

  it("parseia serial Excel (número) — 44197 = 01/01/2021", () => {
    const d = parseSpreadsheetDate(44197);
    expect(d?.toISOString()).toBe("2021-01-01T00:00:00.000Z");
  });

  it("aceita Date nativo (xlsx cellDates) preservando o dia civil", () => {
    const d = parseSpreadsheetDate(new Date(2018, 5, 5, 13, 30)); // 05/06/2018 local
    expect(d?.toISOString()).toBe("2018-06-05T00:00:00.000Z");
  });

  it("CRÍTICO: round-trip de exibição não recua 1 dia (slice(0,10))", () => {
    // Simula: parse → grava ISO → exibe pelo dia UTC (como a ficha do cliente).
    const d = parseSpreadsheetDate("01/01/2020");
    const iso = d!.toISOString(); // "2020-01-01T00:00:00.000Z"
    const diaExibido = iso.slice(0, 10);
    expect(diaExibido).toBe("2020-01-01"); // NÃO 2019-12-31
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

  it("aceita data textual com espaços", () => {
    const d = parseSpreadsheetDate("  05/06/2018  ");
    expect(d?.toISOString()).toBe("2018-06-05T00:00:00.000Z");
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
