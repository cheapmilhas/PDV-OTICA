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

    // Agrupar vendas por vendedor
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
    console.error("Erro ao buscar performance da equipe:", error);
    return NextResponse.json(
      { error: "Erro ao buscar performance da equipe" },
      { status: 500 }
    );
  }
}
