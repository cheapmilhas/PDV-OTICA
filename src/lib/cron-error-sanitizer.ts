/**
 * Sanitiza a mensagem de erro CRUA de um cron antes de exibi-la ao super admin.
 *
 * O `lastError` gravado por finishCronRun é `err.message` cru — erros de
 * Prisma/Asaas/Resend podem embutir PII de clientes das óticas (e-mail, CPF,
 * CNPJ, telefone). Esta função redige o que reconhece (best-effort) e trunca.
 *
 * A truncagem é o BACKSTOP real de contenção; a lista de regex não é exaustiva
 * (connection strings, tokens e UUIDs podem passar) — não sobre-invista nela.
 */
const MAX_LEN = 300;

const REDACTIONS: RegExp[] = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // e-mail
  /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, // CNPJ com máscara
  /\d{3}\.\d{3}\.\d{3}-\d{2}/g, // CPF com máscara
  /\(?\d{2}\)?\s?\d{4,5}-?\d{4}/g, // telefone BR
  /\b\d{11}\b/g, // CPF sem máscara (11 dígitos)
];

export function sanitizeCronError(raw: string | null): string | null {
  if (raw === null) return null;
  let out = raw;
  for (const re of REDACTIONS) {
    out = out.replace(re, "[redigido]");
  }
  if (out.length > MAX_LEN) {
    out = out.slice(0, MAX_LEN) + "…";
  }
  return out;
}
