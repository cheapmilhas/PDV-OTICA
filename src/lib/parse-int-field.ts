/**
 * Converte um campo de entrada opcional para inteiro positivo, distinguindo
 * "ausente" (→ null, válido) de "inválido" (→ erro). Evita o bug de
 * `x ? parseInt(x) : null`, onde `parseInt("abc")` = NaN é gravado/quebra o
 * Prisma com um 500 genérico, e `"0"`/`0` se comportam de forma inconsistente.
 *
 * Retorna `{ ok: true, value }` (value é number|null) ou `{ ok: false, error }`.
 */
export function parseOptionalPositiveInt(
  raw: unknown,
  label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  // Ausente/vazio → null (campo opcional não informado).
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: `${label} deve ser um número inteiro positivo` };
  }
  return { ok: true, value: n };
}
