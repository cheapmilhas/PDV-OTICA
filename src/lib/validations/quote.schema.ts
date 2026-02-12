import { z } from "zod";
import { QuoteStatus, QuoteItemType } from "@prisma/client";
import { paymentSchema, type PaymentDTO } from "./sale.schema";

/**
 * Schema para dados de prescrição do olho
 */
const prescriptionEyeSchema = z.object({
  esf: z.string().optional(),
  cil: z.string().optional(),
  eixo: z.string().optional(),
  dnp: z.string().optional(),
  altura: z.string().optional(),
}).optional();

/**
 * Schema completo para dados de prescrição (receita do óculos)
 */
const prescriptionDataSchema = z.object({
  od: prescriptionEyeSchema,
  oe: prescriptionEyeSchema,
  adicao: z.string().optional(),
  tipoLente: z.string().optional(),
  material: z.string().optional(),
  tratamentos: z.array(z.string()).optional(),
}).optional();

/**
 * Schema para item do orçamento
 */
export const quoteItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().min(1, "Descrição obrigatória"),
  quantity: z.coerce.number().int().positive("Quantidade deve ser positiva").default(1),
  unitPrice: z.coerce.number().positive("Preço deve ser positivo"),
  discount: z.coerce.number().min(0, "Desconto não pode ser negativo").default(0),
  itemType: z.nativeEnum(QuoteItemType).default(QuoteItemType.PRODUCT),
  prescriptionData: prescriptionDataSchema,
  notes: z.string().optional(),
});

export type QuoteItemDTO = z.infer<typeof quoteItemSchema>;

/**
 * Schema para criar orçamento
 */
export const createQuoteSchema = z.object({
  // Cliente (opcional - pode ser avulso)
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email("Email inválido").optional().or(z.literal("")),

  // Itens (obrigatório pelo menos 1)
  items: z.array(quoteItemSchema).min(1, "Adicione pelo menos um item"),

  // Descontos
  discountTotal: z.coerce.number().min(0, "Desconto não pode ser negativo").default(0),
  discountPercent: z.coerce.number().min(0).max(100, "Percentual máximo é 100%").default(0),

  // Observações
  notes: z.string().optional(),
  internalNotes: z.string().optional(),

  // Condições de pagamento
  paymentConditions: z.string().optional(),

  // Validade
  validDays: z.coerce.number().int().positive("Dias de validade deve ser positivo").default(15),
});

export type CreateQuoteDTO = z.infer<typeof createQuoteSchema>;

/**
 * Schema para atualizar orçamento
 */
export const updateQuoteSchema = createQuoteSchema.partial();

export type UpdateQuoteDTO = z.infer<typeof updateQuoteSchema>;

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
  sellerUserId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(["createdAt", "total", "customer", "validUntil"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type QuoteQuery = z.infer<typeof quoteQuerySchema>;

/**
 * Schema para cancelar orçamento
 */
export const cancelQuoteSchema = z.object({
  lostReason: z.string().optional(),
});

export type CancelQuoteDTO = z.infer<typeof cancelQuoteSchema>;

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
 * Schema para atualizar status
 */
export const updateQuoteStatusSchema = z.object({
  status: z.nativeEnum(QuoteStatus),
  lostReason: z.string().optional(),
});

export type UpdateQuoteStatusDTO = z.infer<typeof updateQuoteStatusSchema>;

/**
 * Helper para calcular total de um item
 */
export function calculateQuoteItemTotal(item: QuoteItemDTO): number {
  return item.quantity * item.unitPrice - item.discount;
}

/**
 * Helper para calcular totais do orçamento
 */
export function calculateQuoteTotals(
  items: QuoteItemDTO[],
  discountTotal: number = 0,
  discountPercent: number = 0
): {
  subtotal: number;
  discountTotal: number;
  total: number;
} {
  const subtotal = items.reduce((sum, item) => {
    return sum + calculateQuoteItemTotal(item);
  }, 0);

  // Aplicar desconto percentual se houver
  let finalDiscount = discountTotal;
  if (discountPercent > 0) {
    finalDiscount = subtotal * (discountPercent / 100);
  }

  return {
    subtotal,
    discountTotal: finalDiscount,
    total: subtotal - finalDiscount,
  };
}

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
