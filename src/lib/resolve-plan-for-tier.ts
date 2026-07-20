import { prisma } from "@/lib/prisma";

/**
 * Resolve o Plan Medical auto-selecionável de um tier. FAIL-CLOSED: exige
 * EXATAMENTE 1 plano elegível — 0 (tier sem plano) ou >1 (ambiguidade) lançam,
 * nunca escolhe às cegas. Filtra por platformProduct=VIS_MEDICAL para não pegar
 * plano de ótica com o mesmo tier por engano. Ver spec (regra de seleção N2).
 */

export const PLAN_TIERS = ["clinic_full", "ophthalmology", "specialist"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export function isPlanTier(value: string): value is PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(value);
}

export interface ResolvedPlan {
  id: string;
  slug: string;
  tier: PlanTier;
  priceMonthly: number;
  priceYearly: number;
}

export async function resolvePlanForTier(tier: PlanTier): Promise<ResolvedPlan> {
  if (!isPlanTier(tier)) {
    throw new Error(`Tier inválido: "${tier}".`);
  }

  const plans = await prisma.plan.findMany({
    where: {
      platformProduct: "VIS_MEDICAL",
      tier,
      selfServiceSelectable: true,
      isActive: true,
    },
    select: { id: true, slug: true, tier: true, priceMonthly: true, priceYearly: true },
  });

  if (plans.length === 0) {
    throw new Error(`Nenhum plano Medical auto-selecionável para o tier "${tier}".`);
  }
  if (plans.length > 1) {
    throw new Error(
      `Ambiguidade: ${plans.length} planos Medical para o tier "${tier}" (${plans
        .map((p) => p.slug)
        .join(", ")}). Esperado exatamente 1.`,
    );
  }

  const plan = plans[0];
  return {
    id: plan.id,
    slug: plan.slug,
    tier: plan.tier as PlanTier,
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
  };
}
