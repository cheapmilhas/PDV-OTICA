import { describe, it, expect } from "vitest";
import { phoneMatchKey, phoneMatches } from "./lead-phone-match";

describe("phoneMatchKey — chave canônica DDD+8díg", () => {
  it("celular com 9º dígito → DDD + 8 dígitos do miolo (descarta o 9)", () => {
    expect(phoneMatchKey("85999887766")).toBe("8599887766"); // 85 + 99887766
  });

  it("mesmo celular com máscara → mesma chave", () => {
    expect(phoneMatchKey("(85) 99988-7766")).toBe("8599887766");
  });

  it("mesmo celular com DDI +55 → mesma chave", () => {
    expect(phoneMatchKey("+55 85 99988-7766")).toBe("8599887766");
    expect(phoneMatchKey("5585999887766")).toBe("8599887766");
  });

  it("celular SEM o 9º dígito (10 díg) → mesma chave do com 9", () => {
    // 8599887766 (10 díg) deve casar com 85999887766 (11 díg)
    expect(phoneMatchKey("8599887766")).toBe("8599887766");
  });

  it("fixo de 10 dígitos → DDD + 8 (não perde dígito como se fosse 9º)", () => {
    // 8533445566 fixo: DDD 85 + 33445566
    expect(phoneMatchKey("8533445566")).toBe("8533445566");
  });

  it("número curto / sem DDD / lixo → null", () => {
    expect(phoneMatchKey("99887766")).toBeNull(); // 8 díg sem DDD
    expect(phoneMatchKey("123")).toBeNull();
    expect(phoneMatchKey("")).toBeNull();
    expect(phoneMatchKey("abc")).toBeNull();
  });
});

describe("phoneMatches — comparação por chave canônica", () => {
  it("casa celular com 9 vs sem 9 (mesmo miolo)", () => {
    expect(phoneMatches("85999887766", "8599887766")).toBe(true);
  });

  it("casa com máscara e DDI diferentes mas mesmo número", () => {
    expect(phoneMatches("(85) 99988-7766", "+5585999887766")).toBe(true);
  });

  it("NÃO casa mesmo miolo com DDD diferente (cross-DDD)", () => {
    // 85 99887766 vs 11 99887766 — miolo igual, DDD diferente → NÃO casa
    expect(phoneMatches("85999887766", "11999887766")).toBe(false);
  });

  it("NÃO casa quando um dos lados é inválido", () => {
    expect(phoneMatches("99887766", "85999887766")).toBe(false); // sem DDD
    expect(phoneMatches("", "85999887766")).toBe(false);
  });
});
