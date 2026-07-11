import crypto from "crypto";

/**
 * Camada PURA (sem Prisma, sem I/O) de criptografia de token de reset de senha.
 *
 * Padrão selector/verifier:
 * - `selector`: público, viaja no link e é indexado no banco (`@unique`).
 * - `verifier`: segredo; NUNCA é persistido em claro — persistimos só `verifierHash`
 *   (SHA-256 do verifier). A validação compara hashes com `timingSafeEqual`
 *   (comparação em tempo constante, anti-timing-attack).
 */

export interface TokenParts {
  selector: string;
  verifier: string;
  verifierHash: string;
}

/**
 * Gera as três partes do token: selector (público), verifier (segredo) e o
 * hash SHA-256 do verifier (único valor persistido).
 */
export function generateTokenParts(): TokenParts {
  const selector = crypto.randomBytes(16).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const verifierHash = hashVerifier(verifier);
  return { selector, verifier, verifierHash };
}

/**
 * SHA-256 (hex) do verifier. Determinístico: mesmo verifier → mesmo hash.
 */
export function hashVerifier(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("hex");
}

/**
 * Separa um token `selector.verifier` no PRIMEIRO ponto.
 * Retorna null se malformado (sem ponto, ou selector/verifier vazio).
 * Um verifier base64url não contém ".", então o split no primeiro "." é seguro.
 */
export function splitToken(token: string): { selector: string; verifier: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const selector = token.slice(0, dot);
  const verifier = token.slice(dot + 1);
  if (!selector || !verifier) return null;
  return { selector, verifier };
}

/**
 * Compara o hash do verifier informado com o hash persistido, em tempo constante.
 * Se os comprimentos diferirem, retorna false SEM chamar `timingSafeEqual`
 * (que lança para buffers de tamanhos diferentes).
 */
export function verifyToken(row: { verifierHash: string }, verifier: string): boolean {
  const computed = Buffer.from(hashVerifier(verifier));
  const stored = Buffer.from(row.verifierHash);
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
}
