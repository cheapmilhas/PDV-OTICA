import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/public/plans
 * Retorna planos ativos para exibição na landing page.
 * Sem autenticação.
 */
export async function GET() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    include: { features: true },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(
    { plans },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
