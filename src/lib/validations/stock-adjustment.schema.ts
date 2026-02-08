import { z } from "zod";
import { StockAdjustmentType, StockAdjustmentStatus } from "@prisma/client";

/**
 * Schema para criação de ajuste de estoque
 */
export const createStockAdjustmentSchema = z.object({
  productId: z.string().cuid("ID do produto inválido"),

  type: z.nativeEnum(StockAdjustmentType, {
    message: "Tipo de ajuste inválido",
  }),

  quantityChange: z.coerce
    .number()
    .int("Quantidade deve ser um número inteiro")
    .refine((val) => val !== 0, "Quantidade não pode ser zero"),

  reason: z
    .string()
    .min(10, "Motivo deve ter no mínimo 10 caracteres")
    .max(500, "Motivo deve ter no máximo 500 caracteres"),

  attachments: z
    .array(z.string().url("URL inválida"))
    .max(5, "Máximo de 5 anexos")
    .optional()
    .default([]),
});

/**
 * Schema para aprovação de ajuste
 */
export const approveStockAdjustmentSchema = z.object({
  adjustmentId: z.string().cuid("ID do ajuste inválido"),
});

/**
 * Schema para rejeição de ajuste
 */
export const rejectStockAdjustmentSchema = z.object({
  adjustmentId: z.string().cuid("ID do ajuste inválido"),
  rejectionReason: z
    .string()
    .min(10, "Motivo da rejeição deve ter no mínimo 10 caracteres")
    .max(500, "Motivo da rejeição deve ter no máximo 500 caracteres"),
});

/**
 * Schema para query params de listagem
 */
export const stockAdjustmentQuerySchema = z.object({
  // Paginação
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),

  // Filtros
  status: z.nativeEnum(StockAdjustmentStatus).optional(),
  type: z.nativeEnum(StockAdjustmentType).optional(),
  productId: z.string().cuid().optional(),
  createdByUserId: z.string().cuid().optional(),

  // Período
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),

  // Ordenação
  sortBy: z
    .enum(["createdAt", "totalValue", "quantityChange"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * Type inference
 */
export type CreateStockAdjustmentDTO = z.infer<
  typeof createStockAdjustmentSchema
>;
export type ApproveStockAdjustmentDTO = z.infer<
  typeof approveStockAdjustmentSchema
>;
export type RejectStockAdjustmentDTO = z.infer<
  typeof rejectStockAdjustmentSchema
>;
export type StockAdjustmentQuery = z.infer<
  typeof stockAdjustmentQuerySchema
>;

/**
 * Helper para obter label em português do tipo de ajuste
 */
export function getStockAdjustmentTypeLabel(
  type: StockAdjustmentType
): string {
  const labels: Record<StockAdjustmentType, string> = {
    DAMAGE: "Quebra/Avaria",
    THEFT: "Perda/Roubo",
    SUPPLIER_RETURN: "Devolução ao Fornecedor",
    COUNT_ERROR: "Erro de Contagem",
    FREE_SAMPLE: "Amostra Grátis",
    EXPIRATION: "Vencimento/Validade",
    INTERNAL_USE: "Uso Interno",
    OTHER: "Outros",
  };

  return labels[type] || type;
}

/**
 * Helper para obter label em português do status
 */
export function getStockAdjustmentStatusLabel(
  status: StockAdjustmentStatus
): string {
  const labels: Record<StockAdjustmentStatus, string> = {
    PENDING: "Pendente",
    APPROVED: "Aprovado",
    REJECTED: "Rejeitado",
    AUTO_APPROVED: "Auto-Aprovado",
  };

  return labels[status] || status;
}

/**
 * Helper para obter cor do badge por status
 */
export function getStockAdjustmentStatusColor(
  status: StockAdjustmentStatus
): string {
  const colors: Record<StockAdjustmentStatus, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    AUTO_APPROVED: "bg-blue-100 text-blue-800",
  };

  return colors[status] || "bg-gray-100 text-gray-800";
}

/**
 * Helper para obter opções de tipos de ajuste
 */
export function getStockAdjustmentTypeOptions() {
  return [
    { value: StockAdjustmentType.DAMAGE, label: "Quebra/Avaria" },
    { value: StockAdjustmentType.THEFT, label: "Perda/Roubo" },
    {
      value: StockAdjustmentType.SUPPLIER_RETURN,
      label: "Devolução ao Fornecedor",
    },
    { value: StockAdjustmentType.COUNT_ERROR, label: "Erro de Contagem" },
    { value: StockAdjustmentType.FREE_SAMPLE, label: "Amostra Grátis" },
    { value: StockAdjustmentType.EXPIRATION, label: "Vencimento/Validade" },
    { value: StockAdjustmentType.INTERNAL_USE, label: "Uso Interno" },
    { value: StockAdjustmentType.OTHER, label: "Outros" },
  ];
}

/**
 * Helper para sanitizar dados do DTO
 */
export function sanitizeStockAdjustmentDTO(
  data: CreateStockAdjustmentDTO
): CreateStockAdjustmentDTO {
  return {
    ...data,
    attachments: data.attachments?.filter((url) => url.trim() !== "") || [],
  };
}
