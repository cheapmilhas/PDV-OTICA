import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, eachMonthOfInterval, format } from "date-fns";

export interface DREFilters {
  startDate: Date;
  endDate: Date;
}

export interface MonthlyDREData {
  month: string;
  grossRevenue: number;
  deductions: number;
  netRevenue: number;
  cogs: number; // Cost of Goods Sold
  grossProfit: number;
  operatingExpenses: number;
  ebitda: number; // Earnings Before Interest, Taxes, Depreciation and Amortization
  financialResult: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
}

export interface DREReport {
  consolidated: {
    grossRevenue: number;
    deductions: number;
    netRevenue: number;
    cogs: number;
    grossProfit: number;
    operatingExpenses: number;
    ebitda: number;
    financialResult: number;
    netProfit: number;
    grossMargin: number;
    netMargin: number;
  };
  monthly: MonthlyDREData[];
}

export class DREService {
  async generateReport(
    companyId: string,
    filters: DREFilters
  ): Promise<DREReport> {
    const { startDate, endDate } = filters;

    // Get all months in the period
    const months = eachMonthOfInterval({ start: startDate, end: endDate });

    const monthlyData: MonthlyDREData[] = [];

    for (const month of months) {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      // 1. RECEITA BRUTA - Total de vendas do período
      const sales = await prisma.sale.findMany({
        where: {
          companyId,
          status: { not: "CANCELED" },
          createdAt: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        include: {
          items: true,
        },
      });

      const grossRevenue = sales.reduce((sum, sale) => {
        return sum + Number(sale.total);
      }, 0);

      // 2. DEDUÇÕES - Descontos concedidos
      const deductions = sales.reduce((sum, sale) => {
        return sum + Number(sale.discountTotal || 0);
      }, 0);

      // 3. RECEITA LÍQUIDA
      const netRevenue = grossRevenue - deductions;

      // 4. CMV (Custo de Mercadorias Vendidas) - Custo dos produtos vendidos
      const cogs = sales.reduce((sum, sale) => {
        const saleCost = sale.items.reduce((itemSum, item) => {
          const costPrice = Number(item.costPrice || 0);
          return itemSum + costPrice * Number(item.qty);
        }, 0);
        return sum + saleCost;
      }, 0);

      // 5. LUCRO BRUTO
      const grossProfit = netRevenue - cogs;

      // 6. DESPESAS OPERACIONAIS - Contas a pagar pagas no período
      const paidExpenses = await prisma.accountPayable.findMany({
        where: {
          companyId,
          status: "PAID",
          paidDate: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      });

      const operatingExpenses = paidExpenses.reduce((sum, expense) => {
        return sum + Number(expense.amount);
      }, 0);

      // 7. EBITDA (Lucro antes de juros, impostos, depreciação e amortização)
      const ebitda = grossProfit - operatingExpenses;

      // 8. RESULTADO FINANCEIRO - Diferença entre receitas e despesas financeiras
      // Considerando taxas de cartão e outras taxas financeiras
      const financialExpenses = sales.reduce((sum, sale) => {
        // Simulação de despesas financeiras (pode ser ajustado conforme necessidade)
        const cardSales = Number(sale.total);
        const estimatedFees = cardSales * 0.03; // 3% de taxa média
        return sum + estimatedFees;
      }, 0);

      const financialResult = -financialExpenses;

      // 9. LUCRO LÍQUIDO
      const netProfit = ebitda + financialResult;

      // 10. MARGENS
      const grossMargin = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
      const netMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

      monthlyData.push({
        month: format(month, "MMM/yyyy"),
        grossRevenue,
        deductions,
        netRevenue,
        cogs,
        grossProfit,
        operatingExpenses,
        ebitda,
        financialResult,
        netProfit,
        grossMargin,
        netMargin,
      });
    }

    // Consolidado do período
    const consolidated = {
      grossRevenue: monthlyData.reduce((sum, m) => sum + m.grossRevenue, 0),
      deductions: monthlyData.reduce((sum, m) => sum + m.deductions, 0),
      netRevenue: monthlyData.reduce((sum, m) => sum + m.netRevenue, 0),
      cogs: monthlyData.reduce((sum, m) => sum + m.cogs, 0),
      grossProfit: monthlyData.reduce((sum, m) => sum + m.grossProfit, 0),
      operatingExpenses: monthlyData.reduce((sum, m) => sum + m.operatingExpenses, 0),
      ebitda: monthlyData.reduce((sum, m) => sum + m.ebitda, 0),
      financialResult: monthlyData.reduce((sum, m) => sum + m.financialResult, 0),
      netProfit: monthlyData.reduce((sum, m) => sum + m.netProfit, 0),
      grossMargin: 0,
      netMargin: 0,
    };

    consolidated.grossMargin = consolidated.grossRevenue > 0
      ? (consolidated.grossProfit / consolidated.grossRevenue) * 100
      : 0;
    consolidated.netMargin = consolidated.grossRevenue > 0
      ? (consolidated.netProfit / consolidated.grossRevenue) * 100
      : 0;

    return {
      consolidated,
      monthly: monthlyData,
    };
  }
}
