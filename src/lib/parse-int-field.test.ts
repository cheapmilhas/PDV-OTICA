import { describe, it, expect } from "vitest";
import { parseOptionalPositiveInt } from "./parse-int-field";

describe("parseOptionalPositiveInt", () => {
  it("ausente/vazio → null válido (campo opcional)", () => {
    for (const v of [null, undefined, ""]) {
      const r = parseOptionalPositiveInt(v, "Série");
      expect(r).toEqual({ ok: true, value: null });
    }
  });

  it("string numérica válida → inteiro", () => {
    expect(parseOptionalPositiveInt("5", "Série")).toEqual({ ok: true, value: 5 });
    expect(parseOptionalPositiveInt(" 12 ", "Série")).toEqual({ ok: true, value: 12 });
    expect(parseOptionalPositiveInt(3, "Série")).toEqual({ ok: true, value: 3 });
  });

  it("string não-numérica → erro (não NaN gravado)", () => {
    const r = parseOptionalPositiveInt("abc", "Série NF-e");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Série NF-e");
  });

  it("valores parciais como '1a' → erro (Number('1a') = NaN)", () => {
    expect(parseOptionalPositiveInt("1a", "Série").ok).toBe(false);
  });

  it("zero e negativos → erro (série é positiva)", () => {
    expect(parseOptionalPositiveInt("0", "Série").ok).toBe(false);
    expect(parseOptionalPositiveInt(0, "Série").ok).toBe(false);
    expect(parseOptionalPositiveInt("-3", "Série").ok).toBe(false);
  });

  it("decimais → erro (precisa ser inteiro)", () => {
    expect(parseOptionalPositiveInt("1.5", "Série").ok).toBe(false);
    expect(parseOptionalPositiveInt(2.5, "Série").ok).toBe(false);
  });
});
