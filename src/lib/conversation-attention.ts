/**
 * Sinal de "precisa de atenção humana" de uma CONVERSA de WhatsApp (≠ de um lead).
 *
 * PORQUÊ EXISTE: uma reclamação/cobrança é `isLead=false` — NÃO vira card no
 * funil. Sem um sinal próprio na CONVERSA, o cliente furioso some no "Não-lead"
 * (era um bug real de produção: o flag da régua `decideFunnelAdvance` é código
 * morto p/ reclamação, pois só roda no motor de auto-move, que exige leadId e
 * está atrás do kill-switch). Este é o guardrail SAGRADO (~100% recall).
 *
 * FUNÇÃO PURA (sem I/O): a PROD (conversation-qualifier `finalize`) e o EVAL
 * (harness) chamam a MESMA lógica. Se o eval medisse a régua e a prod usasse
 * outro caminho, o placar mediria código que não dispara p/ reclamação de verdade.
 *
 * Reusa `ATTENTION_INTENTS`/`leadNeedsAttention` como base p/ o tier suave —
 * NÃO forka um 3º conceito de "atenção" (o kanban já tem o dele).
 */

import type { ContactIntent } from "@/lib/ai/lead-qualifier";

/** ALARME VERMELHO — intenções que sempre acendem o guardrail sagrado. */
const RED_INTENTS: ReadonlySet<string> = new Set<string>([
  "RECLAMACAO",
  "COBRANCA_FINANCEIRO",
]);

/** TIER SUAVE — atenção operacional, marcador secundário (não o alarme). */
const SOFT_INTENTS: ReadonlySet<string> = new Set<string>([
  "GARANTIA_CONSERTO",
]);

export interface ConversationAttentionSignal {
  intent?: ContactIntent | string | null;
  /** Tom irritado/urgente detectado pela IA — rede de segurança ortogonal. */
  urgent?: boolean | null;
}

/**
 * ALARME VERMELHO (guardrail sagrado, ~100% recall). True quando:
 *  - a intenção é RECLAMACAO/COBRANCA_FINANCEIRO, OU
 *  - o tom é `urgent` (qualquer intenção) — cobre o cliente irritado que a IA
 *    classificou errado, o maior buraco de recall.
 *
 * Este é o valor persistido em `WhatsappConversation.needsHumanAttention`, que é
 * MONOTÔNICO-PRA-CIMA (nunca auto-limpa; só humano dá baixa) — ver finalize.
 */
export function conversationNeedsHumanAttention(sig: ConversationAttentionSignal): boolean {
  if (sig.urgent === true) return true;
  return !!sig.intent && RED_INTENTS.has(sig.intent);
}

export type AttentionTier = "red" | "soft" | null;

/**
 * Tier p/ o badge do inbox: "red" (alarme sagrado) > "soft" (garantia) > null.
 * `red` reusa exatamente o guardrail acima; `soft` é o marcador operacional.
 */
export function conversationAttentionTier(sig: ConversationAttentionSignal): AttentionTier {
  if (conversationNeedsHumanAttention(sig)) return "red";
  if (!!sig.intent && SOFT_INTENTS.has(sig.intent)) return "soft";
  return null;
}
