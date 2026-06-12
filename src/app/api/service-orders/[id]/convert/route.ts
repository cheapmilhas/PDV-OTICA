import { NextRequest, NextResponse } from "next/server";
import { serviceOrderService } from "@/services/service-order.service";
import { requirePermission, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError, unauthorizedError } from "@/lib/error-handler";
import { auth } from "@/auth";

/**
 * POST /api/service-orders/[id]/convert
 * Valida que a OS pode ser convertida em venda e retorna dados para o PDV.
 *
 * Validações:
 * - OS deve estar READY ou DELIVERED
 * - OS não pode ter venda já vinculada
 * - OS deve ter pelo menos 1 item
 *
 * Retorna: OS com itens e cliente para popular o PDV
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw unauthorizedError("Sua sessão expirou. Faça login novamente.");
    }

    const { id } = await params;
    const companyId = await getCompanyId();
    await requirePermission("sales.create");

    const order = await serviceOrderService.validateForSale(id, companyId);

    // Serializar Decimals
    const serialized = {
      id: order.id,
      number: order.number,
      status: order.status,
      customerId: order.customerId,
      customer: order.customer,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        description: item.description,
        qty: item.qty,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        lineTotal: Number(item.lineTotal),
        product: item.product
          ? {
              id: item.product.id,
              name: item.product.name,
              sku: item.product.sku,
              salePrice: Number(item.product.salePrice),
              stockQty: item.product.stockQty,
              stockControlled: item.product.stockControlled,
            }
          : null,
      })),
    };

    return NextResponse.json({ data: serialized });
  } catch (error) {
    return handleApiError(error);
  }
}
