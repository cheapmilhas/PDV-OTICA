/**
 * Q8.2.3: idempotência de requisições de escrita (ex.: POST /api/sales).
 *
 * Canonicaliza o payload (ordena chaves, ignora campos voláteis, normaliza
 * Decimal-like) e gera um hash estável. Dois POSTs com o MESMO Idempotency-Key
 * devem ter o MESMO payload — se o hash diverge, é uma reutilização indevida da
 * chave (conflito), não um retry legítimo.
 */
import { createHash } from "node:crypto";

/** Campos que mudam a cada request e não devem afetar o hash. */
const VOLATILE_KEYS = new Set(["createdAt", "updatedAt", "requestId", "timestamp", "nonce"]);

/**
 * Retorna uma cópia canônica de `value`: objetos com chaves ordenadas, sem
 * campos voláteis; Decimal-like (tem toFixed/toString numérico) viram string.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);

  if (value && typeof value === "object") {
    // Decimal-like (Prisma.Decimal, etc.): normaliza para string estável.
    if ("toFixed" in value && typeof (value as { toFixed: unknown }).toFixed === "function") {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();

    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      if (VOLATILE_KEYS.has(key)) continue;
      sorted[key] = canonicalize(obj[key]);
    }
    return sorted;
  }

  return value;
}

/** Hash SHA-256 hex do payload canonicalizado. */
export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}
