import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { resolveReportBranchId } from "@/lib/resolve-report-branch";
import { handleApiError } from "@/lib/error-handler";
import { reportsService } from "@/services/reports.service";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const branchId = await resolveReportBranchId(searchParams); // M3: respeita seletor
    const companyId = await getCompanyId();
    const periodParam = searchParams.get("period") || "month";
    const period = periodParam as "today" | "week" | "month" | "quarter" | "year" | "custom";

    const dashboard = await reportsService.getDashboardSummary(branchId, companyId, period);
    return NextResponse.json({ success: true, data: dashboard });
  } catch (error) {
    return handleApiError(error);
  }
}
