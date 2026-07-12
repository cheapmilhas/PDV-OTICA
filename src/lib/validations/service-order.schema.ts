import { z } from "zod";
import { ServiceOrderStatus } from "@prisma/client";
import { checkRange } from "@/lib/prescription-grade-ranges";

/**
 * Schemas de validação para Ordens de Serviço
 */

/**
 * Campos por olho que têm faixa de dioptria (fonte única em
 * `prescription-grade-ranges`). prisma/base não são restringidos aqui.
 */
const PRESCRIPTION_EYE_FIELDS = ["esf", "cil", "eixo", "dnp", "altura", "add"] as const;

/**
 * Valida o CONTEÚDO da prescrição sem trocar o tipo do campo: `prescription`
 * continua sendo a string JSON crua (o service e o espelhamento recebem a
 * string). JSON malformado vira issue Zod (→400), nunca uma exceção (→500).
 */
function refinePrescription(value: string | undefined, ctx: z.RefinementCtx): void {
  if (value === undefined || value === "") return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Prescrição inválida (JSON)",
      path: ["prescription"],
    });
    return;
  }

  if (parsed === null || typeof parsed !== "object") return;
  const p = parsed as Record<string, unknown>;

  for (const eye of ["od", "oe"] as const) {
    const eyeData = p[eye];
    if (eyeData === null || typeof eyeData !== "object") continue;
    const fields = eyeData as Record<string, unknown>;
    for (const field of PRESCRIPTION_EYE_FIELDS) {
      const raw = fields[field];
      if (raw === undefined || raw === null || typeof raw !== "string") continue;
      if (!checkRange(field, raw)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${eye.toUpperCase()} ${field} fora da faixa clínica`,
          path: ["prescription", eye, field],
        });
      }
    }
  }

  const adicao = p.adicao;
  if (typeof adicao === "string" && !checkRange("add", adicao)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Adição fora da faixa clínica",
      path: ["prescription", "adicao"],
    });
  }
}

/**
 * Schema para item/serviço da OS
 */
export const serviceOrderItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().min(1, "Descrição é obrigatória").max(500, "Descrição muito longa"),
  qty: z.coerce.number().int().min(1).default(1),
  observations: z.string().max(500, "Observações muito longas").optional(),
});

export type ServiceOrderItemDTO = z.infer<typeof serviceOrderItemSchema>;

/**
 * Schema para criar nova ordem de serviço
 */
export const createServiceOrderSchema = z.object({
  customerId: z.string().min(1, "ID do cliente é obrigatório"),
  branchId: z.string().min(1, "ID da filial é obrigatório"),
  laboratoryId: z.string().optional(),
  // M11: .max() contra DoS por payload gigante.
  items: z.array(serviceOrderItemSchema).min(1, "OS deve ter pelo menos 1 serviço").max(100, "OS excede o máximo de 100 serviços"),
  expectedDate: z.string().datetime().optional(),
  prescription: z.string().max(5000, "Prescrição muito longa").optional(),
  prescriptionImageUrl: z.string().url("URL da imagem inválida").optional(),
  lensType: z.string().max(50, "Tipo de lente muito longo").optional(),
  lensDescription: z.string().max(500, "Descrição da lente muito longa").optional(),
  lensColoring: z.string().max(200, "Coloração muito longa").optional(),
  treatments: z.array(z.string().max(200)).max(50).optional(),
  notes: z.string().max(1000, "Observações muito longas").optional(),
}).superRefine((data, ctx) => refinePrescription(data.prescription, ctx));

export type CreateServiceOrderDTO = z.infer<typeof createServiceOrderSchema>;

/**
 * Schema para atualizar ordem de serviço
 */
export const updateServiceOrderSchema = z.object({
  laboratoryId: z.string().optional(),
  items: z.array(serviceOrderItemSchema).min(1).max(100).optional(),
  expectedDate: z.string().datetime().optional(),
  prescription: z.string().max(5000).optional(),
  prescriptionImageUrl: z.string().url().optional(),
  lensType: z.string().max(50).optional(),
  lensDescription: z.string().max(500).optional(),
  lensColoring: z.string().max(200).optional(),
  treatments: z.array(z.string().max(200)).max(50).optional(),
  notes: z.string().max(1000).optional(),
  labNotes: z.string().max(500).optional(),
  labOrderNumber: z.string().max(100).optional(),
}).superRefine((data, ctx) => refinePrescription(data.prescription, ctx));

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
  status: z.enum(["ativos", "inativos", "todos", "prontos_avisar"]).default("ativos"),
  customerId: z.string().optional(),
  orderStatus: z.nativeEnum(ServiceOrderStatus).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sortBy: z.enum(["createdAt", "promisedDate", "status", "customer", "number"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  filter: z.enum(["atrasadas", "vencendo"]).optional(),
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
  if (sanitized.prescriptionImageUrl === "") delete sanitized.prescriptionImageUrl;
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
 * Nota: Como o schema não tem mais o campo price, este helper não pode calcular o total
 * O total deve ser calculado no backend após buscar os preços dos produtos
 */
export function calculateOrderTotal(items: ServiceOrderItemDTO[]): number {
  // Não podemos calcular sem os preços dos produtos
  // Este helper está deprecated e será removido
  return 0;
}

// H1: validateStatusTransition removido — era um fork DESATUALIZADO da máquina
// de estados (faltava APPROVED→IN_PROGRESS e SENT_TO_LAB→READY). A fonte única
// é FORWARD_TRANSITIONS em service-order.service.ts. Tinha zero call sites.

/**
 * Helper para obter label do status em português
 */
export function getStatusLabel(status: ServiceOrderStatus | string): string {
  const labels: Record<string, string> = {
    DRAFT: "Rascunho",
    APPROVED: "Aprovado",
    SENT_TO_LAB: "No Lab",
    IN_PROGRESS: "Em Produção",
    READY: "Pronta",
    DELIVERED: "Entregue",
    CANCELED: "Cancelado",
  };

  return labels[status] || status;
}

/**
 * Helper para obter cor do status
 */
export function getStatusColor(status: ServiceOrderStatus): string {
  const colors: Record<ServiceOrderStatus, string> = {
    DRAFT: "secondary",
    APPROVED: "default",
    SENT_TO_LAB: "outline",
    IN_PROGRESS: "default",
    READY: "success",
    DELIVERED: "success",
    CANCELED: "destructive",
  };

  return colors[status] || "default";
}
