import { NextResponse } from "next/server";
import { requireAuth, getCompanyId, getBranchId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { getSuggestedOpeningFloat } from "@/services/cash.service";

/**
 * GET /api/cash/shift/suggested-float
 * Sugere o fundo de troco da próxima abertura manual a partir do dinheiro
 * declarado no último caixa fechado da filial. Mesma permissão de abrir caixa.
 */
export async function GET() {
  try {
    await requireAuth();
    await requirePermission("cash_shift.open");
    const companyId = await getCompanyId();
    const branchId = await getBranchId();
    const suggested = await getSuggestedOpeningFloat(companyId, branchId);
    return NextResponse.json({ success: true, suggestedFloat: suggested });
  } catch (error) {
    return handleApiError(error);
  }
}
