import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { DREService } from "@/services/reports/dre.service";
import { parseISO } from "date-fns";

/**
 * GET /api/reports/financial/dre
 * Relatório DRE (Demonstrativo de Resultado do Exercício)
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = request.nextUrl;

    // Parse date range (required)
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    if (!startDateParam || !endDateParam) {
      return NextResponse.json(
        { error: "startDate e endDate são obrigatórios" },
        { status: 400 }
      );
    }

    const startDate = parseISO(startDateParam);
    const endDate = parseISO(endDateParam);

    const service = new DREService();
    const report = await service.generateReport(companyId, { startDate, endDate });

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}
