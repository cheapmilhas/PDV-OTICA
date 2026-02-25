"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KPICard } from "@/components/reports/kpi-card";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  Loader2,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  BarChart3,
  Activity,
  Wallet,
} from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ZAxis,
} from "recharts";

// ============================================================
// Types
// ============================================================

interface DRESummary {
  grossRevenue: number;
  deductions: number;
  netRevenue: number;
  cogs: number;
  grossMargin: number;
  expenses: number;
  netProfit: number;
}

interface DREReport {
  period: { start: string; end: string };
  lines: any[];
  summary: DRESummary;
}

interface DashboardMetrics {
  grossRevenue: number;
  discounts: number;
  netRevenue: number;
  cogs: number;
  grossMargin: number;
  grossMarginPercent: number;
  cardFees: number;
  commissions: number;
  expenses: number;
  refunds: number;
  netProfit: number;
  salesCount: number;
  avgTicket: number;
}

interface DashboardResponse {
  period: { start: string; end: string };
  metrics: DashboardMetrics;
  topSellers: any[];
  accountBalances: any[];
}

interface Receivable {
  id: string;
  amount: number;
  dueDate: string;
  status: string;
  description: string;
}

interface Payable {
  id: string;
  amount: number;
  dueDate: string;
  status: string;
  description: string;
}

interface ComparativoRow {
  metric: string;
  current: number;
  previous: number;
  variation: number;
  isCurrency: boolean;
}

interface MonthlyEvolution {
  month: string;
  monthLabel: string;
  netRevenue: number;
  cogs: number;
  netProfit: number;
  grossMarginPercent: number;
  grossMargin: number;
  expenses: number;
  salesCount: number;
  avgTicket: number;
}

interface CashFlowBucket {
  period: string;
  inflows: number;
  outflows: number;
  balance: number;
}

interface ProductProfitability {
  name: string;
  revenue: number;
  qty: number;
  count: number;
  cost: number;
  margin: number;
  marginPercent: number;
}

// ============================================================
// Helpers
// ============================================================

