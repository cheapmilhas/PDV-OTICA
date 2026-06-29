/**
 * Rótulos amigáveis (PT) + estilo das intenções classificadas pela IA.
 * Puro, sem I/O — usado no card do funil. Fallback seguro p/ valor desconhecido.
 */

import type { ContactIntent } from "@prisma/client";

export interface IntentLabel {
  label: string;
  /** "venda" = oportunidade; "atencao" = não-venda (precisa tratativa). */
  kind: "venda" | "atencao";
}

// Record<ContactIntent, …> força o MAP a cobrir TODOS os valores do enum:
// se o schema ganhar uma intenção nova, o tsc quebra aqui até dar rótulo a ela.
const MAP: Record<ContactIntent, IntentLabel> = {
  NOVA_COMPRA: { label: "Nova compra", kind: "venda" },
  ORCAMENTO_PRECO: { label: "Orçamento", kind: "venda" },
  RENOVACAO: { label: "Renovação", kind: "venda" },
  COMPROU_RECENTE: { label: "Comprou recente", kind: "venda" },
  AGUARDANDO_OS: { label: "Aguardando óculos", kind: "venda" },
  AGENDAMENTO_INFO: { label: "Agendamento/info", kind: "venda" },
  CONVENIO_PLANO: { label: "Convênio", kind: "venda" },
  SEGUNDA_VIA_RECEITA: { label: "2ª via receita", kind: "venda" },
  GARANTIA_CONSERTO: { label: "Garantia/conserto", kind: "atencao" },
  RECLAMACAO: { label: "Reclamação", kind: "atencao" },
  COBRANCA_FINANCEIRO: { label: "Financeiro", kind: "atencao" },
  OUTRO: { label: "Outro", kind: "atencao" },
};

/**
 * Lista ordenada das intenções p/ o dropdown de correção (vendas primeiro,
 * atenção depois). Derivada do MAP — única fonte de verdade dos rótulos.
 * `INTENT_VALUES` é a allowlist canônica (chaves do enum ContactIntent) que
 * o service e a rota reusam, evitando 3 cópias dessincronizadas do enum.
 */
export const INTENT_OPTIONS: ReadonlyArray<{ value: string; label: string; kind: "venda" | "atencao" }> =
  Object.entries(MAP)
    .map(([value, { label, kind }]) => ({ value, label, kind }))
    // Vendas primeiro, atenção depois — sort explícito (não depende da ordem do MAP).
    .sort((a, b) => (a.kind === "venda" ? 0 : 1) - (b.kind === "venda" ? 0 : 1));

export const INTENT_VALUES = Object.keys(MAP) as [ContactIntent, ...ContactIntent[]];

/**
 * Rótulo de uma intenção. Se `gerencial` for false, intenções sensíveis
 * (reclamação/cobrança) são mascaradas como "Precisa de atenção" — o vendedor
 * comum vê que precisa cuidar, sem o motivo sensível.
 */
export function intentLabel(intent: string | null | undefined, gerencial = true): IntentLabel | null {
  if (!intent) return null;
  // Acesso defensivo: `intent` vem do banco e pode (em tese) ser um valor fora
  // do enum — o cast permite a busca por string e o fallback abaixo cobre o miss.
  const found = (MAP as Record<string, IntentLabel>)[intent];
  if (!found) return { label: "Sugestão da IA", kind: "atencao" }; // fallback, nunca vazio
  if (!gerencial && found.kind === "atencao" && (intent === "RECLAMACAO" || intent === "COBRANCA_FINANCEIRO")) {
    return { label: "Precisa de atenção", kind: "atencao" };
  }
  return found;
}
