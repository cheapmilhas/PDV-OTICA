import { z } from "zod";
import { QuoteStatus } from "@prisma/client";
import { paymentSchema, type PaymentDTO } from "./sale.schema";

/**
 * Schema de validação para query de listagem de orçamentos
 */
export const quoteQuerySchema = z.object({
  search: z.string().optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(["ativos", "inativos", "todos"]).optional().default("ativos"),
  quoteStatus: z.nativeEnum(QuoteStatus).optional(),
  customerId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(["createdAt", "total", "customer", "validUntil"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type QuoteQuery = z.infer<typeof quoteQuerySchema>;

/**
 * Schema de validação para conversão de orçamento em venda
 *
 * Estrutura:
 * - payments: array de pagamentos (obrigatório)
 *
 * Validações:
 * - Deve ter pelo menos 1 forma de pagamento
 * - Cada pagamento deve ter method, amount válidos
 */
export const convertQuoteToSaleSchema = z.object({
  payments: z
    .array(paymentSchema)
    .min(1, "Adicione pelo menos uma forma de pagamento"),
});

export type ConvertQuoteToSaleDTO = z.infer<typeof convertQuoteToSaleSchema>;

/**
 * Helper para validar se pagamentos cobrem o total do orçamento
 */
export function validateQuotePayments(
  payments: PaymentDTO[],
  quoteTotal: number
): { valid: boolean; message?: string } {
  const paymentTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const diff = Math.abs(paymentTotal - quoteTotal);

  if (diff > 0.01) {
    if (paymentTotal < quoteTotal) {
      return {
        valid: false,
        message: `Pagamento insuficiente. Total: R$ ${quoteTotal.toFixed(
          2
        )}, Pago: R$ ${paymentTotal.toFixed(2)}`,
      };
    } else {
      return {
        valid: false,
        message: `Pagamento excede o total. Total: R$ ${quoteTotal.toFixed(
          2
        )}, Pago: R$ ${paymentTotal.toFixed(2)}`,
      };
    }
  }

  return { valid: true };
}
