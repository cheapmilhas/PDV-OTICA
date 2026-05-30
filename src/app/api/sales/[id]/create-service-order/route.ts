import { NextResponse } from "next/server";
import { serviceOrderService } from "@/services/service-order.service";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * POST /api/sales/[id]/create-service-order
 *
 * Gera (ou recupera) a Ordem de Serviço de uma venda com lente.
 * Idempotente: se a venda já tem OS vinculada, retorna a existente.
 *
 * Usado pelo botão "Gerar OS" na tela de detalhes da venda — para casos em que
 * a geração automática (pós-venda) não rodou, ou vendas antigas.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("service_orders.create");
    const userId = session.user.id;

    const { id } = await params;

    const result = await serviceOrderService.createFromSale(id, companyId, userId);

    if (!result.serviceOrderId) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Esta venda não possui itens de lente para gerar uma Ordem de Serviço.",
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        serviceOrderId: result.serviceOrderId,
        number: result.number,
        created: result.created,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
