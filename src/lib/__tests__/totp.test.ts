import { describe, it, expect } from "vitest";
import speakeasy from "speakeasy";
import {
  generateMfaSecret,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
  matchRecoveryCode,
} from "../totp";

describe("generateMfaSecret", () => {
  it("gera segredo base32 + otpauth URL com o label do admin", () => {
    const s = generateMfaSecret("admin@x.com");
    expect(s.base32).toBeTruthy();
    expect(s.otpauthUrl).toContain("otpauth://totp/");
    expect(decodeURIComponent(s.otpauthUrl)).toContain("admin@x.com");
  });
});

describe("verifyTotp", () => {
  it("aceita o código atual gerado pelo mesmo segredo", () => {
    const { base32 } = generateMfaSecret("a@b.com");
    const token = speakeasy.totp({ secret: base32, encoding: "base32" });
    expect(verifyTotp(base32, token)).toBe(true);
  });

  it("rejeita código errado", () => {
    const { base32 } = generateMfaSecret("a@b.com");
    expect(verifyTotp(base32, "000000")).toBe(false);
  });

  it("rejeita formato inválido (não-6-dígitos)", () => {
    const { base32 } = generateMfaSecret("a@b.com");
    expect(verifyTotp(base32, "abc")).toBe(false);
    expect(verifyTotp(base32, "")).toBe(false);
  });
});

describe("recovery codes", () => {
  it("gera N códigos únicos", () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });

  it("hash + match: código correto bate, errado não", () => {
    const [code] = generateRecoveryCodes(1);
    const hash = hashRecoveryCode(code);
    expect(matchRecoveryCode(code, hash)).toBe(true);
    expect(matchRecoveryCode("WRONG-CODE", hash)).toBe(false);
  });

  it("match é case-insensitive e ignora espaços", () => {
    const [code] = generateRecoveryCodes(1);
    const hash = hashRecoveryCode(code);
    expect(matchRecoveryCode(` ${code.toLowerCase()} `, hash)).toBe(true);
  });
});
