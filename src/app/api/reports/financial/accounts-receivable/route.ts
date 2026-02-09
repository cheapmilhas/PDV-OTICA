import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { AccountsReceivableService } from "@/services/reports/accounts-receivable.service";
import { parseISO } from "date-fns";

/**
 * GET /api/reports/financial/accounts-receivable
 * Relatório de contas a receber
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = request.nextUrl;

    // Parse filters
    const filters: any = {};

    const customerId = searchParams.get("customerId");
    if (customerId) {
      filters.customerId = customerId;
    }

    const overdue = searchParams.get("overdue");
    if (overdue === "true") {
      filters.overdue = true;
    }

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (startDate && endDate) {
      filters.startDate = parseISO(startDate);
      filters.endDate = parseISO(endDate);
    }

    const service = new AccountsReceivableService();
    const report = await service.generateReport(companyId, filters);

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}
