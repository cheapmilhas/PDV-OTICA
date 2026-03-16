/**
 * Mapa de tradução de métodos de pagamento para exibição.
 * Usar em TODAS as telas que mostram forma de pagamento.
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  CREDIT_CARD: "Cartão de Crédito",
  DEBIT_CARD: "Cartão de Débito",
  STORE_CREDIT: "Crediário",
  BANK_TRANSFER: "Transferência Bancária",
  BOLETO: "Boleto",
  CHEQUE: "Cheque",
  AGREEMENT: "Convênio",
  OTHER: "Outro",
};

export function getPaymentLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] || method;
}
