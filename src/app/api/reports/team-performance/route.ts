import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { resolveReportBranchFilter } from "@/lib/resolve-report-branch";
import { startOfLocalMonth } from "@/lib/date-utils";
import { handleApiError } from "@/lib/error-handler";

const log = logger.child({ route: "reports/team-performance" });

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    // M3: respeita seletor de filial. M2: mês no fuso local.
    const branchFilter = await resolveReportBranchFilter(searchParams);
    const startOfMonth = startOfLocalMonth(new Date());

    // Agrupar vendas por vendedor
    const salesByUser = await prisma.sale.groupBy({
      by: ['sellerUserId'],
      where: {
        companyId: session.user.companyId,
        createdAt: { gte: startOfMonth },
        status: "COMPLETED",
        ...branchFilter,
      },
      _sum: {
        total: true,
      },
      _count: true,
      orderBy: {
        _sum: {
          total: 'desc',
        }
      },
      take: 10,
    });

    // Buscar informações dos usuários
    const userIds = salesByUser.map(item => item.sellerUserId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });

    const data = salesByUser.map((item) => {
      const user = users.find(u => u.id === item.sellerUserId);
      const totalValue = Number(item._sum.total || 0);
      const salesCount = item._count;

      return {
        nome: user?.name || 'Usuário não encontrado',
        vendas: salesCount,
        valor: totalValue,
        ticketMedio: salesCount > 0 ? totalValue / salesCount : 0,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    log.error("Erro ao buscar performance da equipe", { error: error instanceof Error ? error.message : String(error) });
    return handleApiError(error);
  }
}
