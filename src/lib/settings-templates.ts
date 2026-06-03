import { DEFAULT_MESSAGES } from "@/lib/default-messages";

/**
 * Templates de mensagem (WhatsApp) que vivem em CompanySettings.
 * Registros criados antes destas colunas existirem (drift de schema) têm os
 * campos NULL e nunca recebiam os defaults — o que travava silenciosamente os
 * botões de "Agradecer/Orçamento/Lembrete/Aniversário" (early-return por
 * template ausente). Esta função pura calcula o patch de backfill: só os
 * campos faltantes (null/vazio) recebem o default. Quem persiste é o get().
 */

export interface MessageTemplateFields {
  messageThankYou?: string | null;
  messageQuote?: string | null;
  messageReminder?: string | null;
  messageBirthday?: string | null;
}

const TEMPLATE_DEFAULTS: ReadonlyArray<
  readonly [keyof MessageTemplateFields, string]
> = [
  ["messageThankYou", DEFAULT_MESSAGES.thankYou],
  ["messageQuote", DEFAULT_MESSAGES.quote],
  ["messageReminder", DEFAULT_MESSAGES.reminder],
  ["messageBirthday", DEFAULT_MESSAGES.birthday],
];

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

/**
 * Retorna apenas os campos de template que estão faltando (null/vazio),
 * preenchidos com o default. Objeto vazio quando nada falta — sinaliza ao
 * chamador que NÃO precisa escrever no banco (idempotente).
 */
export function missingMessageTemplates(
  settings: MessageTemplateFields
): Partial<Record<keyof MessageTemplateFields, string>> {
  const patch: Partial<Record<keyof MessageTemplateFields, string>> = {};
  for (const [field, fallback] of TEMPLATE_DEFAULTS) {
    if (isBlank(settings[field])) {
      patch[field] = fallback;
    }
  }
  return patch;
}
