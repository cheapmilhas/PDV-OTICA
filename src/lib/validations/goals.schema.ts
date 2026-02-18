import { z } from "zod";

// Configuração de comissões da filial
export const commissionConfigSchema = z.object({
  baseCommissionPercent: z.coerce.number().min(0).max(100).default(5),
  goalBonusPercent: z.coerce.number().min(0).max(100).default(2),
  // Comissões por categoria (opcional)
  categoryCommissions: z.record(z.string(), z.number()).optional(),
});

export type CommissionConfigDTO = z.infer<typeof commissionConfigSchema>;

// Criar/Editar meta mensal
export const salesGoalSchema = z.object({
  year: z.coerce.number().int().min(2024).max(2030),
  month: z.coerce.number().int().min(1).max(12),
  branchGoal: z.coerce.number().min(0),
  sellerGoals: z.array(z.object({
    userId: z.string().cuid(),
    goalAmount: z.coerce.number().min(0),
  })).optional(),
});

export type SalesGoalDTO = z.infer<typeof salesGoalSchema>;

// Atualizar meta individual do vendedor
export const sellerGoalSchema = z.object({
  goalAmount: z.coerce.number().min(0),
});

export type SellerGoalDTO = z.infer<typeof sellerGoalSchema>;

// Fechar mês e calcular comissões
export const closeMonthSchema = z.object({
  year: z.coerce.number().int().min(2024).max(2030),
  month: z.coerce.number().int().min(1).max(12),
});

export type CloseMonthDTO = z.infer<typeof closeMonthSchema>;

// Query para buscar metas
export const goalsQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().optional(),
  status: z.enum(["ACTIVE", "CLOSED", "CANCELLED", "CANCELED"]).optional(),
});

export type GoalsQueryDTO = z.infer<typeof goalsQuerySchema>;

// Marcar comissão como paga
export const payCommissionSchema = z.object({
  commissionId: z.string().cuid(),
  paidAt: z.coerce.date().optional(),
});

export type PayCommissionDTO = z.infer<typeof payCommissionSchema>;
