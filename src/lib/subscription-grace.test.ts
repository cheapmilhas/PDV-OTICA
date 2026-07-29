import { describe, it, expect } from "vitest";
import { isWriteRestricted, WRITE_RESTRICTION_DAY } from "./subscription-grace";

describe("isWriteRestricted", () => {
  it("no dia do vencimento (0 dias), aviso despachado → NÃO restringe: o cliente segue trabalhando", () => {
    expect(isWriteRestricted(0, true)).toBe(false);
  });

  it("durante os avisos (3, 7, 13 dias), aviso despachado → NÃO restringe", () => {
    expect(isWriteRestricted(3, true)).toBe(false);
    expect(isWriteRestricted(7, true)).toBe(false);
    expect(isWriteRestricted(13, true)).toBe(false);
  });

  it("no marco final (14 dias), aviso despachado → restringe", () => {
    expect(isWriteRestricted(14, true)).toBe(true);
  });

  it("depois do marco final, aviso despachado → segue restrito", () => {
    expect(isWriteRestricted(30, true)).toBe(true);
  });

  it("dias negativos (relógio torto / webhook adiantado) → NÃO restringe", () => {
    expect(isWriteRestricted(-1, true)).toBe(false);
  });

  it("o marco de restrição é o mesmo da suspensão da régua (14)", () => {
    expect(WRITE_RESTRICTION_DAY).toBe(14);
  });

  it("passou do marco (20 dias) MAS o aviso NÃO foi despachado → NÃO restringe (o furo que esta entrega fecha)", () => {
    expect(isWriteRestricted(20, false)).toBe(false);
  });
});
