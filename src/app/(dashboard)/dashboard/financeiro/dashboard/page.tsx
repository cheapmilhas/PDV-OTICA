"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { KPICard } from "@/components/reports/kpi-card";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Package,
  CreditCard,
  Clock,
  AlertTriangle,
  Loader2,
  CalendarIcon,
  RefreshCw,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// --- Types ---

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

interface TopSeller {
  userId: string;
  name: string;
  totalSales: number;
  salesCount: number;
}

interface AccountBalance {
  id: string;
  name: string;
  type: string;
  balance: number;
}

interface DashboardData {
  period: { start: string; end: string };
  metrics: DashboardMetrics;
  topSellers: TopSeller[];
  accountBalances: AccountBalance[];
}

interface Branch {
  id: string;
  name: string;
}

// --- Color palette ---

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // yellow
  "#ef4444", // red
  "#8b5cf6", // purple
  "#06b6d4", // cyan
];

// --- Custom Tooltip for currency ---

function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="mb-1 text-sm font-medium">{label}</p>
      {payload.map((entry: any, index: number) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-medium">{entry.name}</p>
      <p className="text-sm" style={{ color: entry.payload.fill }}>
        {formatCurrency(entry.value)}
      </p>
    </div>
  );
}

// --- Main Content ---

function DashboardFinanceiroContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Receivable summary
  const [pendingReceivable, setPendingReceivable] = useState<number | null>(null);
  const [overdueReceivable, setOverdueReceivable] = useState<number | null>(null);

  // Filters
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [branchId, setBranchId] = useState<string>("ALL");
  const [branches, setBranches] = useState<Branch[]>([]);

  // Fetch branches on mount
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const res = await fetch("/api/branches?status=ativos&pageSize=100");
        if (res.ok) {
          const json = await res.json();
          setBranches(json.data || []);
        }
      } catch {
        // silently ignore
      }
    };
    loadBranches();
  }, []);

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
      });
      if (branchId && branchId !== "ALL") {
        params.set("branchId", branchId);
      }

      const res = await fetch(`/api/finance/dashboard?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || err.message || "Erro ao carregar dashboard");
      }

      const json = await res.json();
      setData(json.data || json);
    } catch (error: any) {
      toast.error(error.message || "Erro ao carregar dashboard financeiro");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, branchId]);

  // Fetch receivable summaries
  const fetchReceivableSummaries = useCallback(async () => {
    try {
      const [pendingRes, overdueRes] = await Promise.all([
        fetch("/api/accounts-receivable?status=PENDING&pageSize=1"),
        fetch("/api/accounts-receivable?status=OVERDUE&pageSize=1"),
      ]);

      if (pendingRes.ok) {
        const json = await pendingRes.json();
        setPendingReceivable(json.pagination?.total ?? null);
      }

      if (overdueRes.ok) {
        const json = await overdueRes.json();
        setOverdueReceivable(json.pagination?.total ?? null);
      }
    } catch {
      // silently ignore
    }
  }, []);

  // Auto-fetch on mount and filter changes
  useEffect(() => {
    fetchDashboard();
    fetchReceivableSummaries();
  }, [fetchDashboard, fetchReceivableSummaries]);

  // --- Chart Data ---

  const revenueVsProfitData = data
    ? [
        {
          name: "Receita Bruta",
          valor: data.metrics.grossRevenue,
        },
        {
          name: "Receita Liq.",
          valor: data.metrics.netRevenue,
        },
        {
          name: "Margem Bruta",
          valor: data.metrics.grossMargin,
        },
        {
          name: "Lucro Liq.",
          valor: data.metrics.netProfit,
        },
      ]
    : [];

  const accountBalancesData = data
    ? data.accountBalances
        .filter((a) => a.balance > 0)
        .map((a, i) => ({
          name: a.name,
          value: a.balance,
          fill: COLORS[i % COLORS.length],
        }))
    : [];

  const topSellersData = data
    ? data.topSellers.slice(0, 5).map((s) => ({
        name: s.name.length > 15 ? s.name.substring(0, 15) + "..." : s.name,
        fullName: s.name,
        vendas: s.totalSales,
        qtd: s.salesCount,
      }))
    : [];

  const costBreakdownData = data
    ? [
        { name: "CMV", valor: data.metrics.cogs, fill: "#ef4444" },
        { name: "Taxas Cartao", valor: data.metrics.cardFees, fill: "#f59e0b" },
        { name: "Comissoes", valor: data.metrics.commissions, fill: "#8b5cf6" },
        { name: "Despesas", valor: data.metrics.expenses, fill: "#06b6d4" },
      ].filter((item) => item.valor > 0)
    : [];

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Financeiro</h1>
          <p className="text-muted-foreground">
            Visao geral das financas do periodo
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchDashboard();
            fetchReceivableSummaries();
          }}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Start Date */}
            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? (
                      format(startDate, "PPP", { locale: ptBR })
                    ) : (
                      <span>Selecione...</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <Label>Data Final</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? (
                      format(endDate, "PPP", { locale: ptBR })
                    ) : (
                      <span>Selecione...</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Branch Select */}
            <div className="space-y-2">
              <Label>Filial</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas as filiais" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as filiais</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Dashboard Content */}
      {!loading && data && (
        <>
          {/* KPI Row 1 */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Receita Liquida"
              value={formatCurrency(data.metrics.netRevenue)}
              icon={DollarSign}
              subtitle={`Bruta: ${formatCurrency(data.metrics.grossRevenue)}`}
            />
            <KPICard
              title="Margem Bruta"
              value={`${data.metrics.grossMarginPercent.toFixed(1)}%`}
              icon={TrendingUp}
              subtitle={formatCurrency(data.metrics.grossMargin)}
            />
            <KPICard
              title="Ticket Medio"
              value={formatCurrency(data.metrics.avgTicket)}
              icon={ShoppingCart}
              subtitle="Por venda"
            />
            <KPICard
              title="Vendas"
              value={data.metrics.salesCount.toString()}
              icon={Package}
              subtitle="No periodo"
            />
          </div>

          {/* KPI Row 2 */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Lucro Liquido"
              value={formatCurrency(data.metrics.netProfit)}
              icon={data.metrics.netProfit >= 0 ? TrendingUp : AlertTriangle}
              subtitle={
                data.metrics.netRevenue > 0
                  ? `${((data.metrics.netProfit / data.metrics.netRevenue) * 100).toFixed(1)}% da receita`
                  : "Sem receita no periodo"
              }
              className={
                data.metrics.netProfit >= 0
                  ? "border-green-200 dark:border-green-900"
                  : "border-red-200 dark:border-red-900"
              }
            />
            <KPICard
              title="Taxas Cartao"
              value={formatCurrency(data.metrics.cardFees)}
              icon={CreditCard}
              subtitle={
                data.metrics.grossRevenue > 0
                  ? `${((data.metrics.cardFees / data.metrics.grossRevenue) * 100).toFixed(1)}% da receita`
                  : "--"
              }
            />
            <KPICard
              title="A Receber Pendente"
              value={
                pendingReceivable !== null
                  ? `${pendingReceivable} contas`
                  : "Ver contas"
              }
              icon={Clock}
              subtitle="Contas a receber pendentes"
            />
            <KPICard
              title="Vencido"
              value={
                overdueReceivable !== null
                  ? `${overdueReceivable} contas`
                  : "Ver contas"
              }
              icon={AlertTriangle}
              subtitle="Contas a receber vencidas"
              className="border-red-200 dark:border-red-900"
            />
          </div>

          {/* Charts - 2x2 grid */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {/* Chart 1: Revenue x Profit comparison */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receita x Lucro</CardTitle>
              </CardHeader>
              <CardContent>
                {revenueVsProfitData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={revenueVsProfitData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip content={<CurrencyTooltip />} />
                      <Bar dataKey="valor" name="Valor" radius={[4, 4, 0, 0]}>
                        {revenueVsProfitData.map((_entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    Sem dados para exibir
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Chart 2: Account Balances Pie */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Saldos por Conta</CardTitle>
              </CardHeader>
              <CardContent>
                {accountBalancesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={accountBalancesData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }: any) =>
                          `${name} (${((percent || 0) * 100).toFixed(0)}%)`
                        }
                        labelLine={false}
                      >
                        {accountBalancesData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    Nenhuma conta com saldo positivo
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Chart 3: Top 5 Sellers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 5 Vendedores</CardTitle>
              </CardHeader>
              <CardContent>
                {topSellersData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topSellersData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" fontSize={12} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        fontSize={12}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0)
                            return null;
                          const item = payload[0].payload;
                          return (
                            <div className="rounded-lg border bg-background p-3 shadow-md">
                              <p className="text-sm font-medium">
                                {item.fullName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Total: {formatCurrency(item.vendas)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Vendas: {item.qtd}
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="vendas"
                        name="Total Vendas"
                        fill="#3b82f6"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    Sem vendedores no periodo
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Chart 4: Cost Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Composicao de Custos</CardTitle>
              </CardHeader>
              <CardContent>
                {costBreakdownData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={costBreakdownData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip content={<CurrencyTooltip />} />
                      <Bar dataKey="valor" name="Valor" radius={[4, 4, 0, 0]}>
                        {costBreakdownData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    Sem custos registrados no periodo
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Sellers Table */}
          {data.topSellers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ranking de Vendedores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2 text-left">#</th>
                        <th className="p-2 text-left">Vendedor</th>
                        <th className="p-2 text-right">Qtd. Vendas</th>
                        <th className="p-2 text-right">Total Vendido</th>
                        <th className="p-2 text-right">Ticket Medio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topSellers.map((seller, index) => (
                        <tr key={seller.userId} className="border-b">
                          <td className="p-2 font-medium">{index + 1}</td>
                          <td className="p-2">{seller.name}</td>
                          <td className="p-2 text-right">{seller.salesCount}</td>
                          <td className="p-2 text-right font-semibold">
                            {formatCurrency(seller.totalSales)}
                          </td>
                          <td className="p-2 text-right text-muted-foreground">
                            {seller.salesCount > 0
                              ? formatCurrency(seller.totalSales / seller.salesCount)
                              : formatCurrency(0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Account Balances Table */}
          {data.accountBalances.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Saldos das Contas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2 text-left">Conta</th>
                        <th className="p-2 text-left">Tipo</th>
                        <th className="p-2 text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.accountBalances.map((account) => (
                        <tr key={account.id} className="border-b">
                          <td className="p-2 font-medium">{account.name}</td>
                          <td className="p-2 text-muted-foreground">
                            {account.type}
                          </td>
                          <td
                            className={`p-2 text-right font-semibold ${
                              account.balance >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {formatCurrency(account.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* No data state */}
      {!loading && !data && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <DollarSign className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">Nenhum dado encontrado</p>
            <p className="text-sm text-muted-foreground">
              Tente ajustar o periodo ou a filial selecionada
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="financial.view">
      <DashboardFinanceiroContent />
    </ProtectedRoute>
  );
}
