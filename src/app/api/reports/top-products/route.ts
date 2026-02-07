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
    const limit = parseInt(searchParams.get("limit") || "10");

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Buscar produtos mais vendidos
    const topProducts = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: {
        sale: {
          companyId: session.user.companyId,
          createdAt: { gte: startOfMonth },
          status: "COMPLETED",
        }
      },
      _sum: {
        qty: true,
        lineTotal: true,
      },
      orderBy: {
        _sum: {
          lineTotal: 'desc',
        }
      },
      take: limit,
    });

    // Buscar informações dos produtos
    const productIds = topProducts
      .map(item => item.productId)
      .filter((id): id is string => id !== null);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });

    const data = topProducts.map((item, index) => {
      const product = products.find(p => p.id === item.productId);
      return {
        rank: index + 1,
        name: product?.name || 'Produto não encontrado',
        sku: product?.sku || '',
        unidadesVendidas: Number(item._sum.qty || 0),
        valorTotal: Number(item._sum.lineTotal || 0),
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Erro ao buscar top produtos:", error);
    return NextResponse.json(
      { error: "Erro ao buscar top produtos" },
      { status: 500 }
    );
  }
}
