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
  it("retorna null para data de calendário impossível (2026-02-30)", () => {
    expect(daysAgo("2026-02-30", HOJE)).toBeNull();
  });
  it("retorna null para formato não-ISO (30/02/2026)", () => {
    expect(daysAgo("30/02/2026", HOJE)).toBeNull();
  });
  it("é estável independente do fuso (usa UTC, não meia-noite local)", () => {
    // Mesma data, mesmo resultado — não deve variar com o horário/fuso da máquina.
    expect(daysAgo("2026-07-01", "2026-07-11")).toBe(10);
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
