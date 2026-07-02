import { LostReasonCategory } from "@prisma/client";

/**
 * Rótulos em português dos motivos de perda ESTRUTURADOS (Sprint 3, #8). Fonte
 * única usada pelo modal (botões), pelo filtro da aba "Recuperar" e pela exibição.
 * A ordem é a que aparece nos botões (do mais comum ao menos).
 */
export const LOST_REASON_OPTIONS: { value: LostReasonCategory; label: string }[] = [
  { value: "PRICE", label: "Achou caro" },
  { value: "COMPETITOR", label: "Comprou no concorrente" },
  { value: "GAVE_UP", label: "Desistiu / só pesquisando" },
  { value: "NO_RESPONSE", label: "Sumiu / parou de responder" },
  { value: "WRONG_PRODUCT", label: "Não era o que queria" },
  { value: "OTHER", label: "Outro motivo" },
];

const LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  LOST_REASON_OPTIONS.map((o) => [o.value, o.label]),
);

/** Rótulo PT de uma categoria; devolve o próprio valor se desconhecido. */
export function lostReasonLabel(category: string | null | undefined): string {
  if (!category) return "";
  return LABEL_BY_VALUE[category] ?? category;
}
