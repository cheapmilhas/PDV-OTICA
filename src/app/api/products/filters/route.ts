import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/products/filters
 * Retorna opções disponíveis para os filtros de produtos
 */
export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    // Buscar valores únicos para os selects
    const [categories, brands, suppliers] = await Promise.all([
      // Categorias
      prisma.category.findMany({
        where: { companyId, active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      // Marcas
      prisma.brand.findMany({
        where: { companyId, active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      // Fornecedores
      prisma.supplier.findMany({
        where: { companyId, active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        categories,
        brands,
        suppliers,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