function calcVariation(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function getMonthLabel(date: Date): string {
  return format(date, "MMM/yy", { locale: ptBR });
}

// ============================================================
// Tab 1: Comparativo Mensal
// ============================================================

function TabComparativoMensal() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ComparativoRow[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [currentDash, setCurrentDash] = useState<DashboardMetrics | null>(null);
  const [previousDash, setPreviousDash] = useState<DashboardMetrics | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const currentStart = format(startOfMonth(now), "yyyy-MM-dd");
      const currentEnd = format(endOfMonth(now), "yyyy-MM-dd");
      const prevMonth = subMonths(now, 1);
      const previousStart = format(startOfMonth(prevMonth), "yyyy-MM-dd");
      const previousEnd = format(endOfMonth(prevMonth), "yyyy-MM-dd");

      const [currentRes, previousRes] = await Promise.all([
        fetch(`/api/finance/reports/dre?startDate=${currentStart}&endDate=${currentEnd}`),
        fetch(`/api/finance/reports/dre?startDate=${previousStart}&endDate=${previousEnd}`),
      ]);

      if (!currentRes.ok || !previousRes.ok) {
        throw new Error("Erro ao buscar dados do DRE");
      }

      const currentDre: DREReport = await currentRes.json();
      const previousDre: DREReport = await previousRes.json();

      // Also fetch dashboard data for salesCount and avgTicket
      const [curDashRes, prevDashRes] = await Promise.all([
        fetch(`/api/finance/dashboard?startDate=${currentStart}&endDate=${currentEnd}`),
        fetch(`/api/finance/dashboard?startDate=${previousStart}&endDate=${previousEnd}`),
      ]);

      let curDash: DashboardMetrics | null = null;
      let prevDash: DashboardMetrics | null = null;

      if (curDashRes.ok && prevDashRes.ok) {
        const curDashData: DashboardResponse = await curDashRes.json();
        const prevDashData: DashboardResponse = await prevDashRes.json();
        curDash = curDashData.metrics;
        prevDash = prevDashData.metrics;
        setCurrentDash(curDash);
        setPreviousDash(prevDash);
      }

      const cs = currentDre.summary;
      const ps = previousDre.summary;

      const comparativoRows: ComparativoRow[] = [
        { metric: "Receita Liquida", current: cs.netRevenue, previous: ps.netRevenue, variation: calcVariation(cs.netRevenue, ps.netRevenue), isCurrency: true },
        { metric: "CMV", current: cs.cogs, previous: ps.cogs, variation: calcVariation(cs.cogs, ps.cogs), isCurrency: true },
        { metric: "Margem Bruta", current: cs.grossMargin, previous: ps.grossMargin, variation: calcVariation(cs.grossMargin, ps.grossMargin), isCurrency: true },
        { metric: "Despesas", current: cs.expenses, previous: ps.expenses, variation: calcVariation(cs.expenses, ps.expenses), isCurrency: true },
        { metric: "Lucro Liquido", current: cs.netProfit, previous: ps.netProfit, variation: calcVariation(cs.netProfit, ps.netProfit), isCurrency: true },
        { metric: "Ticket Medio", current: curDash?.avgTicket ?? 0, previous: prevDash?.avgTicket ?? 0, variation: calcVariation(curDash?.avgTicket ?? 0, prevDash?.avgTicket ?? 0), isCurrency: true },
        { metric: "Vendas", current: curDash?.salesCount ?? 0, previous: prevDash?.salesCount ?? 0, variation: calcVariation(curDash?.salesCount ?? 0, prevDash?.salesCount ?? 0), isCurrency: false },
      ];

      setRows(comparativoRows);

      const chart = comparativoRows.map((r) => ({
        metric: r.metric,
        "Mes Atual": r.current,
        "Mes Anterior": r.previous,
      }));
      setChartData(chart);

      toast.success("Comparativo carregado!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao buscar comparativo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Carregando comparativo...</span>
      </div>
    );
  }

  if (rows.length === 0) return null;

  // Determine if variation is good or bad per metric
  function isPositive(metric: string, variation: number): boolean {
    // For costs/expenses, decrease is good
    if (["CMV", "Despesas"].includes(metric)) {
      return variation < 0;
    }
    return variation > 0;
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      {currentDash && previousDash && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Receita Liquida"
            value={formatCurrency(currentDash.netRevenue)}
            icon={DollarSign}
            trend={{
              value: Math.round(calcVariation(currentDash.netRevenue, previousDash.netRevenue) * 10) / 10,
              isPositive: currentDash.netRevenue >= previousDash.netRevenue,
            }}
            subtitle="vs. mes anterior"
          />
          <KPICard
            title="Lucro Liquido"
            value={formatCurrency(currentDash.netProfit)}
            icon={currentDash.netProfit >= 0 ? TrendingUp : TrendingDown}
            trend={{
              value: Math.round(calcVariation(currentDash.netProfit, previousDash.netProfit) * 10) / 10,
              isPositive: currentDash.netProfit >= previousDash.netProfit,
            }}
            subtitle="vs. mes anterior"
          />
          <KPICard
            title="Vendas"
            value={currentDash.salesCount}
            icon={BarChart3}
            trend={{
              value: Math.round(calcVariation(currentDash.salesCount, previousDash.salesCount) * 10) / 10,
              isPositive: currentDash.salesCount >= previousDash.salesCount,
            }}
            subtitle="vs. mes anterior"
          />
          <KPICard
            title="Ticket Medio"
            value={formatCurrency(currentDash.avgTicket)}
            icon={Activity}
            trend={{
              value: Math.round(calcVariation(currentDash.avgTicket, previousDash.avgTicket) * 10) / 10,
              isPositive: currentDash.avgTicket >= previousDash.avgTicket,
            }}
            subtitle="vs. mes anterior"
          />
        </div>
      )}

      {/* Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Comparativo Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metrica</TableHead>
                <TableHead className="text-right">Mes Atual</TableHead>
                <TableHead className="text-right">Mes Anterior</TableHead>
                <TableHead className="text-right">Variacao (%)</TableHead>
                <TableHead className="text-center">Tendencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const positive = isPositive(row.metric, row.variation);
                return (
                  <TableRow key={row.metric}>
                    <TableCell className="font-medium">{row.metric}</TableCell>
                    <TableCell className="text-right">
                      {row.isCurrency ? formatCurrency(row.current) : row.current}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.isCurrency ? formatCurrency(row.previous) : row.previous}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${positive ? "text-green-600" : "text-red-600"}`}>
                      {row.variation >= 0 ? "+" : ""}
                      {row.variation.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-center">
                      {positive ? (
                        <ArrowUpRight className="h-5 w-5 text-green-600 inline" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-red-600 inline" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Grouped BarChart */}
      <Card>
        <CardHeader>
          <CardTitle>Comparativo Visual</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="Mes Atual" fill="#3b82f6" />
              <Bar dataKey="Mes Anterior" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Tab 2: Evolucao 12 Meses
// ============================================================

function TabEvolucao12Meses() {
  const [loading, setLoading] = useState(false);
  const [monthlyData, setMonthlyData] = useState<MonthlyEvolution[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const months: { start: string; end: string; label: string; month: string }[] = [];

      for (let i = 11; i >= 0; i--) {
        const target = subMonths(now, i);
        const start = startOfMonth(target);
        const end = endOfMonth(target);
        months.push({
          start: format(start, "yyyy-MM-dd"),
          end: format(end, "yyyy-MM-dd"),
          label: getMonthLabel(target),
          month: format(target, "yyyy-MM"),
        });
      }

      // Fetch all 12 months DRE + Dashboard in parallel
      const drePromises = months.map((m) =>
        fetch(`/api/finance/reports/dre?startDate=${m.start}&endDate=${m.end}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      );
      const dashPromises = months.map((m) =>
        fetch(`/api/finance/dashboard?startDate=${m.start}&endDate=${m.end}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      );

      const [dreResults, dashResults] = await Promise.all([
        Promise.all(drePromises),
        Promise.all(dashPromises),
      ]);

      const evolution: MonthlyEvolution[] = months.map((m, idx) => {
        const dre: DREReport | null = dreResults[idx];
        const dash: DashboardResponse | null = dashResults[idx];
        const s = dre?.summary;
        const dm = dash?.metrics;

        const netRevenue = s?.netRevenue ?? 0;
        const cogs = s?.cogs ?? 0;
        const netProfit = s?.netProfit ?? 0;
        const grossMargin = s?.grossMargin ?? 0;
        const expenses = s?.expenses ?? 0;
        const grossMarginPercent = netRevenue > 0 ? (grossMargin / netRevenue) * 100 : 0;

        return {
          month: m.month,
          monthLabel: m.label,
          netRevenue,
          cogs,
          netProfit,
          grossMarginPercent: Math.round(grossMarginPercent * 10) / 10,
          grossMargin,
          expenses,
          salesCount: dm?.salesCount ?? 0,
          avgTicket: dm?.avgTicket ?? 0,
        };
      });

      setMonthlyData(evolution);
      toast.success("Evolucao 12 meses carregada!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao buscar evolucao");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Carregando 12 meses de dados...</span>
      </div>
    );
  }

  if (monthlyData.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* LineChart: Receita, CMV, Lucro */}
      <Card>
        <CardHeader>
          <CardTitle>Receita, CMV e Lucro - Ultimos 12 Meses</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Legend />
              <Line
                type="monotone"
                dataKey="netRevenue"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Receita"
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="cogs"
                stroke="#f59e0b"
                strokeWidth={2}
                name="CMV"
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="netProfit"
                stroke="#10b981"
                strokeWidth={2}
                name="Lucro"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* AreaChart: Margem Bruta % */}
      <Card>
        <CardHeader>
          <CardTitle>Margem Bruta (%) - Ultimos 12 Meses</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
              <YAxis unit="%" />
              <Tooltip formatter={(value: any) => `${Number(value).toFixed(1)}%`} />
              <Legend />
              <Area
                type="monotone"
                dataKey="grossMarginPercent"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.2}
                strokeWidth={2}
                name="Margem Bruta %"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Resumo Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Receita Liq.</TableHead>
                  <TableHead className="text-right">CMV</TableHead>
                  <TableHead className="text-right">Margem Bruta</TableHead>
                  <TableHead className="text-right">Despesas</TableHead>
                  <TableHead className="text-right">Lucro Liq.</TableHead>
                  <TableHead className="text-right">Mg. Bruta %</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Ticket Med.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyData.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {m.monthLabel}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(m.netRevenue)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatCurrency(m.cogs)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(m.grossMargin)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatCurrency(m.expenses)}</TableCell>
                    <TableCell className={`text-right font-semibold ${m.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(m.netProfit)}
                    </TableCell>
                    <TableCell className="text-right">{m.grossMarginPercent.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{m.salesCount}</TableCell>
                    <TableCell className="text-right">{formatCurrency(m.avgTicket)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Tab 3: Projecao Fluxo de Caixa
// ============================================================

function TabProjecaoFluxoCaixa() {
  const [loading, setLoading] = useState(false);
  const [buckets, setBuckets] = useState<CashFlowBucket[]>([]);
  const [dailyProjection, setDailyProjection] = useState<any[]>([]);
  const [totals, setTotals] = useState({ inflows: 0, outflows: 0, balance: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [receivablesRes, payablesRes] = await Promise.all([
        fetch("/api/accounts-receivable?status=PENDING&pageSize=1000"),
        fetch("/api/accounts-payable?status=PENDING&pageSize=1000"),
      ]);

      if (!receivablesRes.ok || !payablesRes.ok) {
        throw new Error("Erro ao buscar contas pendentes");
      }

      const receivablesData = await receivablesRes.json();
      const payablesData = await payablesRes.json();

      const receivables: Receivable[] = receivablesData.data || [];
      const payables: Payable[] = payablesData.data || [];

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Group into 30/60/90 day buckets
      const bucket30 = { inflows: 0, outflows: 0 };
      const bucket60 = { inflows: 0, outflows: 0 };
      const bucket90 = { inflows: 0, outflows: 0 };

      // Daily projection map (for chart)
      const dailyMap = new Map<string, { date: string; inflows: number; outflows: number }>();

      // Initialize 90 days
      for (let d = 0; d <= 90; d++) {
        const date = new Date(today);
        date.setDate(date.getDate() + d);
        const key = format(date, "yyyy-MM-dd");
        dailyMap.set(key, { date: key, inflows: 0, outflows: 0 });
      }

      // Process receivables
      for (const r of receivables) {
        const dueDate = new Date(r.dueDate);
        const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const amount = Number(r.amount) || 0;

        if (diffDays >= 0 && diffDays <= 90) {
          const key = format(dueDate, "yyyy-MM-dd");
          const day = dailyMap.get(key);
          if (day) day.inflows += amount;

          if (diffDays <= 30) bucket30.inflows += amount;
          else if (diffDays <= 60) bucket60.inflows += amount;
          else bucket90.inflows += amount;
        }
      }

      // Process payables
      for (const p of payables) {
        const dueDate = new Date(p.dueDate);
        const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const amount = Number(p.amount) || 0;

        if (diffDays >= 0 && diffDays <= 90) {
          const key = format(dueDate, "yyyy-MM-dd");
          const day = dailyMap.get(key);
          if (day) day.outflows += amount;

          if (diffDays <= 30) bucket30.outflows += amount;
          else if (diffDays <= 60) bucket60.outflows += amount;
          else bucket90.outflows += amount;
        }
      }

      const bucketsData: CashFlowBucket[] = [
        {
          period: "Proximos 30 dias",
          inflows: bucket30.inflows,
          outflows: bucket30.outflows,
          balance: bucket30.inflows - bucket30.outflows,
        },
        {
          period: "31-60 dias",
          inflows: bucket60.inflows,
          outflows: bucket60.outflows,
          balance: bucket60.inflows - bucket60.outflows,
        },
        {
          period: "61-90 dias",
          inflows: bucket90.inflows,
          outflows: bucket90.outflows,
          balance: bucket90.inflows - bucket90.outflows,
        },
      ];
      setBuckets(bucketsData);

      const totalInflows = bucket30.inflows + bucket60.inflows + bucket90.inflows;
      const totalOutflows = bucket30.outflows + bucket60.outflows + bucket90.outflows;
      setTotals({
        inflows: totalInflows,
        outflows: totalOutflows,
        balance: totalInflows - totalOutflows,
      });

      // Build cumulative daily projection for chart
      let cumulativeBalance = 0;
      const dailyArray = Array.from(dailyMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((day) => {
          cumulativeBalance += day.inflows - day.outflows;
          return {
            date: format(new Date(day.date + "T12:00:00"), "dd/MM", { locale: ptBR }),
            fullDate: day.date,
            inflows: day.inflows,
            outflows: day.outflows,
            saldoAcumulado: Math.round(cumulativeBalance * 100) / 100,
          };
        });

      // Reduce density for chart readability - show every 3rd day
      const filteredDaily = dailyArray.filter((_, idx) => idx % 3 === 0 || idx === dailyArray.length - 1);
      setDailyProjection(filteredDaily);

      toast.success("Projecao de fluxo de caixa carregada!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao buscar projecao");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Carregando projecao de fluxo de caixa...</span>
      </div>
    );
  }

  if (buckets.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <KPICard
          title="Entradas Previstas (90 dias)"
          value={formatCurrency(totals.inflows)}
          icon={TrendingUp}
          subtitle="Contas a receber pendentes"
        />
        <KPICard
          title="Saidas Previstas (90 dias)"
          value={formatCurrency(totals.outflows)}
          icon={TrendingDown}
          subtitle="Contas a pagar pendentes"
        />
        <KPICard
          title="Saldo Projetado"
          value={formatCurrency(totals.balance)}
          icon={Wallet}
          subtitle={totals.balance >= 0 ? "Positivo" : "Negativo"}
          className={totals.balance >= 0 ? "" : "border-red-200"}
        />
      </div>

      {/* LineChart: Projected balance over 90 days */}
      <Card>
        <CardHeader>
          <CardTitle>Saldo Acumulado Projetado - Proximos 90 Dias</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={dailyProjection}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip
                formatter={(value: any, name: any) => [
                  formatCurrency(value),
                  name === "saldoAcumulado" ? "Saldo Acumulado" : name,
                ]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="saldoAcumulado"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Saldo Acumulado"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bucket comparison bar chart */}
      <Card>
        <CardHeader>
          <CardTitle>Entradas vs Saidas por Periodo</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={buckets}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="inflows" fill="#10b981" name="Entradas" />
              <Bar dataKey="outflows" fill="#ef4444" name="Saidas" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bucket Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento por Periodo</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo</TableHead>
                <TableHead className="text-right">Entradas Previstas</TableHead>
                <TableHead className="text-right">Saidas Previstas</TableHead>
                <TableHead className="text-right">Saldo Projetado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buckets.map((b) => (
                <TableRow key={b.period}>
                  <TableCell className="font-medium">{b.period}</TableCell>
                  <TableCell className="text-right text-green-600">
                    {formatCurrency(b.inflows)}
                  </TableCell>
                  <TableCell className="text-right text-red-600">
                    {formatCurrency(b.outflows)}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${b.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(b.balance)}
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals row */}
              <TableRow className="bg-muted/50 font-bold">
                <TableCell className="font-bold">Total (90 dias)</TableCell>
                <TableCell className="text-right text-green-600 font-bold">
                  {formatCurrency(totals.inflows)}
                </TableCell>
                <TableCell className="text-right text-red-600 font-bold">
                  {formatCurrency(totals.outflows)}
                </TableCell>
                <TableCell className={`text-right font-bold ${totals.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(totals.balance)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Tab 4: Rentabilidade por Produto
// ============================================================

function TabRentabilidadeProduto() {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductProfitability[]>([]);
  const [scatterData, setScatterData] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const startDate = format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd");
      const endDate = format(endOfMonth(now), "yyyy-MM-dd");

      const res = await fetch(
        `/api/finance/bi?dimension=productType&startDate=${startDate}&endDate=${endDate}`
      );

      if (!res.ok) {
        throw new Error("Erro ao buscar dados de rentabilidade");
      }

      const result = await res.json();
      const items: any[] = result.data || [];

      // Map product type names to Portuguese
      const typeLabels: Record<string, string> = {
        FRAME: "Armacoes",
        LENS: "Lentes",
        SUNGLASSES: "Oculos de Sol",
        CONTACT_LENS: "Lentes de Contato",
        ACCESSORY: "Acessorios",
        SOLUTION: "Solucoes",
        OTHER: "Outros",
      };

      // For productType dimension, we need to calculate cost if available
      // The BI API for productType returns: { name, revenue, qty, count }
      // We need to also fetch brand/category data which includes cost
      // Let's also fetch by brand to get costs
      const brandRes = await fetch(
        `/api/finance/bi?dimension=brand&startDate=${startDate}&endDate=${endDate}`
      );
      let totalCostRatio = 0.5; // default 50% cost ratio
      if (brandRes.ok) {
        const brandData = await brandRes.json();
        const brandItems: any[] = brandData.data || [];
        const totalRevenue = brandItems.reduce((s: number, b: any) => s + (b.revenue || 0), 0);
        const totalCost = brandItems.reduce((s: number, b: any) => s + (b.cost || 0), 0);
        if (totalRevenue > 0) {
          totalCostRatio = totalCost / totalRevenue;
        }
      }

      const productData: ProductProfitability[] = items.map((item: any) => {
        const revenue = Number(item.revenue) || 0;
        const cost = Number(item.cost) || revenue * totalCostRatio;
        const margin = revenue - cost;
        const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;

        return {
          name: typeLabels[item.name] || item.name,
          revenue,
          qty: item.qty || 0,
          count: item.count || 0,
          cost,
          margin,
          marginPercent: Math.round(marginPercent * 10) / 10,
        };
      });

      setProducts(productData.sort((a, b) => b.revenue - a.revenue));

      // Scatter data: X = quantity, Y = margin %, Z (size) = revenue
      const scatter = productData.map((p) => ({
        name: p.name,
        x: p.qty,
        y: p.marginPercent,
        z: p.revenue,
      }));
      setScatterData(scatter);

      toast.success("Rentabilidade por produto carregada!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao buscar rentabilidade");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Carregando rentabilidade por produto...</span>
      </div>
    );
  }

  if (products.length === 0) return null;

  function getMarginBadge(marginPercent: number) {
    if (marginPercent > 50) {
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Alta</Badge>;
    }
    if (marginPercent >= 30) {
      return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Media</Badge>;
    }
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Baixa</Badge>;
  }

  function getRowClass(marginPercent: number): string {
    if (marginPercent > 50) return "bg-green-50/50";
    if (marginPercent >= 30) return "bg-yellow-50/50";
    return "bg-red-50/50";
  }

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <KPICard
          title="Receita Total"
          value={formatCurrency(products.reduce((s, p) => s + p.revenue, 0))}
          icon={DollarSign}
          subtitle="Todos os tipos de produto"
        />
        <KPICard
          title="Margem Total R$"
          value={formatCurrency(products.reduce((s, p) => s + p.margin, 0))}
          icon={TrendingUp}
          subtitle="Lucro bruto por tipo"
        />
        <KPICard
          title="Itens Vendidos"
          value={products.reduce((s, p) => s + p.qty, 0)}
          icon={BarChart3}
          subtitle="Total de unidades"
        />
      </div>

      {/* Profitability Table */}
      <Card>
        <CardHeader>
          <CardTitle>Rentabilidade por Tipo de Produto</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo Produto</TableHead>
                <TableHead className="text-right">Vendas (Qtd)</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">CMV</TableHead>
                <TableHead className="text-right">Margem R$</TableHead>
                <TableHead className="text-right">Margem %</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.name} className={getRowClass(p.marginPercent)}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right">{p.qty}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.revenue)}</TableCell>
                  <TableCell className="text-right text-red-600">{formatCurrency(p.cost)}</TableCell>
                  <TableCell className="text-right text-green-600 font-semibold">
                    {formatCurrency(p.margin)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {p.marginPercent.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-center">{getMarginBadge(p.marginPercent)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ScatterChart: X = quantity, Y = margin %, bubble size = revenue */}
      <Card>
        <CardHeader>
          <CardTitle>Mapa de Rentabilidade</CardTitle>
          <p className="text-sm text-muted-foreground">
            Eixo X: Quantidade vendida | Eixo Y: Margem (%) | Tamanho: Receita
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                name="Quantidade"
                tick={{ fontSize: 12 }}
                label={{ value: "Quantidade Vendida", position: "insideBottom", offset: -5 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Margem %"
                unit="%"
                tick={{ fontSize: 12 }}
                label={{ value: "Margem (%)", angle: -90, position: "insideLeft" }}
              />
              <ZAxis
                type="number"
                dataKey="z"
                range={[100, 1000]}
                name="Receita"
              />
              <Tooltip
                formatter={(value: any, name: any) => {
                  if (name === "Receita") return formatCurrency(value);
                  if (name === "Margem %") return `${Number(value).toFixed(1)}%`;
                  return value;
                }}
                labelFormatter={() => ""}
                content={({ active, payload }) => {
                  if (active && payload && payload.length > 0) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
                        <p className="font-semibold">{data.name}</p>
                        <p>Quantidade: {data.x}</p>
                        <p>Margem: {data.y.toFixed(1)}%</p>
                        <p>Receita: {formatCurrency(data.z)}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter
                data={scatterData}
                fill="#8b5cf6"
                fillOpacity={0.7}
                stroke="#8b5cf6"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Margin BarChart */}
      <Card>
        <CardHeader>
          <CardTitle>Margem por Tipo de Produto</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={products}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="revenue" fill="#3b82f6" name="Receita" />
              <Bar dataKey="cost" fill="#ef4444" name="CMV" />
              <Bar dataKey="margin" fill="#10b981" name="Margem" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

function RelatoriosAvancadosContent() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/relatorios">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Relatorios Avancados</h1>
          <p className="text-muted-foreground">
            Analises comparativas, evolucao, projecoes e rentabilidade
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="comparativo" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
          <TabsTrigger value="comparativo">Comparativo Mensal</TabsTrigger>
          <TabsTrigger value="evolucao">Evolucao 12 Meses</TabsTrigger>
          <TabsTrigger value="projecao">Projecao Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="rentabilidade">Rentabilidade por Produto</TabsTrigger>
        </TabsList>

        <TabsContent value="comparativo">
          <TabComparativoMensal />
        </TabsContent>

        <TabsContent value="evolucao">
          <TabEvolucao12Meses />
        </TabsContent>

        <TabsContent value="projecao">
          <TabProjecaoFluxoCaixa />
        </TabsContent>

        <TabsContent value="rentabilidade">
          <TabRentabilidadeProduto />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function RelatoriosAvancadosPage() {
  return (
    <ProtectedRoute permission="reports.financial">
      <RelatoriosAvancadosContent />
    </ProtectedRoute>
  );
}
