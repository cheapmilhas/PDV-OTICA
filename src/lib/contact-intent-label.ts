/**
 * Rótulos amigáveis (PT) + estilo das intenções classificadas pela IA.
 * Puro, sem I/O — usado no card do funil. Fallback seguro p/ valor desconhecido.
 */

export interface IntentLabel {
  label: string;
  /** "venda" = oportunidade; "atencao" = não-venda (precisa tratativa). */
  kind: "venda" | "atencao";
}

const MAP: Record<string, IntentLabel> = {
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
 * Rótulo de uma intenção. Se `gerencial` for false, intenções sensíveis
 * (reclamação/cobrança) são mascaradas como "Precisa de atenção" — o vendedor
 * comum vê que precisa cuidar, sem o motivo sensível.
 */
export function intentLabel(intent: string | null | undefined, gerencial = true): IntentLabel | null {
  if (!intent) return null;
  const found = MAP[intent];
  if (!found) return { label: "Sugestão da IA", kind: "atencao" }; // fallback, nunca vazio
  if (!gerencial && found.kind === "atencao" && (intent === "RECLAMACAO" || intent === "COBRANCA_FINANCEIRO")) {
    return { label: "Precisa de atenção", kind: "atencao" };
  }
  return found;
}
