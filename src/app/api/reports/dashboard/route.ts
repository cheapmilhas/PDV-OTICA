import { NextResponse } from "next/server";
import { requireAuth, getBranchId, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { reportsService } from "@/services/reports.service";

export async function GET() {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const companyId = await getCompanyId();

    const dashboard = await reportsService.getDashboardSummary(branchId, companyId);
    return NextResponse.json({ success: true, data: dashboard });
  } catch (error) {
    return handleApiError(error);
  }
}
