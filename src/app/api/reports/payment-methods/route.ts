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

    // Buscar pagamentos agrupados por método
    // Como Sale não tem campo paymentMethod, buscamos de SalePayment
    const paymentData = await prisma.salePayment.groupBy({
      by: ['method'],
      where: {
        sale: {
          companyId: session.user.companyId,
          createdAt: { gte: startOfMonth },
          status: "COMPLETED",
        }
      },
      _sum: {
        amount: true,
      },
      _count: true,
    });

    const methodLabels: Record<string, string> = {
      CASH: "Dinheiro",
      DEBIT_CARD: "Débito",
      CREDIT_CARD: "Crédito",
      PIX: "PIX",
      BANK_SLIP: "Boleto",
      STORE_CREDIT: "Crédito Loja",
    };

    const data = paymentData.map(item => ({
      metodo: methodLabels[item.method] || item.method,
      quantidade: item._count,
      valor: Number(item._sum.amount || 0),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Erro ao buscar métodos de pagamento:", error);
    return NextResponse.json(
      { error: "Erro ao buscar métodos de pagamento" },
      { status: 500 }
    );
  }
}
