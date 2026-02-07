import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);

    // Vendas do mês anterior (para calcular meta base)
    const lastMonthSales = await prisma.sale.aggregate({
      where: {
        companyId: session.user.companyId,
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        status: "COMPLETED",
      },
      _sum: { total: true },
    });

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

    // Calcular meta geral como 110% das vendas do mês anterior
    const lastMonthTotal = Number(lastMonthSales._sum.total || 0);
    const metaGeralMes = lastMonthTotal > 0 ? lastMonthTotal * 1.1 : 150000;

    // Meta por vendedor (dividir meta geral pelo número de vendedores)
    const metaPorVendedor = metaGeralMes / salesByUser.length;

    // Calcular ranking
    const ranking = salesByUser.map(sale => {
      const user = users.find(u => u.id === sale.sellerUserId);
      const vendas = Number(sale._sum.total || 0);
      const commissionRate = Number(user?.defaultCommissionPercent || 0);
      const comissao = (vendas * commissionRate) / 100;
      const percentual = metaPorVendedor > 0 ? (vendas / metaPorVendedor) * 100 : 0;

      return {
        id: sale.sellerUserId,
        nome: user?.name || 'Usuário não encontrado',
        meta: metaPorVendedor,
        vendas,
        percentual: Number(percentual.toFixed(1)),
        comissao,
      };
    });

    // Ordenar por vendas (ranking decrescente)
    ranking.sort((a, b) => b.vendas - a.vendas);

    // Adicionar posição
    const rankingComPosicao = ranking.map((item, index) => ({
      ...item,
      posicao: index + 1,
    }));

    return NextResponse.json({ data: rankingComPosicao });
  } catch (error) {
    console.error("Erro ao buscar ranking de vendedores:", error);
    return NextResponse.json(
      { error: "Erro ao buscar ranking de vendedores" },
      { status: 500 }
    );
  }
}
