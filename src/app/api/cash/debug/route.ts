import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/cash/debug
 * Rota de debug para verificar CashMovements
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const branchId = await getBranchId();

    // 1. Buscar caixa aberto
    const openShift = await prisma.cashShift.findFirst({
      where: { branchId, status: "OPEN" },
      include: {
        movements: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    // 2. Buscar todos os caixas da filial
    const allShifts = await prisma.cashShift.findMany({
      where: { branchId },
      select: {
        id: true,
        status: true,
        openedAt: true,
        closedAt: true,
        _count: {
          select: { movements: true },
        },
      },
      orderBy: { openedAt: "desc" },
      take: 5,
    });

    // 3. Buscar todos os CashMovements do caixa aberto
    let movements: any[] = [];
    if (openShift) {
      movements = await prisma.cashMovement.findMany({
        where: { cashShiftId: openShift.id },
        include: {
          salePayment: {
            select: {
              id: true,
              saleId: true,
              method: true,
              amount: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    // 4. Buscar últimas vendas
    const recentSales = await prisma.sale.findMany({
      where: { companyId, branchId },
      include: {
        payments: {
          include: {
            cashMovements: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return NextResponse.json(
      {
        debug: {
          branchId,
          companyId,
          openShift: openShift
            ? {
                id: openShift.id,
                status: openShift.status,
                openedAt: openShift.openedAt,
                movementsCount: openShift.movements.length,
              }
            : null,
          allShifts,
          movements: movements.map((m) => ({
            id: m.id,
            type: m.type,
            method: m.method,
            amount: Number(m.amount),
            cashShiftId: m.cashShiftId,
            salePaymentId: m.salePaymentId,
            salePayment: m.salePayment,
            createdAt: m.createdAt,
          })),
          recentSales: recentSales.map((s) => ({
            id: s.id,
            total: Number(s.total),
            createdAt: s.createdAt,
            payments: s.payments.map((p) => ({
              id: p.id,
              method: p.method,
              amount: Number(p.amount),
              cashMovementsCount: p.cashMovements.length,
            })),
          })),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Erro no debug:", error);
    return handleApiError(error);
  }
}
