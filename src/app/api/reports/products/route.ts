import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { reportsService } from "@/services/reports.service";
import { productReportQuerySchema } from "@/lib/validations/reports.schema";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const { searchParams } = new URL(request.url);

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
