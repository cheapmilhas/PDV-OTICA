/**
 * Normaliza um valor de LOGIN para o formato que o banco/authorize esperam.
 * sem "@" → "<valor>@login" (sintético); com "@" → minúsculo + trim.
 * Espelha auth.ts:72-74 — o que é gravado é sempre alcançável no login.
 */
export function normalizeLoginEmail(raw: string): string {
  const v = raw.trim();
  return v.includes("@") ? v.toLowerCase() : `${v.toLowerCase()}@login`;
}
