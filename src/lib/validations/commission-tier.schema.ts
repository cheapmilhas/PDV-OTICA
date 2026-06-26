import { z } from "zod";

/**
 * Validação da configuração de metas por níveis (mini/meta/mega) — Comissão Fase 2.
 *
 * Grava/lê em SellerCommissionTier (criada na Fase 1). Cada nível tem valor-alvo
 * (R$) e percentual. userId = null → metas padrão da loja; userId preenchido →
 * override de um vendedor. O motor (commission-engine) já consome esta tabela.
 *
 * Validações: valores não-negativos, % ≤ 100, e monotonicidade mini ≤ meta ≤ mega
 * (tanto no alvo quanto no %), que é o pressuposto do motor (maior nível atingido).
 */

export const COMMISSION_TIER_LEVELS = ["MINI", "META", "MEGA"] as const;
export type CommissionTierLevelDTO = (typeof COMMISSION_TIER_LEVELS)[number];

/** Um nível: alvo em R$ + percentual. */
const tierLevelSchema = z.object({
  targetAmount: z.coerce.number().min(0, "Valor-alvo não pode ser negativo"),
  percent: z.coerce.number().min(0, "% não pode ser negativo").max(100, "% não pode passar de 100"),
});

/**
 * Payload de salvar metas de um escopo (loja inteira OU um vendedor).
 * userId null/ausente = padrão da loja.
 */
export const commissionTiersSchema = z
  .object({
    userId: z.string().min(1).nullable().optional(),
    mini: tierLevelSchema,
    meta: tierLevelSchema,
    mega: tierLevelSchema,
  })
  .refine((d) => d.mini.targetAmount <= d.meta.targetAmount && d.meta.targetAmount <= d.mega.targetAmount, {
    message: "Os valores-alvo devem crescer: mini ≤ meta ≤ mega",
    path: ["meta", "targetAmount"],
  })
  .refine((d) => d.mini.percent <= d.meta.percent && d.meta.percent <= d.mega.percent, {
    message: "Os percentuais devem crescer: mini ≤ meta ≤ mega",
    path: ["meta", "percent"],
  });

export type CommissionTiersDTO = z.infer<typeof commissionTiersSchema>;
