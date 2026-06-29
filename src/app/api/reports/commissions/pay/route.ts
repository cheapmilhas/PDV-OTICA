import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { requirePlanFeature } from "@/lib/plan-features";
import { isNewCommissionEngine } from "@/lib/commission-flag";
import { paySellerCommission } from "@/services/commission/pay-seller-commission";

const bodySchema = z.object({
  userId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

/**
 * POST /api/reports/commissions/pay
 * Paga a comissão de um vendedor/mês no MOTOR NOVO (Bloco 4): materializa o
 * snapshot + lança a despesa no ledger (COMMISSION_EXPENSE). Idempotente.
 *
 * Guard INVERTIDO: só funciona em modo "new" (o legacy paga por outra rota).
 * Exige goals.manage (mesma permissão de operar comissão).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "goals");
    await requirePermission("goals.manage");

    if (!isNewCommissionEngine(companyId)) {
      throw forbiddenError(
        "Pagamento de comissão pela regra nova indisponível: esta ótica usa o modelo legado."
      );
    }

    const { userId, year, month } = bodySchema.parse(await request.json());
    const result = await paySellerCommission({
      companyId,
      userId,
      year,
      month,
      paidByUserId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: result.payment,
      message: result.alreadyPaid ? "Comissão já estava paga." : "Comissão paga e lançada no DRE.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
