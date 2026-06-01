import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { resolveReportBranchId } from "@/lib/resolve-report-branch";
import { handleApiError } from "@/lib/error-handler";
import { reportsService } from "@/services/reports.service";
import { customerReportQuerySchema } from "@/lib/validations/reports.schema";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const branchId = await resolveReportBranchId(searchParams); // M3: respeita seletor
    const companyId = await getCompanyId();

    const query = customerReportQuerySchema.parse({
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      period: searchParams.get("period") || "month",
    });

    const report = await reportsService.getCustomersReport(branchId, companyId, query);
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return handleApiError(error);
  }
}
