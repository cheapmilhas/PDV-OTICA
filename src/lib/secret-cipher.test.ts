import { describe, it, expect, beforeEach } from "vitest";
import { encryptSecret, decryptSecret } from "./secret-cipher";

// ENCRYPTION_KEY = 32 bytes em hex (64 chars)
const KEY = "0".repeat(64);
beforeEach(() => { process.env.ENCRYPTION_KEY = KEY; });

describe("secret-cipher", () => {
  it("round-trip: decrypt(encrypt(x)) === x", () => {
    const plain = "sk-ant-api03-abcdef123456";
    const enc = encryptSecret(plain);
    expect(enc).not.toBe(plain);
    expect(enc).toContain(":"); // iv:cipher:tag
    expect(decryptSecret(enc)).toBe(plain);
  });
  it("dois encrypts do mesmo texto dão ciphertexts diferentes (IV aleatório)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });
  it("detecta adulteração (authTag inválido lança)", () => {
    const enc = encryptSecret("segredo");
    const [iv, ct, _tag] = enc.split(":");
    const tampered = `${iv}:${ct}:${"0".repeat(32)}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
  it("lança se ENCRYPTION_KEY ausente", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/ENCRYPTION_KEY/);
  });
});
