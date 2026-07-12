import { describe, it, expect } from "vitest";
import { generateTokenParts, hashVerifier, splitToken, verifyToken } from "./password-reset.service";

describe("password-reset token", () => {
  it("gera selector+verifier+hash; hash é sha256 do verifier, nunca o verifier em claro", () => {
    const { selector, verifier, verifierHash } = generateTokenParts();
    expect(selector.length).toBeGreaterThan(10);
    expect(verifier.length).toBeGreaterThan(20);
    expect(verifierHash).toBe(hashVerifier(verifier));
    expect(verifierHash).not.toContain(verifier);
  });
  it("splitToken parseia selector.verifier e rejeita malformado", () => {
    expect(splitToken("abc.def")).toEqual({ selector: "abc", verifier: "def" });
    expect(splitToken("semponto")).toBeNull();
    expect(splitToken("")).toBeNull();
  });
  it("verifyToken aceita verifier correto e rejeita errado (timingSafeEqual)", () => {
    const { verifier, verifierHash } = generateTokenParts();
    expect(verifyToken({ verifierHash }, verifier)).toBe(true);
    expect(verifyToken({ verifierHash }, "errado")).toBe(false);
  });
});
