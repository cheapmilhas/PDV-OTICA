import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { cashbackService } from "@/services/cashback.service";
import { requirePlanFeature } from "@/lib/plan-features";

// GET - Resumo de cashback da filial
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "cashback");
    const branchId = await getBranchId();

    const summary = await cashbackService.getBranchSummary(branchId, companyId);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
