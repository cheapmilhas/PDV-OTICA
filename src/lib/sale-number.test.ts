import { describe, it, expect } from "vitest";
import { saleDisplayNumber } from "./sale-number";

describe("saleDisplayNumber", () => {
  it("formata número sequencial com 6 dígitos", () => {
    expect(saleDisplayNumber({ id: "cuid1", number: 123 })).toBe("#000123");
  });

  it("cai no fallback (últimos 8 do id, maiúsculo) quando number é null", () => {
    // "cmopsjhmXYZ".slice(-8) = "psjhmXYZ" -> "#PSJHMXYZ"
    expect(saleDisplayNumber({ id: "cmopsjhmXYZ", number: null })).toBe(
      "#PSJHMXYZ"
    );
  });

  it("fallback (#DEF12345) quando number é 0", () => {
    // "abcdef12345".slice(-8) = "def12345" -> maiúsculo -> "#DEF12345"
    expect(saleDisplayNumber({ id: "abcdef12345", number: 0 })).toBe(
      "#DEF12345"
    );
  });

  it("fallback quando number é undefined", () => {
    expect(saleDisplayNumber({ id: "abcdef12345" })).toBe("#DEF12345");
  });
});
