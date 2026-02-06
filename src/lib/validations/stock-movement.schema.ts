import { z } from "zod";
import { StockMovementType } from "@prisma/client";

/**
 * Schema para criação de movimentação de estoque
 */
export const createStockMovementSchema = z.object({
  productId: z.string({
    required_error: "Produto é obrigatório",
  }).min(1, "Produto é obrigatório"),

  type: z.nativeEnum(StockMovementType, {
    required_error: "Tipo de movimentação é obrigatório",
    invalid_type_error: "Tipo de movimentação inválido",
  }),

  quantity: z.coerce.number({
    required_error: "Quantidade é obrigatória",
    invalid_type_error: "Quantidade deve ser um número",
  })
    .int("Quantidade deve ser um número inteiro")
    .positive("Quantidade deve ser maior que zero"),

  supplierId: z.string()
    .optional()
    .or(z.literal("")),

  invoiceNumber: z.string()
    .max(50, "Número da nota fiscal deve ter no máximo 50 caracteres")
    .optional()
    .or(z.literal("")),

  reason: z.string()
    .max(200, "Motivo deve ter no máximo 200 caracteres")
    .optional()
    .or(z.literal("")),

  notes: z.string()
    .max(1000, "Observações devem ter no máximo 1000 caracteres")
    .optional()
    .or(z.literal("")),
});

/**
 * Schema para transferência entre filiais
 */
export const createTransferSchema = z.object({
  productId: z.string({
    required_error: "Produto é obrigatório",
  }).min(1, "Produto é obrigatório"),

  quantity: z.coerce.number({
    required_error: "Quantidade é obrigatória",
    invalid_type_error: "Quantidade deve ser um número",
  })
    .int("Quantidade deve ser um número inteiro")
    .positive("Quantidade deve ser maior que zero"),

  sourceBranchId: z.string({
    required_error: "Filial de origem é obrigatória",
  }).min(1, "Filial de origem é obrigatória"),

  targetBranchId: z.string({
    required_error: "Filial de destino é obrigatória",
  }).min(1, "Filial de destino é obrigatória"),

  reason: z.string()
    .max(200, "Motivo deve ter no máximo 200 caracteres")
    .optional()
    .or(z.literal("")),

  notes: z.string()
    .max(1000, "Observações devem ter no máximo 1000 caracteres")
    .optional()
    .or(z.literal("")),
}).refine((data) => data.sourceBranchId !== data.targetBranchId, {
  message: "Filial de origem e destino devem ser diferentes",
  path: ["targetBranchId"],
});

/**
 * Schema para query params de listagem de movimentações
 */
export const stockMovementQuerySchema = z.object({
  // Paginação
  page: z.coerce.number()
    .int()
    .min(1, "Página deve ser maior que 0")
    .default(1),

  pageSize: z.coerce.number()
    .int()
    .min(1, "PageSize deve ser maior que 0")
    .max(100, "PageSize deve ser no máximo 100")
    .default(20),

  // Filtros
  type: z.nativeEnum(StockMovementType)
    .optional(),

  productId: z.string()
    .optional(),

  supplierId: z.string()
    .optional(),

  sourceBranchId: z.string()
    .optional(),

  targetBranchId: z.string()
    .optional(),

  // Filtro por período
  startDate: z.string()
    .datetime()
    .optional(),

  endDate: z.string()
    .datetime()
    .optional(),

  // Ordenação
  sortBy: z.enum(["createdAt", "type", "quantity"])
    .default("createdAt"),

  sortOrder: z.enum(["asc", "desc"])
    .default("desc"),
});

/**
 * Type inference dos schemas
 */
export type CreateStockMovementDTO = z.infer<typeof createStockMovementSchema>;
export type CreateTransferDTO = z.infer<typeof createTransferSchema>;
export type StockMovementQuery = z.infer<typeof stockMovementQuerySchema>;

/**
 * Helper para sanitizar dados de movimentação
 */
export function sanitizeStockMovementDTO(
  data: CreateStockMovementDTO
): CreateStockMovementDTO {
  const sanitized: any = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === "" || value === null) {
      sanitized[key] = undefined;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Helper para determinar se movimento aumenta ou diminui estoque
 */
export function isStockIncrease(type: StockMovementType): boolean {
  return [
    StockMovementType.PURCHASE,
    StockMovementType.CUSTOMER_RETURN,
    StockMovementType.TRANSFER_IN,
  ].includes(type);
}

/**
 * Helper para determinar se movimento diminui estoque
 */
export function isStockDecrease(type: StockMovementType): boolean {
  return [
    StockMovementType.SALE,
    StockMovementType.LOSS,
    StockMovementType.SUPPLIER_RETURN,
    StockMovementType.INTERNAL_USE,
    StockMovementType.TRANSFER_OUT,
  ].includes(type);
}

/**
 * Helper para obter label em português do tipo de movimentação
 */
export function getStockMovementTypeLabel(type: StockMovementType): string {
  const labels: Record<StockMovementType, string> = {
    [StockMovementType.PURCHASE]: "Compra de Fornecedor",
    [StockMovementType.CUSTOMER_RETURN]: "Devolução de Cliente",
    [StockMovementType.TRANSFER_IN]: "Transferência Recebida",
    [StockMovementType.TRANSFER_OUT]: "Transferência Enviada",
    [StockMovementType.ADJUSTMENT]: "Ajuste de Inventário",
    [StockMovementType.SALE]: "Venda",
    [StockMovementType.LOSS]: "Perda ou Avaria",
    [StockMovementType.SUPPLIER_RETURN]: "Devolução para Fornecedor",
    [StockMovementType.INTERNAL_USE]: "Uso Interno",
    [StockMovementType.OTHER]: "Outros",
  };

  return labels[type] || type;
}
