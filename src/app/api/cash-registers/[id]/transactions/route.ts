import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

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
      amount: Number(mov.amount),
      description: mov.note || getMovementDescription(mov.type),
      createdAt: mov.createdAt,
    }));

    return successResponse(data);
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
