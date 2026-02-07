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

    // Vendas do mês atual
    const salesMonth = await prisma.sale.aggregate({
      where: {
        companyId: session.user.companyId,
        createdAt: { gte: startOfMonth },
        status: "COMPLETED",
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
    console.error("Erro ao buscar resumo:", error);
    return NextResponse.json(
      { error: "Erro ao buscar resumo" },
      { status: 500 }
    );
  }
}
