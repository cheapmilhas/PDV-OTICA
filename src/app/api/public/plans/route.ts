import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/public/plans
 * Planos para landing/registro. Inclui ACTIVE e COMING_SOON (filtro isActive=true).
 * Sem auth. TTL curto (60s) para refletir alterações do admin.
 *
 * SÓ planos da ÓTICA (VIS_APP): sem este filtro, os planos medical (ACTIVE,
 * preço>0 desde o catálogo de 2026-07-19) vazavam na página de preços da ótica —
 * e o medical-profissional (R$89,90) é mais barato que o básico da ótica (P0 do
 * plano de unificação, Fase 0). O funil medical ganhará `?product=` na Fase 4.
 */
export async function GET() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true, platformProduct: "VIS_APP" },
    select: {
      id: true, name: true, slug: true, description: true,
      priceMonthly: true, priceYearly: true, trialDays: true,
      status: true, isFeatured: true, highlightFeatures: true,
      maxUsers: true, maxBranches: true, maxProducts: true,
      features: { select: { key: true, value: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(
    { plans },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
