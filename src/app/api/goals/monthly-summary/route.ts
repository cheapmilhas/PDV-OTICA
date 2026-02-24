import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requirePlanFeature } from "@/lib/plan-features";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await requirePlanFeature(session.user.companyId, "goals");

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);

    // Vendas do mês atual por usuário
    const salesByUser = await prisma.sale.groupBy({
      by: ['sellerUserId'],
      where: {
        companyId: session.user.companyId,
        createdAt: { gte: startOfMonth },
        status: "COMPLETED",
      },
      _sum: {
        total: true,
      },
      _count: true,
    });

    // Vendas do mês anterior (para calcular meta)
    const lastMonthSales = await prisma.sale.aggregate({
      where: {
        companyId: session.user.companyId,
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        status: "COMPLETED",
      },
      _sum: { total: true },
    });

    // Buscar informações dos usuários
    const userIds = salesByUser.map(s => s.sellerUserId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        defaultCommissionPercent: true,
      },
    });

    // Calcular meta como 110% das vendas do mês anterior
    const lastMonthTotal = Number(lastMonthSales._sum.total || 0);
    const metaMes = lastMonthTotal > 0 ? lastMonthTotal * 1.1 : 150000; // Meta padrão se não houver histórico

    const totalVendasMes = salesByUser.reduce((acc, s) => acc + Number(s._sum.total || 0), 0);
    const percentualMeta = metaMes > 0 ? (totalVendasMes / metaMes) * 100 : 0;

    // Calcular comissões e ranking
    const vendedoresComMetas = salesByUser.map(sale => {
      const user = users.find(u => u.id === sale.sellerUserId);
      const vendas = Number(sale._sum.total || 0);
      const commissionRate = Number(user?.defaultCommissionPercent || 0);
      const comissao = (vendas * commissionRate) / 100;

      return {
        userId: sale.sellerUserId,
        nome: user?.name || 'Usuário não encontrado',
        vendas,
        comissao,
        numeroVendas: sale._count,
      };
    });

    // Ordenar por vendas (ranking)
    vendedoresComMetas.sort((a, b) => b.vendas - a.vendas);

    const totalComissoes = vendedoresComMetas.reduce((acc, v) => acc + v.comissao, 0);
    const metaPorVendedor = metaMes / vendedoresComMetas.length;
    const vendedoresNaMeta = vendedoresComMetas.filter(v => v.vendas >= metaPorVendedor).length;

    return NextResponse.json({
      metaGeral: {
        mes: today.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
          .replace(/^\w/, (c) => c.toUpperCase()),
        valorMeta: metaMes,
        valorAtual: totalVendasMes,
        percentual: Number(percentualMeta.toFixed(1)),
      },
      resumo: {
        totalComissoes,
        vendedoresNaMeta,
        totalVendedores: vendedoresComMetas.length,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar resumo de metas:", error);
    return NextResponse.json(
      { error: "Erro ao buscar resumo de metas" },
      { status: 500 }
    );
  }
}
