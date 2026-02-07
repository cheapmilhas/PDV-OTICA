import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Buscar vendas agrupadas por tipo de produto
    const salesByCategory = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: {
        sale: {
          companyId: session.user.companyId,
          status: "COMPLETED",
        }
      },
      _sum: {
        qty: true,
      },
    });

    // Buscar informações dos produtos
    const productIds = salesByCategory
      .map(item => item.productId)
      .filter((id): id is string => id !== null);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, type: true },
    });

    // Agrupar por tipo de produto
    const typeMap: Record<string, number> = {};
    salesByCategory.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        const type = product.type;
        typeMap[type] = (typeMap[type] || 0) + Number(item._sum.qty || 0);
      }
    });

    // Converter para formato de gráfico
    const typeLabels: Record<string, string> = {
      FRAME: "Armações",
      LENS_SERVICE: "Lentes",
      SUNGLASSES: "Óculos de Sol",
      CONTACT_LENS: "Lentes de Contato",
      ACCESSORY: "Acessórios",
      SERVICE: "Serviços",
    };

    const colors = [
      "#8884d8",
      "#82ca9d",
      "#ffc658",
      "#ff8042",
      "#a4de6c",
      "#d0ed57",
    ];

    const data = Object.entries(typeMap).map(([type, value], index) => ({
      name: typeLabels[type] || type,
      value: Number(value),
      color: colors[index % colors.length],
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Erro ao buscar distribuição por categoria:", error);
    return NextResponse.json(
      { error: "Erro ao buscar distribuição por categoria" },
      { status: 500 }
    );
  }
}
