import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { resolveReportBranchId } from "@/lib/resolve-report-branch";
import { handleApiError } from "@/lib/error-handler";
import { reportsService } from "@/services/reports.service";
import { temporalReportQuerySchema } from "@/lib/validations/reports.schema";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const branchId = await resolveReportBranchId(searchParams); // M3: respeita seletor

    const query = temporalReportQuerySchema.parse({
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      period: searchParams.get("period") || "month",
      groupBy: searchParams.get("groupBy") || "dayOfWeek",
    });

    const report = await reportsService.getTemporalReport(branchId, query);
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return handleApiError(error);
  }
}
