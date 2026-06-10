import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { startOfLocalMonth } from "@/lib/date-utils";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";

const log = logger.child({ route: "reports/payment-methods" });

export async function GET() {
  try {
    // SEC-003: relatório exige permissão.
    await requirePermission(Permission.REPORTS_FINANCIAL);
    const session = await auth();
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // M2: início do mês no fuso local (America/Sao_Paulo), não UTC do servidor.
    const startOfMonth = startOfLocalMonth(new Date());

    // Buscar pagamentos agrupados por método
    // Como Sale não tem campo paymentMethod, buscamos de SalePayment
    const paymentData = await prisma.salePayment.groupBy({
      by: ['method'],
      where: {
        // H14: só pagamentos EFETIVAMENTE recebidos. Antes filtrava só pelo
        // status da VENDA (COMPLETED) e somava qualquer SalePayment — incluindo
        // PENDING (crediário/boleto a receber), VOIDED e REFUNDED — inflando o
        // "recebido por método". RECEIVED é o único status com dinheiro no caixa.
        status: "RECEIVED",
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

    // Chaves devem bater com o enum PaymentMethod (BOLETO, não BANK_SLIP).
    const methodLabels: Record<string, string> = {
      CASH: "Dinheiro",
      DEBIT_CARD: "Débito",
      CREDIT_CARD: "Crédito",
      PIX: "PIX",
      BOLETO: "Boleto",
      STORE_CREDIT: "Crediário",
      BALANCE_DUE: "Saldo a Receber",
      CHEQUE: "Cheque",
      AGREEMENT: "Convênio",
      OTHER: "Outros",
    };

    const data = paymentData.map(item => ({
      metodo: methodLabels[item.method] || item.method,
      quantidade: item._count,
      valor: Number(item._sum.amount || 0),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    log.error("Erro ao buscar métodos de pagamento", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Erro ao buscar métodos de pagamento" },
      { status: 500 }
    );
  }
}
