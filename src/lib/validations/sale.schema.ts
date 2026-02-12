import { z } from "zod";
import { PaymentMethod } from "@prisma/client";
import { AppError, ERROR_CODES } from "@/lib/error-handler";

/**
 * Schemas de validação para Vendas (PDV)
 *
 * Estrutura de uma venda:
 * - Sale (cabeçalho): customerId, branchId, total, discount, notes
 * - SaleItem[]: productId, qty, unitPrice, discount, total
 * - Payment[]: method, amount, installments, installmentConfig (se crediário)
 */

/**
 * Schema para item da venda
 */
export const saleItemSchema = z.object({
  productId: z.string().min(1, "ID do produto é obrigatório"),
  qty: z.coerce
    .number()
    .int("Quantidade deve ser inteiro")
    .positive("Quantidade deve ser positiva"),
  unitPrice: z.coerce
    .number()
    .positive("Preço unitário deve ser positivo"),
  discount: z.coerce
    .number()
    .min(0, "Desconto não pode ser negativo")
    .optional()
    .default(0),
});

export type SaleItemDTO = z.infer<typeof saleItemSchema>;

/**
 * Schema para configuração de parcelamento (crediário)
 */
export const installmentConfigSchema = z.object({
  count: z.coerce
    .number()
    .int("Número de parcelas deve ser inteiro")
    .min(2, "Mínimo de 2 parcelas")
    .max(24, "Máximo de 24 parcelas"),
  firstDueDate: z.string().datetime("Data inválida"),
  interval: z.coerce
    .number()
    .int("Intervalo deve ser inteiro")
    .positive("Intervalo deve ser positivo")
    .default(30), // 30 dias padrão
});

export type InstallmentConfigDTO = z.infer<typeof installmentConfigSchema>;

/**
 * Schema para pagamento da venda
 */
export const paymentSchema = z.object({
  method: z.nativeEnum(PaymentMethod, {
    message: "Método de pagamento inválido",
  }),
  amount: z.coerce
    .number()
    .positive("Valor do pagamento deve ser positivo"),
  installments: z.coerce
    .number()
    .int("Parcelas deve ser inteiro")
    .positive("Parcelas deve ser positivo")
    .optional()
    .default(1),
  // Configuração de parcelamento (apenas para STORE_CREDIT)
  installmentConfig: installmentConfigSchema.optional(),
});

export type PaymentDTO = z.infer<typeof paymentSchema>;

/**
 * Schema para criar nova venda
 *
 * Campos obrigatórios: customerId, branchId, items (array), payments (array)
 * Campos opcionais: discount, notes
 */
export const createSaleSchema = z.object({
  customerId: z.union([z.string().min(1), z.null()]).optional(),
  branchId: z.string().min(1, "ID da filial é obrigatório"),
  items: z.array(saleItemSchema).min(1, "Venda deve ter pelo menos 1 item"),
  payments: z.array(paymentSchema).min(1, "Venda deve ter pelo menos 1 pagamento"),
  discount: z.coerce
    .number()
    .min(0, "Desconto não pode ser negativo")
    .optional()
    .default(0),
  notes: z.string().max(500, "Observações muito longas (máx 500 caracteres)").optional(),
});

export type CreateSaleDTO = z.infer<typeof createSaleSchema>;

/**
 * Schema para cancelar venda
 */
export const cancelSaleSchema = z.object({
  reason: z.string().min(3, "Motivo muito curto").max(200, "Motivo muito longo").optional(),
});

export type CancelSaleDTO = z.infer<typeof cancelSaleSchema>;

/**
 * Schema para query de listagem de vendas
 */
export const saleQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ativos", "inativos", "todos"]).default("ativos"),
  customerId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  sortBy: z.enum(["createdAt", "total", "customer"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type SaleQuery = z.infer<typeof saleQuerySchema>;

/**
 * Helper para sanitizar DTOs (remove empty strings)
 */
export function sanitizeSaleDTO(
  data: CreateSaleDTO
): CreateSaleDTO {
  const sanitized: any = { ...data };

  // Remove notas vazias
  if (sanitized.notes === "") {
    delete sanitized.notes;
  }

  // Sanitiza items
  sanitized.items = sanitized.items.map((item: any) => {
    const sanitizedItem: any = { ...item };
    if (sanitizedItem.discount === 0) {
      delete sanitizedItem.discount;
    }
    return sanitizedItem;
  });

  // Sanitiza payments
  sanitized.payments = sanitized.payments.map((payment: any) => {
    const sanitizedPayment: any = { ...payment };
    if (sanitizedPayment.installments === 1) {
      delete sanitizedPayment.installments;
    }
    return sanitizedPayment;
  });

  return sanitized;
}

/**
 * Helper para calcular total de um item
 */
export function calculateItemTotal(item: SaleItemDTO): number {
  return item.qty * item.unitPrice - (item.discount || 0);
}

/**
 * Helper para calcular total da venda
 */
export function calculateSaleTotal(items: SaleItemDTO[], discount = 0): {
  subtotal: number;
  discount: number;
  total: number;
} {
  const subtotal = items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  return {
    subtotal,
    discount,
    total: subtotal - discount,
  };
}

/**
 * Helper para validar se pagamentos cobrem o total
 */
export function validatePayments(payments: PaymentDTO[], total: number): boolean {
  const paymentTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  return Math.abs(paymentTotal - total) < 0.01; // Tolerância de 1 centavo
}

/**
 * Valida pagamento com crediário
 *
 * Regras:
 * - Cliente é obrigatório para crediário
 * - installmentConfig é obrigatório para crediário
 */
export function validateStoreCredit(payment: PaymentDTO, customerId?: string | null): void {
  if (payment.method === "STORE_CREDIT") {
    if (!customerId) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Cliente é obrigatório para vendas no crediário",
        400
      );
    }
    if (!payment.installmentConfig) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Configuração de parcelamento é obrigatória para crediário",
        400
      );
    }
  }
}
