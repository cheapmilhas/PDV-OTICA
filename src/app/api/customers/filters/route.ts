import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/customers/filters
 * Retorna opções disponíveis para os filtros
 * (cidades, estados, origens cadastradas no banco)
 */
export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    // Buscar valores únicos para os selects
    const [cities, states, referralSources] = await Promise.all([
      // Cidades únicas
      prisma.customer.findMany({
        where: { companyId, city: { not: null }, active: true },
        select: { city: true },
        distinct: ["city"],
        orderBy: { city: "asc" },
      }),
      // Estados únicos
      prisma.customer.findMany({
        where: { companyId, state: { not: null }, active: true },
        select: { state: true },
        distinct: ["state"],
        orderBy: { state: "asc" },
      }),
      // Origens únicas
      prisma.customer.findMany({
        where: { companyId, referralSource: { not: null }, active: true },
        select: { referralSource: true },
        distinct: ["referralSource"],
        orderBy: { referralSource: "asc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        cities: cities.map((c) => c.city).filter(Boolean) as string[],
        states: states.map((s) => s.state).filter(Boolean) as string[],
        referralSources: referralSources.map((r) => r.referralSource).filter(Boolean) as string[],
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
