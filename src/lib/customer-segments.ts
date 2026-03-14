/**
 * Labels em português para os segmentos de clientes (CustomerSegment enum).
 */
export const CUSTOMER_SEGMENT_LABELS: Record<string, string> = {
  BIRTHDAY: "Aniversário",
  POST_SALE_30_DAYS: "Pós-venda 30 dias",
  POST_SALE_90_DAYS: "Pós-venda 90 dias",
  INACTIVE_6_MONTHS: "Inativo 6 meses",
  INACTIVE_1_YEAR: "Inativo 1 ano",
  INACTIVE_2_YEARS: "Inativo 2 anos",
  INACTIVE_3_YEARS: "Inativo 3+ anos",
  CASHBACK_EXPIRING: "Cashback expirando",
  PRESCRIPTION_EXPIRING: "Receita vencendo",
  VIP_CUSTOMER: "Cliente VIP",
  CONTACT_LENS_BUYER: "Compra lentes de contato",
  CUSTOM: "Personalizado",
};

/**
 * Retorna o label traduzido para um segmento de cliente.
 */
export function getCustomerSegmentLabel(segment: string): string {
  return CUSTOMER_SEGMENT_LABELS[segment] || segment.replace(/_/g, " ");
}
