import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { goalsService } from "@/services/goals.service";
import { requirePlanFeature } from "@/lib/plan-features";
import { isNewCommissionEngine } from "@/lib/commission-flag";

interface Params {
  params: Promise<{ id: string }>;
}

// PUT - Marcar comissão como paga
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "goals");
    await requirePermission("goals.manage");
    // Kill-switch COMMISSION_ENGINE: em modo "new" a comissão legada (SellerCommission)
    // não é operada por aqui — a tela esconde o "Pagar", mas o backend também recusa
    // para ninguém marcar pago via API direto. Em "legacy" funciona normal.
    if (isNewCommissionEngine()) {
      throw forbiddenError(
        "Comissão pela regra nova: pagamento manual de comissão legada está desativado."
      );
    }
    const { id } = await params;
    const commission = await goalsService.markCommissionAsPaid(id);
    return NextResponse.json({ success: true, data: commission, message: "Comissão marcada como paga" });
  } catch (error) {
    return handleApiError(error);
  }
}
