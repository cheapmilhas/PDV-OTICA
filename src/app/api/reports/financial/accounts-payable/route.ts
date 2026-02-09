import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { AccountsPayableService } from "@/services/reports/accounts-payable.service";

/**
 * GET /api/reports/financial/accounts-payable
 * Relatório de contas a pagar
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = request.nextUrl;

    // Parse filters
    const filters: any = {};

    const supplierId = searchParams.get("supplierId");
    if (supplierId) {
      filters.supplierId = supplierId;
    }

    const overdue = searchParams.get("overdue");
    if (overdue === "true") {
      filters.overdue = true;
    }

    const service = new AccountsPayableService();
    const report = await service.generateReport(companyId, filters);

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}
