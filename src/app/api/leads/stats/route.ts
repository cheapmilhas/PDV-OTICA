import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { getLeadStats } from "@/services/lead.service";
import { parseLeadStatsPeriod, periodToRange } from "@/lib/lead-stats-period";

/**
 * GET /api/leads/stats
 * Métricas do funil: total, ganhos, taxa de conversão, agregação por motivo de
 * perda e conversão por origem. Multi-tenant + filtro opcional por filial
 * (?branchId) + filtro opcional por período (?period=today|7d|30d|90d|all).
 * A janela é derivada NO SERVIDOR a partir do preset (não confia no relógio
 * do cliente); param inválido/ausente cai no padrão (30 dias).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const params = new URL(request.url).searchParams;
    const branchId = params.get("branchId");
    const period = parseLeadStatsPeriod(params.get("period"));
    const stats = await getLeadStats(
      companyId,
      branchId && branchId !== "ALL" ? branchId : null,
      periodToRange(period)
    );
    return successResponse(stats);
  } catch (error) {
    return handleApiError(error);
  }
}
