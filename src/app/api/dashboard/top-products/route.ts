import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Buscar os produtos mais vendidos do mês atual
    const topProducts = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: {
        sale: {
          status: "COMPLETED",
          createdAt: {
            gte: startOfMonth,
          },
        },
        productId: {
          not: null,
        },
      },
      _sum: {
        qty: true,
        lineTotal: true,
      },
      orderBy: {
        _sum: {
          qty: 'desc',
        },
      },
      take: 5,
    });

    // Buscar detalhes dos produtos
    const productIds = topProducts.map((item) => item.productId).filter((id): id is string => id !== null);

    const products = await prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    // Mapear produtos com suas vendas
    const productsMap = new Map(products.map((p) => [p.id, p.name]));

    const data = topProducts.map((item) => ({
      name: productsMap.get(item.productId!) || 'Produto não encontrado',
      vendas: item._sum.qty || 0,
      revenue: Math.round((Number(item._sum.lineTotal) || 0) * 100) / 100,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Erro ao buscar top produtos:", error);
    return NextResponse.json(
      { error: "Erro ao buscar top produtos" },
      { status: 500 }
    );
  }
}
