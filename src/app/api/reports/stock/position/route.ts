import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { StockPositionService } from "@/services/reports/stock-position.service";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";
import { validateBranchOwnership } from "@/lib/validate-branch";

/**
 * GET /api/reports/stock/position
 * Relatório de posição de estoque
 */
export async function GET(request: NextRequest) {
  try {
    // SEC-003: relatório exige permissão.
    await requirePermission(Permission.REPORTS_INVENTORY);
    const companyId = await getCompanyId();
    const { searchParams } = request.nextUrl;

    const minStock = searchParams.get("minStock");
    const maxStock = searchParams.get("maxStock");
    const belowMinimum = searchParams.get("belowMinimum");
    const branchId = searchParams.get("branchId") || undefined;

    // SEC-004: valida posse da filial filtrada (403 explícito em vez de vazio).
    if (branchId && branchId !== "ALL") {
      await validateBranchOwnership(branchId, companyId);
    }

    const filters = {
      categoryId: searchParams.get("categoryId") || undefined,
      brandId: searchParams.get("brandId") || undefined,
      productType: searchParams.get("productType") || undefined,
      branchId,
      minStock: minStock ? parseInt(minStock, 10) : undefined,
      maxStock: maxStock ? parseInt(maxStock, 10) : undefined,
      belowMinimum: belowMinimum === "true",
    };

    const service = new StockPositionService();
    const report = await service.generateReport(companyId, filters);

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}
