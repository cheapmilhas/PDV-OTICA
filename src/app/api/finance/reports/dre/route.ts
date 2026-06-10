import { NextRequest } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { getDynamicDRE } from "@/services/finance-report.service";
import { startOfLocalDay, endOfLocalDay } from "@/lib/date-utils";
import { withPlanFeatureGuard } from "@/lib/with-plan-feature";
import { validateBranchOwnership } from "@/lib/validate-branch";

export const GET = withPlanFeatureGuard(async (req: Request) => {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const searchParams = (req as NextRequest).nextUrl.searchParams;

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const branchId = searchParams.get("branchId");

    // SEC-004: valida posse da filial filtrada (403 explícito em vez de vazio).
    if (branchId && branchId !== "ALL") {
      await validateBranchOwnership(branchId, companyId);
    }

    if (!startDate || !endDate) {
      return handleApiError(new Error("startDate e endDate são obrigatórios"));
    }

    // Ajustar datas para o fuso local (America/Sao_Paulo)
    const start = startOfLocalDay(startDate);
    const endOfDay = endOfLocalDay(endDate);

    const dre = await getDynamicDRE(
      companyId,
      start,
      endOfDay,
      branchId || undefined
    );

    return successResponse(dre);
  } catch (error) {
    return handleApiError(error);
  }
});
