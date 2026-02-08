import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const status = searchParams.get("status");
    const userName = searchParams.get("userName");

    const where: any = {
      companyId,
    };

    if (dateFrom && dateTo) {
      where.openedAt = {
        gte: new Date(dateFrom),
        lte: new Date(dateTo),
      };
    }

    if (status && status !== "all") {
      where.status = status;
    }

    if (userName) {
      where.openedByUser = {
        name: {
          contains: userName,
          mode: "insensitive",
        },
      };
    }

    const cashShifts = await prisma.cashShift.findMany({
      where,
      include: {
        openedByUser: {
          select: {
            name: true,
            email: true,
          },
        },
        closedByUser: {
          select: {
            name: true,
            email: true,
          },
        },
        branch: {
          select: {
            name: true,
          },
        },
        movements: {
          where: {
            type: "SALE_PAYMENT",
          },
          select: {
            amount: true,
          },
        },
      },
      orderBy: {
        openedAt: "desc",
      },
    });

    // Calcular totais para cada caixa
    const data = cashShifts.map((shift) => {
      const totalSales = shift.movements.reduce(
        (sum, mov) => sum + Number(mov.amount),
        0
      );

      return {
        id: shift.id,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        status: shift.status,
        openingBalance: Number(shift.openingFloatAmount),
        closingBalance: shift.closingDeclaredCash
          ? Number(shift.closingDeclaredCash)
          : null,
        expectedBalance: shift.closingExpectedCash
          ? Number(shift.closingExpectedCash)
          : null,
        difference: shift.differenceCash ? Number(shift.differenceCash) : null,
        totalSales,
        totalExpenses: 0, // TODO: calcular despesas
        openedByUser: shift.openedByUser,
        closedByUser: shift.closedByUser,
        branch: shift.branch,
      };
    });

    return successResponse(data);
  } catch (error) {
    return handleApiError(error);
  }
}
