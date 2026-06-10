import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { resolveReportBranchId } from "@/lib/resolve-report-branch";
import { handleApiError } from "@/lib/error-handler";
import { reportsService } from "@/services/reports.service";
import { opticalReportQuerySchema } from "@/lib/validations/reports.schema";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    // SEC-003: relatório exige permissão.
    await requirePermission(Permission.REPORTS_SALES);
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const branchId = await resolveReportBranchId(searchParams); // M3: respeita seletor
    const companyId = await getCompanyId();

    const query = opticalReportQuerySchema.parse({
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      period: searchParams.get("period") || "year",
    });

    const report = await reportsService.getOpticalReport(branchId, companyId, query);
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return handleApiError(error);
  }
}
