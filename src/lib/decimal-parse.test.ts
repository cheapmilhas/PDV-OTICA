// src/lib/decimal-parse.test.ts
import { describe, it, expect } from "vitest";
import { parseMoneyPtBR, parseDiopter } from "./decimal-parse";

describe("parseMoneyPtBR (ponto = milhar)", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1.234", 1234],
    ["12,50", 12.5],
    ["1.234.567,89", 1234567.89],
    ["0,99", 0.99],
    ["", null],
    ["abc", null],
    ["  ", null],
  ])("parse(%j) = %s", (input, expected) => {
    expect(parseMoneyPtBR(input as string)).toBe(expected);
  });
});

describe("parseDiopter (ponto = decimal)", () => {
  it.each([
    ["2.25", 2.25],   // placeholder da grade ensina ponto decimal
    ["-1,75", -1.75],
    ["+0,50", 0.5],
    ["0", 0],
    ["-2,00", -2],
    ["", null],
    ["--2", null],     // sinal duplo inválido
    ["abc", null],
    ["1,2,3", null],   // múltiplas vírgulas inválido
  ])("parse(%j) = %s", (input, expected) => {
    expect(parseDiopter(input as string)).toBe(expected);
  });
});
