import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { listExamNoPurchase } from "@/services/exam-no-purchase.service";

/**
 * GET /api/leads/exam-no-purchase
 * "Fez exame e não comprou" (Sprint 3, #10): clientes que pagaram o exame de
 * vista aqui mas não voltaram pra comprar os óculos (armação/lente) na janela.
 * Read-only, recuperação manual. Multi-tenant + filial opcional (?branchId).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const branchId = new URL(request.url).searchParams.get("branchId");
    const rows = await listExamNoPurchase(
      companyId,
      branchId && branchId !== "ALL" ? branchId : null,
    );
    return successResponse({ rows, total: rows.length });
  } catch (error) {
    return handleApiError(error);
  }
}
