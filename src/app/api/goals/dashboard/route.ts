import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getBranchId, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { goalsService } from "@/services/goals.service";
import { requirePlanFeature } from "@/lib/plan-features";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "goals");
    const { searchParams } = new URL(request.url);

    const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined;
    const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : undefined;

    const dashboard = await goalsService.getDashboard(branchId, year, month);
    return NextResponse.json({ success: true, data: dashboard });
  } catch (error) {
    return handleApiError(error);
  }
}
