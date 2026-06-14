import { z } from "zod";
import { LeadFunnelSource } from "@prisma/client";

export const createLeadSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  interest: z.string().optional(),
  source: z.nativeEnum(LeadFunnelSource).optional(),
  stageId: z.string().optional(), // se ausente, service usa a 1ª etapa
  sellerUserId: z.string().optional(),
  estimatedValue: z.coerce.number().min(0).optional(),
  customerId: z.string().optional(),
  quoteId: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateLeadDTO = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema.partial().extend({
  lostReason: z.string().optional(),
});
export type UpdateLeadDTO = z.infer<typeof updateLeadSchema>;

export const moveLeadSchema = z.object({
  stageId: z.string().min(1),
  lostReason: z.string().optional(), // obrigatório quando a etapa destino é isLost (validado no service)
  expectedUpdatedAt: z.string().optional(), // optimistic-lock
});
export type MoveLeadDTO = z.infer<typeof moveLeadSchema>;

export const leadQuerySchema = z.object({
  search: z.string().optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
  stageId: z.string().optional(),
  source: z.nativeEnum(LeadFunnelSource).optional(),
  sellerUserId: z.string().optional(),
  branchId: z.string().optional(),
});
export type LeadQuery = z.infer<typeof leadQuerySchema>;

export const createLeadStageSchema = z.object({
  name: z.string().min(1, "Nome da etapa é obrigatório"),
  order: z.coerce.number().int().min(0),
  isWon: z.boolean().optional().default(false),
  isLost: z.boolean().optional().default(false),
});
export type CreateLeadStageDTO = z.infer<typeof createLeadStageSchema>;

export const updateLeadStageSchema = createLeadStageSchema.partial();
export type UpdateLeadStageDTO = z.infer<typeof updateLeadStageSchema>;
