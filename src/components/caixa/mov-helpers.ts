import {
  Banknote,
  CreditCard,
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  ArrowUpCircle,
  Unlock,
  Lock,
  DollarSign,
} from "lucide-react";
import { createElement, type ReactNode } from "react";

/**
 * Helpers compartilhados de rótulos/ícones das movimentações de caixa.
 * Fonte única usada pela tela do dia, pela MovimentacoesTable e por
 * calculatePaymentSummary (modal de fechamento). NÃO duplicar essa lógica.
 */

export function getMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    CASH: "Dinheiro",
    CREDIT_CARD: "Crédito",
    DEBIT_CARD: "Débito",
    PIX: "PIX",
    BOLETO: "Boleto",
    STORE_CREDIT: "Crediário",
    BALANCE_DUE: "Saldo a Receber",
    CHEQUE: "Cheque",
    AGREEMENT: "Convenio",
    OTHER: "Outro",
  };
  return labels[method] || method;
}

export function getTipoIcon(type: string): ReactNode {
  switch (type) {
    case "SALE_PAYMENT":
      return createElement(TrendingUp, { className: "h-4 w-4 text-green-600" });
    case "WITHDRAWAL":
      return createElement(ArrowDownCircle, { className: "h-4 w-4 text-red-600" });
    case "SUPPLY":
      return createElement(ArrowUpCircle, { className: "h-4 w-4 text-blue-600" });
    case "OPENING_FLOAT":
      return createElement(Unlock, { className: "h-4 w-4 text-gray-600" });
    case "CLOSING":
      return createElement(Lock, { className: "h-4 w-4 text-gray-600" });
    case "REFUND":
      return createElement(TrendingDown, { className: "h-4 w-4 text-orange-600" });
    default:
      return createElement(DollarSign, { className: "h-4 w-4 text-gray-600" });
  }
}

export function getTipoLabel(type: string): string {
  const labels: Record<string, string> = {
    SALE_PAYMENT: "Venda",
    WITHDRAWAL: "Sangria",
    SUPPLY: "Reforco",
    OPENING_FLOAT: "Abertura",
    CLOSING: "Fechamento",
    REFUND: "Reembolso",
    ADJUSTMENT: "Ajuste",
  };
  return labels[type] || type;
}

export function getTipoBadgeVariant(
  type: string
): "default" | "destructive" | "secondary" | "outline" {
  switch (type) {
    case "SALE_PAYMENT":
      return "default";
    case "WITHDRAWAL":
    case "REFUND":
      return "destructive";
    case "SUPPLY":
      return "secondary";
    default:
      return "outline";
  }
}

export function getFormaPagamentoIcon(method: string): ReactNode {
  switch (method) {
    case "CASH":
      return createElement(Banknote, { className: "h-4 w-4" });
    case "CREDIT_CARD":
    case "DEBIT_CARD":
      return createElement(CreditCard, { className: "h-4 w-4" });
    case "PIX":
      return createElement(Wallet, { className: "h-4 w-4" });
    default:
      return createElement(DollarSign, { className: "h-4 w-4" });
  }
}

export function getMovementDescription(movement: {
  note?: string;
  type: string;
  salePayment?: unknown;
}): string {
  if (movement.note) return movement.note;
  if (movement.type === "SALE_PAYMENT" && movement.salePayment) {
    return `Venda`;
  }
  return getTipoLabel(movement.type);
}
