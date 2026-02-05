import { z } from "zod";
import { ServiceOrderStatus } from "@prisma/client";

/**
 * Schemas de validação para Ordens de Serviço
 */

/**
 * Schema para item/serviço da OS
 */
export const serviceOrderItemSchema = z.object({
  type: z.string().min(3, "Tipo de serviço muito curto").max(100, "Tipo muito longo"),
  description: z.string().min(3, "Descrição muito curta").max(500, "Descrição muito longa"),
  price: z.coerce.number().positive("Preço deve ser positivo"),
  observations: z.string().max(500, "Observações muito longas").optional(),
});

export type ServiceOrderItemDTO = z.infer<typeof serviceOrderItemSchema>;

/**
 * Schema para criar nova ordem de serviço
 */
export const createServiceOrderSchema = z.object({
  customerId: z.string().uuid("ID do cliente inválido"),
  branchId: z.string().uuid("ID da filial inválido"),
  items: z.array(serviceOrderItemSchema).min(1, "OS deve ter pelo menos 1 serviço"),
  expectedDate: z.string().datetime().optional(),
  prescription: z.string().max(1000, "Prescrição muito longa").optional(),
  notes: z.string().max(500, "Observações muito longas").optional(),
});

export type CreateServiceOrderDTO = z.infer<typeof createServiceOrderSchema>;

/**
 * Schema para atualizar ordem de serviço
 */
export const updateServiceOrderSchema = z.object({
  items: z.array(serviceOrderItemSchema).min(1).optional(),
  expectedDate: z.string().datetime().optional(),
  prescription: z.string().max(1000).optional(),
  notes: z.string().max(500).optional(),
});

export type UpdateServiceOrderDTO = z.infer<typeof updateServiceOrderSchema>;

/**
 * Schema para atualizar status da OS
 */
export const updateStatusSchema = z.object({
  status: z.nativeEnum(ServiceOrderStatus, {
    message: "Status inválido",
  }),
  notes: z.string().max(500, "Observações muito longas").optional(),
});

export type UpdateStatusDTO = z.infer<typeof updateStatusSchema>;

/**
 * Schema para cancelar OS
 */
export const cancelServiceOrderSchema = z.object({
  reason: z.string().min(3, "Motivo muito curto").max(200, "Motivo muito longo").optional(),
});

export type CancelServiceOrderDTO = z.infer<typeof cancelServiceOrderSchema>;

/**
 * Schema para query de listagem
 */
export const serviceOrderQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ativos", "inativos", "todos"]).default("ativos"),
  customerId: z.string().uuid().optional(),
  orderStatus: z.nativeEnum(ServiceOrderStatus).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sortBy: z.enum(["createdAt", "expectedDate", "status", "customer", "total"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ServiceOrderQuery = z.infer<typeof serviceOrderQuerySchema>;

/**
 * Helper para sanitizar DTOs
 */
export function sanitizeServiceOrderDTO(
  data: CreateServiceOrderDTO | UpdateServiceOrderDTO
): CreateServiceOrderDTO | UpdateServiceOrderDTO {
  const sanitized: any = { ...data };

  if (sanitized.prescription === "") delete sanitized.prescription;
  if (sanitized.notes === "") delete sanitized.notes;
  if (sanitized.expectedDate === "") delete sanitized.expectedDate;

  if (sanitized.items) {
    sanitized.items = sanitized.items.map((item: any) => {
      const sanitizedItem: any = { ...item };
      if (sanitizedItem.observations === "") delete sanitizedItem.observations;
      return sanitizedItem;
    });
  }

  return sanitized;
}

/**
 * Helper para calcular total da OS
 */
export function calculateOrderTotal(items: ServiceOrderItemDTO[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

/**
 * Helper para validar transição de status
 */
export function validateStatusTransition(
  currentStatus: ServiceOrderStatus,
  newStatus: ServiceOrderStatus
): boolean {
  const transitions: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
    PENDENTE: ["EM_ANDAMENTO", "PRONTO", "ENTREGUE"],
    EM_ANDAMENTO: ["PRONTO", "ENTREGUE", "PENDENTE"],
    PRONTO: ["ENTREGUE", "EM_ANDAMENTO"],
    ENTREGUE: [], // Não pode mudar status depois de entregue
  };

  return transitions[currentStatus]?.includes(newStatus) || false;
}

/**
 * Helper para obter label do status em português
 */
export function getStatusLabel(status: ServiceOrderStatus): string {
  const labels: Record<ServiceOrderStatus, string> = {
    PENDENTE: "Pendente",
    EM_ANDAMENTO: "Em Andamento",
    PRONTO: "Pronto",
    ENTREGUE: "Entregue",
  };

  return labels[status] || status;
}

/**
 * Helper para obter cor do status
 */
export function getStatusColor(status: ServiceOrderStatus): string {
  const colors: Record<ServiceOrderStatus, string> = {
    PENDENTE: "secondary",
    EM_ANDAMENTO: "default",
    PRONTO: "outline",
    ENTREGUE: "success",
  };

  return colors[status] || "default";
}
