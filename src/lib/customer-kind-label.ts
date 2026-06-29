/**
 * Tipo de cliente (etiqueta derivada do histórico de compras) — NÃO usa IA, é
 * só leitura do que já temos no resumo seguro (purchaseCount). Complementa a
 * INTENÇÃO (o que a pessoa quer) com QUEM a pessoa é, no card e no inbox.
 *
 * Puro, sem I/O. Recebe purchaseCount (null/0 = não identificado/sem compra).
 */

export type CustomerKind = "novo" | "comprou_1x" | "habitual";

export interface CustomerKindLabel {
  kind: CustomerKind;
  label: string;
}

/**
 * Deriva o tipo a partir do nº de compras concluídas.
 * - null/0 → "novo" (não está na base OU está mas nunca comprou)
 * - 1      → "comprou_1x"
 * - 2+     → "habitual"
 */
export function customerKind(purchaseCount: number | null | undefined): CustomerKindLabel {
  const n = purchaseCount ?? 0;
  if (n >= 2) return { kind: "habitual", label: "Cliente habitual" };
  if (n === 1) return { kind: "comprou_1x", label: "Comprou 1×" };
  return { kind: "novo", label: "Cliente novo" };
}
