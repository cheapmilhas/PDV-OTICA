// src/lib/diopter-input.ts
/**
 * Utilitários PUROS de sinal/formatação para campos de dioptria.
 * Value é sempre string (aceita vírgula, ex. "-2,25"). Ponto = decimal aqui
 * (o placeholder da grade é "+0.00"); o parse de dioptria trata "2.25" = 2,25.
 */

const DIGITS_COMMA = /[^0-9.,]/g;

/** Colapsa sinais múltiplos e força "-" na posição 0. "+" é redundante (removido). */
export function sanitizeSign(raw: string): string {
  if (!raw) return "";
  const negative = raw.includes("-");
  const body = raw.replace(DIGITS_COMMA, ""); // tira todo sinal e lixo
  if (body === "") return negative ? "-" : "";
  return negative ? `-${body}` : body;
}

/** Alterna o sinal. Vazio permanece vazio (sem "-" órfão). */
export function flipSign(raw: string): string {
  const clean = sanitizeSign(raw);
  if (clean === "" || clean === "-") return "";
  return clean.startsWith("-") ? clean.slice(1) : `-${clean}`;
}

/**
 * Exibição do valor de dioptria. Aceita ponto ou vírgula na entrada.
 * `withUnit=true` (padrão) anexa " D" (dioptria) — usado no visor grande do
 * teclado. No campo compacto da grade passe `false`: a coluna já diz
 * Esférico/Cilíndrico, então o "D" só polui.
 */
export function formatDiopter(raw: string, withUnit = true): string {
  if (!raw || raw === "-" || raw === "+") return "—";
  const clean = sanitizeSign(raw).replace(".", ",");
  if (clean === "" || clean === "-") return "—";
  const sign = clean.startsWith("-") ? "−" : "+";
  const body = clean.replace("-", "");
  return withUnit ? `${sign}${body} D` : `${sign}${body}`;
}
