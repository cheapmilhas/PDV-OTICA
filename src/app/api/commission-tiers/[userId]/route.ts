import { NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { requirePlanFeature } from "@/lib/plan-features";
import { deleteCommissionTiers } from "@/services/commission-tier.service";

/**
 * DELETE /api/commission-tiers/[userId]
 * Remove o override de metas de um vendedor — ele volta a usar o padrão da loja.
 * Não afeta os cálculos antigos nem o motor (só apaga linhas de SellerCommissionTier).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "goals");
    await requirePermission("settings.edit");

    const { userId } = await params;
    await deleteCommissionTiers(companyId, userId);

    return NextResponse.json({ success: true, message: "Override removido" });
  } catch (error) {
    return handleApiError(error);
  }
}
