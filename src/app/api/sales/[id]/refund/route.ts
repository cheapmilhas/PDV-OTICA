import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";
import { handleApiError, businessRuleError } from "@/lib/error-handler";
import { createdResponse } from "@/lib/api-response";
import { saleService } from "@/services/sale.service";
import { withPlanFeatureGuard } from "@/lib/with-plan-feature";

/**
 * POST /api/sales/[id]/refund
 *
 * Devolução de venda. Na prática a devolução é sempre TOTAL (decisão Matheus
 * 2026-05-30: troca = venda nova + entrada manual de estoque). Por isso este
 * endpoint faz a devolução completa via saleService.refundFull, que reverte
 * TUDO (estoque+FIFO, cartão, crediário, caixa, cashback ganho E usado,
 * comissão, campanha, OS vinculada) e cria o registro Refund.
 *
 * O refund parcial antigo (item-a-item) foi descontinuado — gerava prejuízo
 * (não revertia FIFO/cartão/AR/caixa/cashback e podia duplicar).
 */
export const POST = withPlanFeatureGuard(async (
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    // SEC-001: devolução de venda exige permissão sales.refund (GERENTE+ e ADMIN).
    // Antes só exigia estar logado — qualquer papel revertia receita.
    await requirePermission(Permission.SALES_REFUND);
    const companyId = await getCompanyId();
    const { id: saleId } = await params;

    const body = await req.json().catch(() => ({}));
    const { reason, refundMethod } = body ?? {};

    if (!saleId) {
      throw businessRuleError("ID da venda é obrigatório");
    }

    const sale = await saleService.refundFull(saleId, companyId, {
      reason,
      refundMethod,
    });

    return createdResponse(JSON.parse(JSON.stringify(sale)));
  } catch (error) {
    return handleApiError(error);
  }
});
