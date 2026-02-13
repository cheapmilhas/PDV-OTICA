import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getBranchId, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { reportsService } from "@/services/reports.service";
import { customerReportQuerySchema } from "@/lib/validations/reports.schema";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);

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
