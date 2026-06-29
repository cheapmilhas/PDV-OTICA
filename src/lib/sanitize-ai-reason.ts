/**
 * Sanitiza o "motivo" curto que a IA gera ao classificar uma conversa, ANTES de
 * persistir/exibir. O texto é livre (vem do modelo) e pode capturar PII ou valor
 * sensível da conversa real do cliente (R$ de dívida, CPF, telefone, e-mail) —
 * que seria exposto a todo usuário com acesso ao inbox. Minimização (LGPD):
 * mascara o que parece sensível e trunca. Puro, sem I/O. Fail-safe: string vazia
 * de entrada → "".
 */

const PATTERNS: ReadonlyArray<[RegExp, string]> = [
  // Valores monetários: R$ 1.234,56 / R$1234 / 1.234,56 reais
  [/R\$\s?\d[\d.,]*/gi, "[valor]"],
  [/\d[\d.,]*\s*reais\b/gi, "[valor]"],
  // E-mail
  [/[\w.+-]+@[\w-]+\.[\w.-]+/gi, "[email]"],
  // Sequências longas de dígitos (CPF, telefone, nº pedido) — 8+ dígitos com
  // separadores opcionais. Não mascara números curtos (ex.: "2 óculos").
  [/\b[\d.\-/()\s]{8,}\b/g, "[número]"],
];

export function sanitizeAiReason(reason: string | null | undefined, maxLen = 200): string {
  if (!reason) return "";
  let out = reason;
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl);
  return out.trim().slice(0, maxLen);
}
