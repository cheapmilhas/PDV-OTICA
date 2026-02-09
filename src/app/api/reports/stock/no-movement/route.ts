import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { NoMovementProductsService } from "@/services/reports/no-movement-products.service";

/**
 * GET /api/reports/stock/no-movement
 * Relatório de produtos sem giro (sem movimento)
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = request.nextUrl;

    const days = searchParams.get("days");
    const daysNum = days ? parseInt(days, 10) : 90;

    if (daysNum < 1 || daysNum > 365) {
      return NextResponse.json(
        { error: "Days deve ser entre 1 e 365" },
        { status: 400 }
      );
    }

    const minStockQty = searchParams.get("minStockQty");

    const filters = {
      days: daysNum,
      categoryId: searchParams.get("categoryId") || undefined,
      brandId: searchParams.get("brandId") || undefined,
      productType: searchParams.get("productType") || undefined,
      minStockQty: minStockQty ? parseInt(minStockQty, 10) : undefined,
    };

    const service = new NoMovementProductsService();
    const report = await service.generateReport(companyId, filters);

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}
