import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface DRELine {
  code: string;
  name: string;
  amount: number;
  children?: DRELine[];
}

interface DREReport {
  period: { start: string; end: string };
  lines: DRELine[];
  summary: {
    grossRevenue: number;
    deductions: number;
    netRevenue: number;
    cogs: number;
    grossMargin: number;
    expenses: number;
    netProfit: number;
  };
}

/**
 * Gera DRE dinâmica a partir dos lançamentos financeiros (FinanceEntry).
 */
export async function getDynamicDRE(
  companyId: string,
  startDate: Date,
  endDate: Date,
  branchId?: string
): Promise<DREReport> {
  const where: Prisma.FinanceEntryWhereInput = {
    companyId,
    entryDate: { gte: startDate, lte: endDate },
    ...(branchId ? { branchId } : {}),
  };

  // Buscar totais por tipo
  const entries = await prisma.financeEntry.groupBy({
    by: ["type", "side"],
    where,
    _sum: { amount: true },
  });

  const getTotal = (type: string, side?: string): number => {
    return entries
      .filter((e) => e.type === type && (!side || e.side === side))
      .reduce((sum, e) => sum + Number(e._sum.amount || 0), 0);
  };

  const grossRevenue = getTotal("SALE_REVENUE", "DEBIT");
  const discounts = getTotal("SALE_REVENUE", "CREDIT");
  const refunds = getTotal("REFUND", "DEBIT");
  const deductions = discounts + refunds;
  const netRevenue = grossRevenue - deductions;

  const cogs = getTotal("COGS", "DEBIT") - getTotal("COGS", "CREDIT");
  const grossMargin = netRevenue - cogs;

  const cardFees = getTotal("CARD_FEE", "DEBIT");
  const commissions = getTotal("COMMISSION_EXPENSE", "DEBIT");
  const otherExpenses = getTotal("EXPENSE", "DEBIT");
  const totalExpenses = cardFees + commissions + otherExpenses;

  const netProfit = grossMargin - totalExpenses;

  // Buscar detalhe por conta contábil para CMV
  const cmvDetail = await prisma.financeEntry.groupBy({
    by: ["debitAccountId"],
    where: {
      ...where,
      type: "COGS",
      side: "DEBIT",
      debitAccountId: { not: null },
    },
    _sum: { amount: true },
  });

  const cmvAccountIds = cmvDetail.map((d) => d.debitAccountId).filter(Boolean) as string[];
  const cmvAccounts = await prisma.chartOfAccounts.findMany({
    where: {
      id: { in: cmvAccountIds },
      companyId,
    },
    select: { id: true, code: true, name: true },
  });

  const cmvChildren: DRELine[] = cmvDetail.map((d) => {
    const account = cmvAccounts.find((a) => a.id === d.debitAccountId);
    return {
      code: account?.code || "",
      name: account?.name || "Outros",
      amount: Number(d._sum.amount || 0),
    };
  });

  return {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    lines: [
      {
        code: "3",
        name: "Receita Bruta",
        amount: grossRevenue,
        children: [
          { code: "3.1.01", name: "Receita de Vendas", amount: grossRevenue },
        ],
      },
      {
        code: "3.2",
        name: "(-) Deduções",
        amount: -deductions,
        children: [
          { code: "3.2.01", name: "Devoluções e Estornos", amount: -refunds },
          { code: "3.2.02", name: "Descontos Concedidos", amount: -discounts },
        ],
      },
      { code: "RL", name: "= Receita Líquida", amount: netRevenue },
      {
        code: "4",
        name: "(-) CMV",
        amount: -cogs,
        children: cmvChildren.map((c) => ({ ...c, amount: -c.amount })),
      },
      { code: "MB", name: "= Margem Bruta", amount: grossMargin },
      {
        code: "5",
        name: "(-) Despesas Operacionais",
        amount: -totalExpenses,
        children: [
          { code: "5.1.01", name: "Taxas de Cartão", amount: -cardFees },
          { code: "5.1.02", name: "Comissões", amount: -commissions },
          { code: "5.1.xx", name: "Outras Despesas", amount: -otherExpenses },
        ],
      },
      { code: "LL", name: "= Lucro Líquido", amount: netProfit },
    ],
    summary: {
      grossRevenue,
      deductions,
      netRevenue,
      cogs,
      grossMargin,
      expenses: totalExpenses,
      netProfit,
    },
  };
}

interface CashFlowEntry {
  date: string;
  inflows: number;
  outflows: number;
  net: number;
  balance: number;
}

/**
 * Fluxo de caixa: entradas vs saídas por dia.
 */
