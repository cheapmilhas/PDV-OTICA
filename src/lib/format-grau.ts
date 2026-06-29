/**
 * Formata um valor de grau de receita óptica segundo a convenção brasileira.
 * - "dioptria" (esférico/cilíndrico/adição): 2 casas, vírgula, sinal explícito (+/-); zero sem sinal.
 * - "eixo": inteiro (arredondado), sem sinal.
 * - "medida" (DNP/altura): número simples, vírgula decimal, sem sinal.
 * Vazio/nulo/inválido → "—".
 */
export type GrauTipo = "dioptria" | "eixo" | "medida";

function parseNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // string: aceita minus unicode (−) e vírgula decimal
  const cleaned = String(v).trim().replace(/−/g, "-").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatGrau(value: number | string | null | undefined, tipo: GrauTipo): string {
  const n = parseNum(value);
  if (n === null) return "—";

  if (tipo === "eixo") {
    return String(Math.round(n));
  }

  if (tipo === "medida") {
    // número simples; vírgula como separador, sem zeros decimais forçados
    return String(n).replace(".", ",");
  }

  // dioptria: 2 casas, vírgula, sinal explícito (zero sem sinal)
  const abs = Math.abs(n).toFixed(2).replace(".", ",");
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs; // zero → "0,00" sem sinal
}
