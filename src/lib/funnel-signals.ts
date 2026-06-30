/**
 * Sinais objetivos da conversa p/ a régua de avanço do funil (Fatia 3). Libs
 * PURAS (sem banco): leem as mensagens e devolvem booleanos.
 *
 *  - clientEngaged: o cliente mandou ao menos 1 mensagem COM CONTEÚDO (não só
 *    saudação/sticker) → gatilho de Novo→Em atendimento.
 *  - oticaSentValue: a ÓTICA (outbound) mandou um valor em R$ ligado a venda →
 *    gatilho objetivo de Em atendimento→Orçamento enviado.
 */

export interface SignalMessage {
  direction: string; // "inbound" | "outbound"
  type: string;      // "text" | "audio" | "image" | ...
  text: string | null;
}

// Saudações/ruído que NÃO contam como engajamento (texto isolado).
const GREETINGS = new Set([
  "oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "ok", "okay",
  "obrigado", "obrigada", "blz", "beleza", "👍", "🙏", "valeu",
]);

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[.!?]+$/g, "");
}

/** Cliente mandou conteúdo real (não só saudação/sticker). */
export function clientEngaged(messages: SignalMessage[]): boolean {
  for (const m of messages) {
    if (m.direction !== "inbound") continue;
    if (m.type !== "text") continue; // sticker/imagem/áudio sem texto não conta
    const t = m.text ? normalize(m.text) : "";
    if (t.length === 0) continue;
    if (GREETINGS.has(t)) continue;
    // tem texto que não é só saudação → engajou
    return true;
  }
  return false;
}

// Valor monetário: "R$ 1.234,56" / "R$ 99" (R$ explícito sempre conta) OU
// número seguido de "reais". Para o caso "reais", exclui quando o trecho é
// precedido por "OS" (número de ordem de serviço, não preço).
const MONEY_RS = /r\$\s?\d[\d.,]*/i;
const MONEY_REAIS = /\b\d[\d.,]*\s?reais\b/i;
const OS_PREFIX = /\bos\s+\d[\d.,]*\s?reais\b/i;

function hasMoney(text: string): boolean {
  if (MONEY_RS.test(text)) return true;
  if (MONEY_REAIS.test(text) && !OS_PREFIX.test(text)) return true;
  return false;
}

/** A ótica (outbound) mandou um valor monetário (orçamento). */
export function oticaSentValue(messages: SignalMessage[]): boolean {
  for (const m of messages) {
    if (m.direction !== "outbound") continue;
    if (!m.text) continue;
    if (hasMoney(m.text)) return true;
  }
  return false;
}