export async function getCashFlow(
  companyId: string,
  startDate: Date,
  endDate: Date,
  branchId?: string,
  financeAccountId?: string
): Promise<CashFlowEntry[]> {
  const where: Prisma.FinanceEntryWhereInput = {
    companyId,
    cashDate: { not: null, gte: startDate, lte: endDate },
    ...(branchId ? { branchId } : {}),
    ...(financeAccountId ? { financeAccountId } : {}),
  };

  const entries = await prisma.financeEntry.findMany({
    where,
    select: {
      cashDate: true,
      type: true,
      side: true,
      amount: true,
    },
    orderBy: { cashDate: "asc" },
  });

  // Agrupar por data de caixa
  const byDate = new Map<string, { inflows: number; outflows: number }>();

  for (const entry of entries) {
    const dateKey = entry.cashDate!.toISOString().split("T")[0];
    const current = byDate.get(dateKey) || { inflows: 0, outflows: 0 };
    const amount = Number(entry.amount);

    // Receita/Pagamentos recebidos = inflow
    if (
      entry.type === "PAYMENT_RECEIVED" ||
      entry.type === "SALE_REVENUE"
    ) {
      if (entry.side === "DEBIT") current.inflows += amount;
    }

    // Despesas/CMV/Taxas/Devoluções = outflow
    if (
      entry.type === "EXPENSE" ||
      entry.type === "COGS" ||
      entry.type === "CARD_FEE" ||
      entry.type === "COMMISSION_EXPENSE" ||
      entry.type === "REFUND"
    ) {
      if (entry.side === "DEBIT") current.outflows += amount;
    }

    byDate.set(dateKey, current);
  }

  // Construir array com saldo acumulado
  let balance = 0;
  const result: CashFlowEntry[] = [];

  const sortedDates = [...byDate.keys()].sort();
  for (const date of sortedDates) {
    const { inflows, outflows } = byDate.get(date)!;
    const net = inflows - outflows;
    balance += net;
    result.push({
      date,
      inflows: Math.round(inflows * 100) / 100,
      outflows: Math.round(outflows * 100) / 100,
      net: Math.round(net * 100) / 100,
      balance: Math.round(balance * 100) / 100,
    });
  }

  return result;
}

/**
 * Dashboard financeiro com métricas principais.
 */
export async function getFinanceDashboard(
  companyId: string,
  startDate: Date,
  endDate: Date,
  branchId?: string
) {
  const where: Prisma.FinanceEntryWhereInput = {
    companyId,
    entryDate: { gte: startDate, lte: endDate },
    ...(branchId ? { branchId } : {}),
  };

  // Totais por tipo
  const totals = await prisma.financeEntry.groupBy({
    by: ["type", "side"],
    where,
    _sum: { amount: true },
  });

  const getTotal = (type: string, side?: string): number =>
    totals
      .filter((t) => t.type === type && (!side || t.side === side))
      .reduce((sum, t) => sum + Number(t._sum.amount || 0), 0);

  const grossRevenue = getTotal("SALE_REVENUE", "DEBIT");
  const discounts = getTotal("SALE_REVENUE", "CREDIT");
  const netRevenue = grossRevenue - discounts;
  const cogs = getTotal("COGS", "DEBIT") - getTotal("COGS", "CREDIT");
  const grossMargin = netRevenue - cogs;
  const cardFees = getTotal("CARD_FEE", "DEBIT");
  const commissions = getTotal("COMMISSION_EXPENSE", "DEBIT");
  const expenses = getTotal("EXPENSE", "DEBIT");
  const refunds = getTotal("REFUND", "DEBIT");

  // Contagem de vendas
  const salesCount = await prisma.sale.count({
    where: {
      companyId,
      status: "COMPLETED",
      completedAt: { gte: startDate, lte: endDate },
      ...(branchId ? { branchId } : {}),
    },
  });

  const avgTicket = salesCount > 0 ? netRevenue / salesCount : 0;

  // Top sellers
  const topSellers = await prisma.sale.groupBy({
    by: ["sellerUserId"],
    where: {
      companyId,
      status: "COMPLETED",
      completedAt: { gte: startDate, lte: endDate },
      ...(branchId ? { branchId } : {}),
    },
    _sum: { total: true },
    _count: true,
    orderBy: { _sum: { total: "desc" } },
    take: 5,
  });

  const sellerIds = topSellers.map((s) => s.sellerUserId);
  const sellers = await prisma.user.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, name: true },
  });

  const topSellersData = topSellers.map((s) => ({
    userId: s.sellerUserId,
    name: sellers.find((u) => u.id === s.sellerUserId)?.name || "Desconhecido",
    totalSales: Number(s._sum.total || 0),
    salesCount: s._count,
  }));

  // Saldos das contas financeiras
  const accountBalances = await prisma.financeAccount.findMany({
    where: { companyId, active: true },
    select: { id: true, name: true, type: true, balance: true },
  });

  return {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    metrics: {
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      discounts: Math.round(discounts * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      cogs: Math.round(cogs * 100) / 100,
      grossMargin: Math.round(grossMargin * 100) / 100,
      grossMarginPercent: netRevenue > 0 ? Math.round((grossMargin / netRevenue) * 10000) / 100 : 0,
      cardFees: Math.round(cardFees * 100) / 100,
      commissions: Math.round(commissions * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      refunds: Math.round(refunds * 100) / 100,
      netProfit: Math.round((grossMargin - cardFees - commissions - expenses) * 100) / 100,
      salesCount,
      avgTicket: Math.round(avgTicket * 100) / 100,
    },
    topSellers: topSellersData,
    accountBalances: accountBalances.map((a) => ({
      ...a,
      balance: Number(a.balance),
    })),
  };
}
