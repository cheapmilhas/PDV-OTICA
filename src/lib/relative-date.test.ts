import { describe, it, expect } from "vitest";
import { daysAgo, formatRelative } from "./relative-date";

const HOJE = "2026-07-11";

describe("daysAgo", () => {
  it("retorna 0 para a mesma data", () => {
    expect(daysAgo("2026-07-11", HOJE)).toBe(0);
  });
  it("retorna 12 para 12 dias atrás", () => {
    expect(daysAgo("2026-06-29", HOJE)).toBe(12);
  });
  it("retorna null para data futura", () => {
    expect(daysAgo("2026-07-20", HOJE)).toBeNull();
  });
  it("retorna null para data inválida", () => {
    expect(daysAgo("não-é-data", HOJE)).toBeNull();
  });
});

describe("formatRelative", () => {
  it("dia 0 => 'hoje'", () => {
    expect(formatRelative("2026-07-11", HOJE)).toBe("hoje");
  });
  it("1 dia => 'há 1 dia' (singular)", () => {
    expect(formatRelative("2026-07-10", HOJE)).toBe("há 1 dia");
  });
  it("N dias => 'há N dias' (plural)", () => {
    expect(formatRelative("2026-06-29", HOJE)).toBe("há 12 dias");
  });
  it("data inválida/futura => string vazia", () => {
    expect(formatRelative("2026-07-20", HOJE)).toBe("");
  });
});
