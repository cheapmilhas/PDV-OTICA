import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { resolveReportBranchFilter } from "@/lib/resolve-report-branch";
import { handleApiError } from "@/lib/error-handler";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";
import { generateMonthlyCommission } from "@/services/reports/commission-monthly.service";

/**
 * GET /api/reports/commissions/monthly?year=2026&month=7
 *
 * Comissão do mês pela REGRA NOVA (fonte oficial, read-only). Mesmo gating do
 * relatório de comissões (REPORTS_FINANCIAL). NÃO grava, sem lifecycle ainda.
 * Comissão Fase 2 / virar a chave.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission(Permission.REPORTS_FINANCIAL);
    const companyId = await getCompanyId();
    const { searchParams } = request.nextUrl;

    const year = Number(searchParams.get("year"));
    const month = Number(searchParams.get("month"));

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "year inválido" }, { status: 400 });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "month inválido (1-12)" }, { status: 400 });
    }

    const branchFilter = await resolveReportBranchFilter(searchParams);
    const report = await generateMonthlyCommission(companyId, year, month, branchFilter.branchId);

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return handleApiError(error);
  }
}
