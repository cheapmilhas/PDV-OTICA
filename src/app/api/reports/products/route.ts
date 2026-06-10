import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { resolveReportBranchId } from "@/lib/resolve-report-branch";
import { handleApiError } from "@/lib/error-handler";
import { reportsService } from "@/services/reports.service";
import { productReportQuerySchema } from "@/lib/validations/reports.schema";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    // SEC-003: relatório exige permissão.
    await requirePermission(Permission.REPORTS_INVENTORY);
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const branchId = await resolveReportBranchId(searchParams); // M3: respeita seletor

    const query = productReportQuerySchema.parse({
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      period: searchParams.get("period") || "month",
      limit: searchParams.get("limit") || 20,
      categoryId: searchParams.get("categoryId") || undefined,
    });

    const report = await reportsService.getProductsReport(branchId, query);
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return handleApiError(error);
  }
}
