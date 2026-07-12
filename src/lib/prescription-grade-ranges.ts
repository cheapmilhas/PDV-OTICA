/**
 * FONTE ÚNICA das faixas de dioptria (grau de óculos).
 *
 * Compartilhada por cliente (feedback visual do formulário) e servidor
 * (schema Zod). Existe UMA tabela — qualquer divergência entre front e back
 * significaria aceitar uma receita clinicamente errada, então não há segunda
 * cópia dos limites em lugar nenhum.
 *
 * Aceita vírgula decimal ("-1,75") e ponto ("-1.75"). Todos os campos são
 * opcionais (vazio = válido).
 */

export type GradeRangeField = "esf" | "cil" | "eixo" | "add" | "dnp" | "altura";

/**
 * Faixa [min, max] por campo. Tuplas exatas via `as const`.
 * - esf   Esférico: -30 a +30
 * - cil   Cilíndrico: -10 a +10 (aceita positivo — astigmatismo transposto)
 * - eixo  Eixo: 0 a 180
 * - add   Adição: +0,50 a +4,00
 * - dnp   DNP: 20 a 80
 * - altura Altura: 10 a 40
 */
export const GRADE_RANGES = {
  esf: [-30, 30],
  cil: [-10, 10],
  eixo: [0, 180],
  add: [0.5, 4],
  dnp: [20, 80],
  altura: [10, 40],
} as const satisfies Record<GradeRangeField, readonly [number, number]>;

/** Campos que só aceitam valor INTEIRO (eixo do astigmatismo, 0–180). */
const INTEGER_FIELDS = new Set(["eixo"]);

/**
 * Valida um valor cru contra a faixa do campo.
 * - vazio / null / undefined → `true` (campo opcional)
 * - não-numérico, múltiplos sinais ("--2,25", "abc") ou notação
 *   exponencial ("3e1") → `false`
 * - eixo fracionário ("90.5") → `false` (eixo é inteiro)
 * - campo desconhecido (sem faixa) → `true` (não restringido aqui)
 * - caso contrário → dentro de [min, max]
 */
export function checkRange(field: string, raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined || raw === "") return true;

  const s = String(raw).trim();
  // Notação exponencial ("3e1" = 30) é sintaxe válida de Number mas nunca uma
  // dioptria digitada — rejeita para não mascarar entrada absurda via API.
  if (/[eE]/.test(s)) return false;

  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return false;

  if (INTEGER_FIELDS.has(field) && !Number.isInteger(n)) return false;

  const range = (GRADE_RANGES as Record<string, readonly [number, number]>)[field];
  if (!range) return true;

  const [min, max] = range;
  return n >= min && n <= max;
}
