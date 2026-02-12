import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/suppliers/filters
 * Retorna opções disponíveis para os filtros
 * (cidades, estados cadastrados no banco)
 */
export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    // Buscar valores únicos para os selects
    const [cities, states] = await Promise.all([
      // Cidades únicas
      prisma.supplier.findMany({
        where: { companyId, city: { not: null }, active: true },
        select: { city: true },
        distinct: ["city"],
        orderBy: { city: "asc" },
      }),
      // Estados únicos
      prisma.supplier.findMany({
        where: { companyId, state: { not: null }, active: true },
        select: { state: true },
        distinct: ["state"],
        orderBy: { state: "asc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        cities: cities.map((c) => c.city).filter(Boolean) as string[],
        states: states.map((s) => s.state).filter(Boolean) as string[],
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
