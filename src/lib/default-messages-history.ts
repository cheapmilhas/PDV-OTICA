import { DEFAULT_MESSAGES } from "./default-messages";

export type MessageKey = keyof typeof DEFAULT_MESSAGES;

/**
 * Histórico de TODOS os textos default já distribuídos pelo sistema.
 *
 * REGRA DE MANUTENÇÃO (importante): ao MUDAR um texto em DEFAULT_MESSAGES,
 * adicione o texto ANTIGO ao array do campo correspondente aqui. É assim que o
 * sincronizador automático distingue "default antigo intacto" (atualiza para o
 * novo) de "texto personalizado pela ótica" (nunca toca).
 */
export const HISTORICAL_DEFAULTS: Record<MessageKey, string[]> = {
  thankYou: [],
  quote: [],
  reminder: [],
  birthday: [],
};

export type MessageClass = "missing" | "current-default" | "stale-default" | "custom";

/** Coluna do CompanySettings correspondente a cada chave de mensagem. */
export const MESSAGE_FIELD_BY_KEY = {
  thankYou: "messageThankYou",
  quote: "messageQuote",
  reminder: "messageReminder",
  birthday: "messageBirthday",
} as const;

export function classifyMessageValue(
  key: MessageKey,
  value: string | null | undefined,
  history: Record<MessageKey, string[]> = HISTORICAL_DEFAULTS
): MessageClass {
  if (value == null || value.trim() === "") return "missing";
  const v = value.trim();
  if (v === DEFAULT_MESSAGES[key].trim()) return "current-default";
  if (history[key].some((old) => old.trim() === v)) return "stale-default";
  return "custom";
}
