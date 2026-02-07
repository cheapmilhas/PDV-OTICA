import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get("months") || "6");

    const today = new Date();
    const monthsData = [];

    // Buscar vendas dos últimos N meses
    for (let i = months - 1; i >= 0; i--) {
      const startDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const endDate = new Date(today.getFullYear(), today.getMonth() - i + 1, 0, 23, 59, 59);

      const sales = await prisma.sale.aggregate({
        where: {
          companyId: session.user.companyId,
          createdAt: { gte: startDate, lte: endDate },
          status: "COMPLETED",
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

      const monthName = startDate.toLocaleDateString('pt-BR', { month: 'short' })
        .replace('.', '')
        .charAt(0).toUpperCase() + startDate.toLocaleDateString('pt-BR', { month: 'short' }).slice(1, 3);

      monthsData.push({
        mes: monthName,
        vendas: Number(sales._sum.total || 0),
        lucro: profit,
      });
    }

    return NextResponse.json({ data: monthsData });
  } catch (error) {
    console.error("Erro ao buscar evolução de vendas:", error);
    return NextResponse.json(
      { error: "Erro ao buscar evolução de vendas" },
      { status: 500 }
    );
  }
}
