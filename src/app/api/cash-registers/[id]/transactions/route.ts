import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { cashService } from "@/services/cash.service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const shift = await prisma.cashShift.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!shift) {
      return NextResponse.json(
        { error: "Caixa não encontrado" },
        { status: 404 }
      );
    }

    const movements = await prisma.cashMovement.findMany({
      where: {
        cashShiftId: id,
      },
      include: {
        createdByUser: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const data = movements.map((mov) => ({
      id: mov.id,
      type: mov.type,
      direction: mov.direction,
      method: mov.method,
      amount: Number(mov.amount),
      originType: mov.originType,
      description: mov.note || getMovementDescription(mov.type),
      operador: mov.createdByUser?.name ?? null,
      createdAt: mov.createdAt,
    }));

    const shiftArg = {
      id: shift.id,
      branchId: shift.branchId,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
    };

    const [salesByMethod, receivableRows, voidedReceivableRows] = await Promise.all([
      cashService.getShiftSalesByMethod(shiftArg, companyId),
      cashService.getShiftSalePayments(shiftArg, companyId),
      cashService.getShiftVoidedReceivables(shiftArg, companyId),
    ]);

    return successResponse({ movements: data, salesByMethod, receivableRows, voidedReceivableRows });
  } catch (error) {
    return handleApiError(error);
  }
}

function getMovementDescription(type: string): string {
  const descriptions: Record<string, string> = {
    OPENING_FLOAT: "Abertura de caixa",
    SALE_PAYMENT: "Venda",
    WITHDRAWAL: "Sangria",
    SUPPLY: "Reforço",
    REFUND: "Reembolso",
    ADJUSTMENT: "Ajuste",
    CLOSING: "Fechamento",
  };

  return descriptions[type] || type;
}
