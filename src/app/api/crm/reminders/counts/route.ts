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

    const counts = await crmService.getSegmentCounts(companyId);

    return NextResponse.json({
      success: true,
      data: counts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
