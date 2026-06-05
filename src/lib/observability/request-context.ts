// src/lib/observability/request-context.ts
/**
 * Identidade de request para rastreabilidade (Regra 1).
 * Edge-safe: usa apenas crypto.randomUUID (disponível no runtime Edge).
 */
export const REQUEST_ID_HEADER = "x-request-id";

export function newRequestId(): string {
  return "req_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function readRequestId(headers: Headers): string {
  const existing = headers.get(REQUEST_ID_HEADER);
  if (existing && existing.startsWith("req_")) return existing;
  return newRequestId();
}
