import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/products/search
 * Busca produtos por nome, SKU ou código de barras
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    console.log(`[API/products/search] Buscando "${search}" para company ${companyId}`);

    if (search.length < 2) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const products = await prisma.product.findMany({
      where: {
        companyId,
        active: true,
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { barcode: { contains: search, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
      },
      take: 20,
      orderBy: { name: "asc" },
    });

    console.log(`[API/products/search] Encontrados ${products.length} produtos`);

    return NextResponse.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("[API/products/search] Erro:", error);
    return handleApiError(error);
  }
}
