import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { CommissionsService } from "@/services/reports/commissions.service";
import { parseISO } from "date-fns";

/**
 * GET /api/reports/commissions
 * Relatório de comissões por vendedor
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = request.nextUrl;

    // Parse filters
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate e endDate são obrigatórios" },
        { status: 400 }
      );
    }

    const filters = {
      startDate: parseISO(startDate),
      endDate: parseISO(endDate),
      userId: searchParams.get("userId") || undefined,
      status: searchParams.get("status") || undefined,
    };

    // Validate date range (max 1 year)
    const daysDiff = Math.abs(
      filters.endDate.getTime() - filters.startDate.getTime()
    ) / (1000 * 60 * 60 * 24);

    if (daysDiff > 365) {
      return NextResponse.json(
        { error: "Período máximo de 1 ano" },
        { status: 400 }
      );
    }

    const service = new CommissionsService();
    const report = await service.generateReport(companyId, filters);

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}
