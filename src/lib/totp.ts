/**
 * Q8.3.1: wrapper fino sobre speakeasy para MFA (TOTP) do admin.
 *
 * TOTP (RFC 6238) é offline: o servidor e o app do celular (Google Authenticator,
 * Authy, etc.) compartilham um segredo e, com a hora atual, calculam o mesmo
 * código de 6 dígitos — sem comunicação. Nada externo/pago é necessário.
 *
 * Códigos de recuperação: caso o admin perca o celular, 10 códigos de uso único
 * (guardados pelo admin) permitem login. São armazenados HASHEADOS no banco.
 */
import speakeasy from "speakeasy";
import { createHash, randomBytes } from "node:crypto";

const ISSUER = "PDV Ótica Admin";

export interface MfaSecret {
  base32: string;
  otpauthUrl: string;
}

/** Gera um novo segredo TOTP + a URL otpauth (vira QR Code). */
export function generateMfaSecret(adminEmail: string): MfaSecret {
  const secret = speakeasy.generateSecret({
    name: `${ISSUER} (${adminEmail})`,
    issuer: ISSUER,
  });
  return {
    base32: secret.base32,
    otpauthUrl: secret.otpauth_url ?? "",
  };
}

/**
 * Verifica um código TOTP de 6 dígitos contra o segredo. window=1 tolera ±30s
 * de dessincronia de relógio entre servidor e celular.
 */
export function verifyTotp(base32Secret: string, token: string): boolean {
  const clean = (token ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return speakeasy.totp.verify({
    secret: base32Secret,
    encoding: "base32",
    token: clean,
    window: 1,
  });
}

/** Gera N códigos de recuperação legíveis (ex.: "A1B2-C3D4"). */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  while (codes.length < count) {
    const raw = randomBytes(4).toString("hex").toUpperCase(); // 8 hex chars
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

/** Normaliza (upper, sem espaços/hífen) — tolera o admin digitar com variações. */
function normalizeRecovery(code: string): string {
  return (code ?? "").replace(/[\s-]/g, "").toUpperCase();
}

/** Hash SHA-256 de um código de recuperação (armazenado no banco). */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecovery(code)).digest("hex");
}

/** Confere se um código informado corresponde a um hash armazenado. */
export function matchRecoveryCode(code: string, hash: string): boolean {
  if (!code || !hash) return false;
  return hashRecoveryCode(code) === hash;
}
