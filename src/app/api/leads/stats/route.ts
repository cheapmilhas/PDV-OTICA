import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { getLeadStats } from "@/services/lead.service";

/**
 * GET /api/leads/stats
 * Métricas do funil: total, ganhos, taxa de conversão, agregação por motivo de
 * perda e por origem. Multi-tenant + filtro opcional por filial (?branchId).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const branchId = new URL(request.url).searchParams.get("branchId");
    const stats = await getLeadStats(
      companyId,
      branchId && branchId !== "ALL" ? branchId : null
    );
    return successResponse(stats);
  } catch (error) {
    return handleApiError(error);
  }
}
