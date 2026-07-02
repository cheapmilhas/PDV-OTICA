import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { getOwnerDailySummary } from "@/services/owner-daily-summary.service";

/**
 * GET /api/funil/resumo-hoje
 * "Resumo do dono" (Sprint 5, #12): o dia da ótica num relance — conversas de
 * hoje, respondidas vs. sem resposta, e reclamações. Read-only, multi-tenant.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const branchId = new URL(request.url).searchParams.get("branchId");
    const summary = await getOwnerDailySummary(
      companyId,
      branchId && branchId !== "ALL" ? branchId : null,
    );
    return successResponse(summary);
  } catch (error) {
    return handleApiError(error);
  }
}
