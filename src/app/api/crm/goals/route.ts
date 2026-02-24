import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { requirePlanFeature } from "@/lib/plan-features";
import * as crmService from "@/services/crm.service";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "crm");
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || undefined;

    const progress = await crmService.getGoalProgress(companyId, userId);

    return NextResponse.json({
      success: true,
      data: progress,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
