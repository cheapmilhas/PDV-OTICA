import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

// Mapeamento de cores por método de pagamento
const paymentColors: Record<string, string> = {
  CASH: "#10b981", // Verde
  PIX: "#8b5cf6", // Roxo
  DEBIT_CARD: "#3b82f6", // Azul
  CREDIT_CARD: "#f59e0b", // Laranja
  BOLETO: "#ef4444", // Vermelho
  STORE_CREDIT: "#14b8a6", // Teal
  CHEQUE: "#6366f1", // Indigo
  AGREEMENT: "#ec4899", // Pink
  OTHER: "#6b7280", // Cinza
};

// Nomes amigáveis dos métodos
const paymentNames: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT_CARD: "Débito",
  CREDIT_CARD: "Crédito",
  BOLETO: "Boleto",
  STORE_CREDIT: "Crediário",
  CHEQUE: "Cheque",
  AGREEMENT: "Convênio",
  OTHER: "Outros",
};

export async function GET() {
  try {
    const companyId = await getCompanyId();
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Buscar distribuição de pagamentos do mês
    const payments = await prisma.salePayment.groupBy({
      by: ['method'],
      where: {
        sale: {
          companyId,
          status: "COMPLETED",
          createdAt: {
            gte: startOfMonth,
          },
        },
        status: "RECEIVED",
      },
      _count: {
        id: true,
      },
      _sum: {
        amount: true,
      },
    });

    // Calcular total para percentual
    const total = payments.reduce((sum, p) => sum + (p._count.id || 0), 0);

    // Formatar dados para o gráfico
    const data = payments.map((payment) => ({
      name: paymentNames[payment.method] || payment.method,
      value: payment._count.id || 0,
      amount: Math.round((Number(payment._sum.amount) || 0) * 100) / 100,
      color: paymentColors[payment.method] || "#6b7280",
      percentage: total > 0 ? Math.round(((payment._count.id || 0) / total) * 100) : 0,
    }));

    // Ordenar por quantidade (maior primeiro)
    data.sort((a, b) => b.value - a.value);

    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
