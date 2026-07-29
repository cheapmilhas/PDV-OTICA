import { describe, it, expect } from "vitest";
import { isWriteRestricted, WRITE_RESTRICTION_DAY } from "./subscription-grace";

describe("isWriteRestricted", () => {
  it("no dia do vencimento (0 dias) → NÃO restringe: o cliente segue trabalhando", () => {
    expect(isWriteRestricted(0)).toBe(false);
  });

  it("durante os avisos (3, 7, 13 dias) → NÃO restringe", () => {
    expect(isWriteRestricted(3)).toBe(false);
    expect(isWriteRestricted(7)).toBe(false);
    expect(isWriteRestricted(13)).toBe(false);
  });

  it("no marco final (14 dias) → restringe", () => {
    expect(isWriteRestricted(14)).toBe(true);
  });

  it("depois do marco final → segue restrito", () => {
    expect(isWriteRestricted(30)).toBe(true);
  });

  it("dias negativos (relógio torto / webhook adiantado) → NÃO restringe", () => {
    expect(isWriteRestricted(-1)).toBe(false);
  });

  it("o marco de restrição é o mesmo da suspensão da régua (14)", () => {
    expect(WRITE_RESTRICTION_DAY).toBe(14);
  });
});
