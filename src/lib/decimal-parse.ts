// src/lib/decimal-parse.ts
/**
 * Dois parsers decimais com convenções INCOMPATÍVEIS para o ponto — NUNCA use um
 * no lugar do outro:
 * - DINHEIRO (pt-BR): ponto = separador de milhar, vírgula = decimal.
 *   "1.234,56" → 1234.56
 * - DIOPTRIA: ponto = decimal (o placeholder da grade é "+0.00").
 *   "2.25" → 2.25   ("2.25" como milhar viraria 225 → lente errada)
 * Ambos retornam `null` para vazio/inválido (nunca NaN, nunca 0-implícito).
 */

/** Dinheiro pt-BR: remove pontos de milhar, vírgula vira ponto decimal. */
export function parseMoneyPtBR(raw: string): number | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Dioptria: ponto OU vírgula = decimal; um único sinal opcional à frente. */
export function parseDiopter(raw: string): number | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const normalized = s.replace(",", ".");
  // Aceita: sinal opcional, dígitos, no máximo um ponto decimal. Rejeita sinal
  // duplo, múltiplos separadores, notação exponencial, lixo.
  if (!/^[+-]?\d*\.?\d+$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
