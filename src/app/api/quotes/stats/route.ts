import { NextResponse } from "next/server";
import { quoteService } from "@/services/quote.service";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/quotes/stats
 * Retorna estatísticas de orçamentos
 *
 * Query params:
 * - branchId?: string (filtro por filial)
 * - startDate?: string (ISO date)
 * - endDate?: string (ISO date)
 *
 * Retorna:
 * - total: number (total de orçamentos)
 * - byStatus: Record<QuoteStatus, number>
 * - conversionRate: number (%)
 * - totalQuotedValue: number
 * - totalConvertedValue: number
 * - avgTimeToConversion: number (dias)
 * - lostReasons: Record<string, number>
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const userBranchId = await getBranchId();

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") || userBranchId;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const stats = await quoteService.getStats(companyId, branchId, startDate, endDate);

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
