import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export async function GET() {
  try {
    const companyId = await getCompanyId();
    const today = new Date();
    const sevenDaysAgo = subDays(today, 6); // Últimos 7 dias incluindo hoje

    // Buscar vendas dos últimos 7 dias
    const sales = await prisma.sale.findMany({
      where: {
        companyId,
        status: "COMPLETED",
        createdAt: {
          gte: startOfDay(sevenDaysAgo),
        },
      },
      select: {
        total: true,
        createdAt: true,
      },
    });

    // Agrupar vendas por dia
    const salesByDay: Record<string, number> = {};

    // Inicializar todos os dias com 0
    for (let i = 0; i < 7; i++) {
      const date = subDays(today, 6 - i);
      const dateKey = format(date, "yyyy-MM-dd");
      salesByDay[dateKey] = 0;
    }

    // Somar vendas por dia
    sales.forEach((sale) => {
      const dateKey = format(new Date(sale.createdAt), "yyyy-MM-dd");
      if (salesByDay[dateKey] !== undefined) {
        salesByDay[dateKey] += Number(sale.total);
      }
    });

    // Formatar dados para o gráfico
    const data = Object.entries(salesByDay).map(([date, valor]) => {
      const dateObj = new Date(date);
      return {
        day: format(dateObj, "EEE", { locale: ptBR }), // Seg, Ter, Qua...
        date: date,
        valor: Math.round(valor * 100) / 100, // Arredondar para 2 casas decimais
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
