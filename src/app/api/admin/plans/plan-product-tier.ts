import type { PlatformProduct, PlanTier } from "@prisma/client";

export const PLAN_TIERS: PlanTier[] = [
  "clinic_full",
  "ophthalmology",
  "specialist",
];

export function isPlanTierValue(v: unknown): v is PlanTier {
  return typeof v === "string" && (PLAN_TIERS as string[]).includes(v);
}

export type ProductTierResult =
  | { ok: true; tier: PlanTier | null }
  | { ok: false; error: string };

/**
 * Regra produto×tier de um plano (fail-closed), fonte única para POST e PATCH.
 *
 *  - VIS_MEDICAL EXIGE um tier conhecido. Um plano medical sem tier faz o gating
 *    do Domus abrir TUDO (isModuleEnabled é fail-open lá) e a criação de cliente
 *    aborta (create/route.ts valida isPlanTier). Rejeitar aqui, na origem.
 *  - VIS_APP NÃO tem tier (ótica): normaliza para null. Um tier em plano ótico
 *    seria emitido ao Domus por engano.
 *
 * `tier` é o valor cru recebido (undefined quando o caller não mandou o campo).
 */
export function resolvePlanProductTier(
  product: PlatformProduct,
  tier: unknown,
): ProductTierResult {
  if (product === "VIS_MEDICAL") {
    if (!isPlanTierValue(tier)) {
      return {
        ok: false,
        error:
          "Plano Vis Medical exige um tier válido (clinic_full, ophthalmology ou specialist).",
      };
    }
    return { ok: true, tier };
  }
  // VIS_APP: ignora qualquer tier recebido — plano de ótica é sempre sem tier.
  return { ok: true, tier: null };
}
