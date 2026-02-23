import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

/**
 * PATCH /api/sales/[id]/seller
 * Atualiza o vendedor de uma venda
 *
 * Esta operação NÃO afeta o caixa, apenas altera o vendedor responsável
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Extrai o id dos params
    const { id } = await context.params;

    // Requer autenticação
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const companyId = await getCompanyId();
    await requirePermission("sales.edit_seller");

    // Parse body
    const body = await request.json();
    const { sellerId } = body;

    if (!sellerId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "ID do vendedor é obrigatório",
          },
        },
        { status: 400 }
      );
    }

    // Busca a venda
    const sale = await prisma.sale.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            cpf: true,
            phone: true,
          },
        },
        sellerUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
              },
            },
          },
        },
        payments: true,
      },
    });

    if (!sale) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Venda não encontrada",
          },
        },
        { status: 404 }
      );
    }

    // Verifica se a venda está cancelada
    if (sale.status === "CANCELED" || sale.status === "REFUNDED") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_STATUS",
            message: "Não é possível alterar o vendedor de uma venda cancelada",
          },
        },
        { status: 400 }
      );
    }

    // Verifica se o vendedor existe
    const seller = await prisma.user.findFirst({
      where: {
        id: sellerId,
        companyId,
        active: true,
      },
    });

    if (!seller) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Vendedor não encontrado",
          },
        },
        { status: 404 }
      );
    }

    // Atualiza o vendedor
    const updatedSale = await prisma.sale.update({
      where: { id },
      data: {
        sellerUserId: sellerId,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            cpf: true,
            phone: true,
          },
        },
        sellerUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
              },
            },
          },
        },
        payments: true,
      },
    });

    // Serializa Decimals
    const serializedSale = {
      ...updatedSale,
      subtotal: Number(updatedSale.subtotal),
      discountTotal: Number(updatedSale.discountTotal),
      total: Number(updatedSale.total),
      agreementDiscount: updatedSale.agreementDiscount
        ? Number(updatedSale.agreementDiscount)
        : null,
      items: updatedSale.items.map((item) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        lineTotal: Number(item.lineTotal),
      })),
      payments: updatedSale.payments.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
      })),
    };

    return successResponse(serializedSale);
  } catch (error) {
    return handleApiError(error);
  }
}
