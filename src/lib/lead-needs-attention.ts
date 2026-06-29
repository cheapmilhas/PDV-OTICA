/**
 * "Precisa de atenção" (Fase 3, Item 1 — escopo read-only seguro).
 *
 * Marca leads que o gerente deveria olhar com prioridade: reclamação, cobrança,
 * garantia/conserto (intenções de TRATATIVA, não de venda) ou tom irritado
 * (urgent). É só LEITURA — não dispara nenhuma ação. Serve de visão consolidada
 * e, junto com a correção de intenção (Item 3), acumula os dados de acurácia que
 * habilitam a automação segura numa fase futura.
 *
 * NÃO inclui AGUARDANDO_OS aqui: "atrasado" deve vir de um fato determinístico
 * (OS com data prometida vencida), não do palpite da IA — senão polui a lista
 * com falsos positivos. Esse cruzamento fica para quando houver o sinal factual.
 */

/** Intenções de tratativa (não-venda) que pedem atenção do gerente. */
const ATTENTION_INTENTS: ReadonlySet<string> = new Set([
  "RECLAMACAO",
  "COBRANCA_FINANCEIRO",
  "GARANTIA_CONSERTO",
]);

export interface AttentionLead {
  intent?: string | null;
  urgent?: boolean | null;
}

/** True se o lead pede atenção (intenção de tratativa OU tom irritado). */
export function leadNeedsAttention(lead: AttentionLead): boolean {
  if (lead.urgent) return true;
  return !!lead.intent && ATTENTION_INTENTS.has(lead.intent);
}

/** Conta quantos leads precisam de atenção (p/ o badge/contador). */
export function countNeedsAttention(leads: ReadonlyArray<AttentionLead>): number {
  return leads.reduce((n, l) => (leadNeedsAttention(l) ? n + 1 : n), 0);
}
