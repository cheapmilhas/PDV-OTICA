import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { ProductsTopSellersService } from "@/services/reports/products-top-sellers.service";
import { parseISO } from "date-fns";

/**
 * GET /api/reports/products/top-sellers
 * Relatório de produtos mais vendidos (Top Sellers)
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = request.nextUrl;

    // Parse filters
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate e endDate são obrigatórios" },
        { status: 400 }
      );
    }

    const limit = searchParams.get("limit");
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    if (limitNum && (limitNum < 1 || limitNum > 200)) {
      return NextResponse.json(
        { error: "Limit deve ser entre 1 e 200" },
        { status: 400 }
      );
    }

    const filters = {
      startDate: parseISO(startDate),
      endDate: parseISO(endDate),
      categoryId: searchParams.get("categoryId") || undefined,
      brandId: searchParams.get("brandId") || undefined,
      productType: searchParams.get("productType") || undefined,
      limit: limitNum,
    };

    // Validate date range (max 1 year)
    const daysDiff = Math.abs(
      filters.endDate.getTime() - filters.startDate.getTime()
    ) / (1000 * 60 * 60 * 24);

    if (daysDiff > 365) {
      return NextResponse.json(
        { error: "Período máximo de 1 ano" },
        { status: 400 }
      );
    }

    const service = new ProductsTopSellersService();
    const report = await service.generateReport(companyId, filters);

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}
