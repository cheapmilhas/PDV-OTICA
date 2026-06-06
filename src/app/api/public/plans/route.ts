import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/public/plans
 * Planos para landing/registro. Inclui ACTIVE e COMING_SOON (filtro isActive=true).
 * Sem auth. TTL curto (60s) para refletir alterações do admin.
 */
export async function GET() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
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
