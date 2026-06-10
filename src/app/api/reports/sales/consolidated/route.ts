import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { SalesConsolidatedService } from "@/services/reports/sales-consolidated.service";
import { parseISO } from "date-fns";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";
import { validateBranchOwnership } from "@/lib/validate-branch";

/**
 * GET /api/reports/sales/consolidated
 * Relatório de vendas consolidado
 */
export async function GET(request: NextRequest) {
  try {
    // SEC-003: relatório exige permissão.
    await requirePermission(Permission.REPORTS_SALES);
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

    const branchId = searchParams.get("branchId") || undefined;

    // SEC-004: valida posse da filial filtrada (403 explícito em vez de vazio).
    if (branchId && branchId !== "ALL") {
      await validateBranchOwnership(branchId, companyId);
    }

    const filters = {
      startDate: parseISO(startDate),
      endDate: parseISO(endDate),
      branchId,
      sellerUserId: searchParams.get("sellerUserId") || undefined,
      paymentMethod: searchParams.get("paymentMethod") || undefined,
      status: searchParams.get("status") || undefined,
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

    const service = new SalesConsolidatedService();
    const report = await service.generateReport(companyId, filters);

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}
