import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, eachMonthOfInterval, format } from "date-fns";
import { realizedRevenueSaleStatusFilter } from "./realized-revenue";

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

      // 1. RECEITA BRUTA - Total de vendas REALIZADAS do período.
      // C1 (Bloco 3): antes filtrava `status: { not: "CANCELED" }`, o que
      // deixava passar vendas REFUNDED (devolvidas) e inflava receita + CMV.
      // Agora usa o filtro compartilhado `realizedRevenueSaleStatusFilter`
      // (= COMPLETED), a MESMA noção de receita realizada que o DRE dinâmico
      // (ledger) aplica — os dois relatórios passam a bater. Ver
      // realized-revenue.ts.
      const sales = await prisma.sale.findMany({
        where: {
          companyId,
          status: realizedRevenueSaleStatusFilter,
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

      // 8. RESULTADO FINANCEIRO - Despesas financeiras (taxas de cartão).
      // A8: antes aplicava 3% fixo sobre TODAS as vendas (errado: vendas em
      // dinheiro/PIX não têm taxa, e a taxa real varia). Agora lê a taxa REAL
      // do ledger (FinanceEntry CARD_FEE) — mesma fonte do DRE dinâmico, então
      // os dois relatórios passam a bater.
      const cardFeeAgg = await prisma.financeEntry.aggregate({
        where: {
          companyId,
          type: "CARD_FEE",
          side: "DEBIT",
          entryDate: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amount: true },
      });
      const financialExpenses = Number(cardFeeAgg._sum.amount || 0);

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
