import { NextRequest } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { getFinanceDashboard } from "@/services/finance-report.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const searchParams = req.nextUrl.searchParams;

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const branchId = searchParams.get("branchId");

    // Padrão: mês atual
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const dashboard = await getFinanceDashboard(
      companyId,
      startDate ? new Date(startDate) : defaultStart,
      endDate ? new Date(endDate) : defaultEnd,
      branchId || undefined
    );

    return successResponse(dashboard);
  } catch (error) {
    return handleApiError(error);
  }
}
