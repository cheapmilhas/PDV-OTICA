import { NextRequest } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { getCashFlow } from "@/services/finance-report.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const searchParams = req.nextUrl.searchParams;

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const branchId = searchParams.get("branchId");
    const financeAccountId = searchParams.get("financeAccountId");

    if (!startDate || !endDate) {
      return handleApiError(new Error("startDate e endDate são obrigatórios"));
    }

    const cashFlow = await getCashFlow(
      companyId,
      new Date(startDate),
      new Date(endDate),
      branchId || undefined,
      financeAccountId || undefined
    );

    return successResponse(cashFlow);
  } catch (error) {
    return handleApiError(error);
  }
}
