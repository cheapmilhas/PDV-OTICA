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

    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    if (!startDateParam || !endDateParam) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Datas de início e fim são obrigatórias" } },
        { status: 400 }
      );
    }

    const startDate = new Date(startDateParam);
    const endDate = new Date(endDateParam);

    const report = await crmService.getCrmReport(companyId, startDate, endDate);

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
