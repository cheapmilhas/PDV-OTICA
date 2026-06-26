import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { resolveReportBranchFilter } from "@/lib/resolve-report-branch";
import { handleApiError } from "@/lib/error-handler";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";
import { generateCommissionPreview } from "@/services/reports/commission-preview.service";

/**
 * GET /api/reports/commissions/preview?year=2026&month=6
 *
 * PREVIEW (read-only) da comissão pela regra NOVA × a atual, por mês e ótica.
 * Mesmo gating do relatório real (REPORTS_FINANCIAL). NÃO grava nada, NÃO muda
 * pagamento — só calcula e exibe a comparação. Comissão Fase 2 / Passo 3a.
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

    // M3: resolve filial com guard de papel + validação de empresa. {} = ALL.
    const branchFilter = await resolveReportBranchFilter(searchParams);

    const report = await generateCommissionPreview(
      companyId,
      year,
      month,
      branchFilter.branchId
    );

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return handleApiError(error);
  }
}
