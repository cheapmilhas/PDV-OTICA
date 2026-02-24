import { NextResponse } from "next/server";
import { requireAuth, getBranchId, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { goalsService } from "@/services/goals.service";
import { requirePlanFeature } from "@/lib/plan-features";

export async function GET() {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "goals");
    const sellers = await goalsService.getBranchSellers(branchId);
    return NextResponse.json({ success: true, data: sellers });
  } catch (error) {
    return handleApiError(error);
  }
}
