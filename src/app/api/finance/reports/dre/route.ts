import { NextRequest } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { getDynamicDRE } from "@/services/finance-report.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const searchParams = req.nextUrl.searchParams;

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const branchId = searchParams.get("branchId");

    if (!startDate || !endDate) {
      return handleApiError(new Error("startDate e endDate são obrigatórios"));
    }

    // Ajustar endDate para fim do dia (23:59:59.999) para incluir lançamentos do dia
    const endOfDay = new Date(endDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const dre = await getDynamicDRE(
      companyId,
      new Date(startDate),
      endOfDay,
      branchId || undefined
    );

    return successResponse(dre);
  } catch (error) {
    return handleApiError(error);
  }
}
