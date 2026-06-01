import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { resolveReportBranchFilter } from "@/lib/resolve-report-branch";
import { startOfLocalMonth, endOfLocalMonth } from "@/lib/date-utils";
import { subMonths } from "date-fns";
import { handleApiError } from "@/lib/error-handler";

const log = logger.child({ route: "reports/summary" });

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    // M3: respeita o seletor de filial com guard de papel + validação de empresa.
    const branchFilter = await resolveReportBranchFilter(searchParams);

    // M2: limites de mês no fuso local (America/Sao_Paulo), não UTC do servidor.
    const now = new Date();
    const startOfMonth = startOfLocalMonth(now);
    const startOfLastMonth = startOfLocalMonth(subMonths(now, 1));
    const endOfLastMonth = endOfLocalMonth(subMonths(now, 1));

    // Vendas do mês atual
    const salesMonth = await prisma.sale.aggregate({
      where: {
        companyId: session.user.companyId,
        createdAt: { gte: startOfMonth },
        status: "COMPLETED",
        ...branchFilter,
      },
      _sum: { total: true },
      _count: true,
    });

    // Vendas do mês anterior
    const salesLastMonth = await prisma.sale.aggregate({
      where: {
        companyId: session.user.companyId,
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        status: "COMPLETED",
        ...branchFilter,
      },
      _sum: { total: true },
    });

    // Calcular lucro manualmente a partir dos SaleItems
    const saleItems = await prisma.saleItem.aggregate({
      where: {
        sale: {
          companyId: session.user.companyId,
          createdAt: { gte: startOfMonth },
          status: "COMPLETED",
          ...branchFilter,
        }
      },
      _sum: {
        lineTotal: true,
        costPrice: true,
        qty: true,
      },
    });

    // Buscar itens individuais para calcular lucro corretamente
    const itemsForProfit = await prisma.saleItem.findMany({
      where: {
        sale: {
          companyId: session.user.companyId,
          createdAt: { gte: startOfMonth },
          status: "COMPLETED",
          ...branchFilter,
        }
      },
      select: {
        lineTotal: true,
        costPrice: true,
        qty: true,
      },
    });

    // Calcular lucro: sum(lineTotal - (costPrice * qty))
    const profit = itemsForProfit.reduce((acc, item) => {
      const itemProfit = Number(item.lineTotal) - (Number(item.costPrice) * item.qty);
      return acc + itemProfit;
    }, 0);

    // Novos clientes do mês
    const newCustomers = await prisma.customer.count({
      where: {
        companyId: session.user.companyId,
        active: true,
        createdAt: { gte: startOfMonth },
      },
    });

    const totalSales = Number(salesMonth._sum.total || 0);
    const lastMonthSales = Number(salesLastMonth._sum.total || 0);
    const totalCount = salesMonth._count;

    const growth = lastMonthSales > 0
      ? ((totalSales - lastMonthSales) / lastMonthSales) * 100
      : 0;

    const avgTicket = totalCount > 0 ? totalSales / totalCount : 0;

    return NextResponse.json({
      summary: {
        vendas: totalSales,
        lucro: profit,
        crescimento: Number(growth.toFixed(1)),
        ticketMedio: Number(avgTicket.toFixed(2)),
        totalVendas: totalCount,
        novosClientes: newCustomers,
      }
    });
  } catch (error) {
    log.error("Erro ao buscar resumo", { error: error instanceof Error ? error.message : String(error) });
    // handleApiError preserva o status de AppError (ex: 403 do guard de filial).
    return handleApiError(error);
  }
}
