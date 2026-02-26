import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

/**
 * POST — Recalcular DailyAgg para um período (idempotente).
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const body = await req.json();

    const { startDate, endDate } = body;
    let { branchId } = body;

    if (!startDate || !endDate) {
      return handleApiError(new Error("startDate e endDate são obrigatórios"));
    }

    // If no branchId provided, use the first branch for this company
    if (!branchId) {
      const defaultBranch = await prisma.branch.findFirst({
        where: { companyId },
        select: { id: true },
      });
      if (defaultBranch) {
        branchId = defaultBranch.id;
      }
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    let processedDays = 0;

    // Iterar dia a dia
    const current = new Date(start);
    while (current <= end) {
      const dayStart = new Date(current);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(current);
      dayEnd.setHours(23, 59, 59, 999);

      const saleWhere: any = {
        companyId,
        status: "COMPLETED",
        completedAt: { gte: dayStart, lte: dayEnd },
        ...(branchId ? { branchId } : {}),
      };

      // Métricas de vendas
      const sales = await prisma.sale.aggregate({
        where: saleWhere,
        _count: true,
        _sum: { total: true, discountTotal: true, subtotal: true },
      });

      const salesCount = sales._count || 0;
      const grossRevenue = Number(sales._sum.subtotal || 0);
      const discountTotal = Number(sales._sum.discountTotal || 0);
      const netRevenue = Number(sales._sum.total || 0);

      // Itens vendidos
      const itemsAgg = await prisma.saleItem.aggregate({
        where: { sale: saleWhere },
        _sum: { qty: true },
      });
      const itemsSold = itemsAgg._sum.qty || 0;

      // CMV via FinanceEntry
      const cogsEntries = await prisma.financeEntry.aggregate({
        where: {
          companyId,
          type: "COGS",
          side: "DEBIT",
          entryDate: { gte: dayStart, lte: dayEnd },
          ...(branchId ? { branchId } : {}),
        },
        _sum: { amount: true },
      });
      const cogs = Number(cogsEntries._sum.amount || 0);

      // Taxas de cartão
      const cardFeeEntries = await prisma.financeEntry.aggregate({
        where: {
          companyId,
          type: "CARD_FEE",
          side: "DEBIT",
          entryDate: { gte: dayStart, lte: dayEnd },
          ...(branchId ? { branchId } : {}),
        },
        _sum: { amount: true },
      });
      const cardFees = Number(cardFeeEntries._sum.amount || 0);

      // Comissões
      const commEntries = await prisma.financeEntry.aggregate({
        where: {
          companyId,
          type: "COMMISSION_EXPENSE",
          side: "DEBIT",
          entryDate: { gte: dayStart, lte: dayEnd },
          ...(branchId ? { branchId } : {}),
        },
        _sum: { amount: true },
      });
      const commissions = Number(commEntries._sum.amount || 0);

      // Totais por método de pagamento
      const paymentMethods = await prisma.salePayment.groupBy({
        by: ["method"],
        where: { sale: saleWhere, status: "RECEIVED" },
        _sum: { amount: true },
      });

      const getMethodTotal = (method: string) =>
        Number(paymentMethods.find((p) => p.method === method)?._sum.amount || 0);

      // Devoluções
      const refundsAgg = await prisma.refund.aggregate({
        where: {
          companyId,
          status: "COMPLETED",
          completedAt: { gte: dayStart, lte: dayEnd },
          ...(branchId ? { branchId } : {}),
        },
        _count: true,
        _sum: { totalRefund: true },
      });

      const grossMargin = netRevenue - cogs;
      const netProfit = grossMargin - cardFees - commissions;
      const avgTicket = salesCount > 0 ? netRevenue / salesCount : 0;

      // Upsert DailyAgg
      await prisma.dailyAgg.upsert({
        where: {
          companyId_branchId_date: {
            companyId,
            branchId,
            date: dayStart,
          },
        },
        update: {
          salesCount,
          grossRevenue,
          discountTotal,
          netRevenue,
          cogs,
          grossMargin,
          cardFees,
          commissions,
          netProfit,
          avgTicket,
          itemsSold,
          cashTotal: getMethodTotal("CASH"),
          pixTotal: getMethodTotal("PIX"),
          debitCardTotal: getMethodTotal("DEBIT_CARD"),
          creditCardTotal: getMethodTotal("CREDIT_CARD"),
          boletoTotal: getMethodTotal("BOLETO"),
          otherTotal: getMethodTotal("STORE_CREDIT") + getMethodTotal("CHEQUE") + getMethodTotal("OTHER"),
          refundsCount: refundsAgg._count || 0,
          refundsTotal: Number(refundsAgg._sum.totalRefund || 0),
        },
        create: {
          companyId,
          branchId,
          date: dayStart,
          salesCount,
          grossRevenue,
          discountTotal,
          netRevenue,
          cogs,
          grossMargin,
          cardFees,
          commissions,
          netProfit,
          avgTicket,
          itemsSold,
          cashTotal: getMethodTotal("CASH"),
          pixTotal: getMethodTotal("PIX"),
          debitCardTotal: getMethodTotal("DEBIT_CARD"),
          creditCardTotal: getMethodTotal("CREDIT_CARD"),
          boletoTotal: getMethodTotal("BOLETO"),
          otherTotal: getMethodTotal("STORE_CREDIT") + getMethodTotal("CHEQUE") + getMethodTotal("OTHER"),
          refundsCount: refundsAgg._count || 0,
          refundsTotal: Number(refundsAgg._sum.totalRefund || 0),
        },
      });

      processedDays++;
      current.setDate(current.getDate() + 1);
    }

    return successResponse({ processedDays, startDate, endDate });
  } catch (error) {
    return handleApiError(error);
  }
}
