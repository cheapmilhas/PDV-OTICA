import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { resolveReportBranchFilter } from "@/lib/resolve-report-branch";
import { startOfLocalMonth, endOfLocalMonth } from "@/lib/date-utils";
import { subMonths } from "date-fns";
import { handleApiError } from "@/lib/error-handler";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";

const log = logger.child({ route: "reports/sales-evolution" });

export async function GET(request: Request) {
  try {
    // SEC-003: relatório exige permissão.
    await requirePermission(Permission.REPORTS_SALES);
    const session = await auth();
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get("months") || "6");
    // M3: respeita seletor de filial.
    const branchFilter = await resolveReportBranchFilter(searchParams);

    const today = new Date();
    const monthsData = [];

    // Buscar vendas dos últimos N meses
    for (let i = months - 1; i >= 0; i--) {
      // M2: limites do mês no fuso local (não UTC do servidor).
      const monthRef = subMonths(today, i);
      const startDate = startOfLocalMonth(monthRef);
      const endDate = endOfLocalMonth(monthRef);

      const sales = await prisma.sale.aggregate({
        where: {
          companyId: session.user.companyId,
          createdAt: { gte: startDate, lte: endDate },
          status: "COMPLETED",
          ...branchFilter,
        },
        _sum: { total: true },
      });

      // Calcular lucro manualmente a partir dos SaleItems
      const itemsForProfit = await prisma.saleItem.findMany({
        where: {
          sale: {
            companyId: session.user.companyId,
            createdAt: { gte: startDate, lte: endDate },
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

      // Nome do mês a partir do instante de referência local (monthRef), com
      // timeZone explícito p/ não cair no mês anterior na borda.
      const shortMonth = monthRef.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' });
      const monthName = shortMonth.replace('.', '').charAt(0).toUpperCase() + shortMonth.slice(1, 3);

      monthsData.push({
        mes: monthName,
        vendas: Number(sales._sum.total || 0),
        lucro: profit,
      });
    }

    return NextResponse.json({ data: monthsData });
  } catch (error) {
    log.error("Erro ao buscar evolução de vendas", { error: error instanceof Error ? error.message : String(error) });
    return handleApiError(error);
  }
}
