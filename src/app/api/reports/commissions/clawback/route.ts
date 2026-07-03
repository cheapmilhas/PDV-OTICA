import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { requirePlanFeature } from "@/lib/plan-features";
import { isNewCommissionEngine } from "@/lib/commission-flag";
import { registerCommissionClawback } from "@/services/commission/register-clawback";

const bodySchema = z.object({
  userId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

/**
 * POST /api/reports/commissions/clawback
 * REGISTRA a glosa de uma comissão paga (FU-1) quando o pago excede o devido
 * recalculado (venda do mês devolvida após o pagamento). NÃO desconta folha —
 * apenas grava o reconhecimento p/ o dono abater no próximo fechamento.
 *
 * Mesmo gating do pagamento (goals.manage, motor novo).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "goals");
    await requirePermission("goals.manage");

    if (!isNewCommissionEngine(companyId)) {
      throw forbiddenError(
        "Glosa de comissão pela regra nova indisponível: esta ótica usa o modelo legado."
      );
    }

    const { userId, year, month } = bodySchema.parse(await request.json());
    const result = await registerCommissionClawback({
      companyId,
      userId,
      year,
      month,
      byUserId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: result.clawback,
      message: `Glosa de R$ ${result.amount} registrada. Abata no próximo fechamento do vendedor.`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
