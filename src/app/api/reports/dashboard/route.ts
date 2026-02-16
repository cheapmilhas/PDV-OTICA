import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getBranchId, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { reportsService } from "@/services/reports.service";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period") || "month";
    const period = periodParam as "today" | "week" | "month" | "quarter" | "year" | "custom";

    const dashboard = await reportsService.getDashboardSummary(branchId, companyId, period);
    return NextResponse.json({ success: true, data: dashboard });
  } catch (error) {
    return handleApiError(error);
  }
}
