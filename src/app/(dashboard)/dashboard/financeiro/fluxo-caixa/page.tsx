"use client";

import { useState, useEffect, useMemo } from "react";
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
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Wallet,
  Loader2,
  ArrowLeft,
  CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency, cn } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface CashFlowEntry {
  date: string;
  inflows: number;
  outflows: number;
  net: number;
  balance: number;
}

interface FinanceAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
}

interface Branch {
  id: string;
  name: string;
}

function FluxoCaixaPageContent() {
  const [data, setData] = useState<CashFlowEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // Filters
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [startDate, setStartDate] = useState<Date>(thirtyDaysAgo);
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [selectedAccountId, setSelectedAccountId] = useState<string>("ALL");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("ALL");

  // Load accounts and branches on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [accountsRes, branchesRes] = await Promise.all([
          fetch("/api/finance/accounts"),
          fetch("/api/branches?status=ativos&pageSize=100"),
        ]);

        if (accountsRes.ok) {
          const accountsData = await accountsRes.json();
          setAccounts(accountsData.data || []);
        }

        if (branchesRes.ok) {
          const branchesData = await branchesRes.json();
          setBranches(branchesData.data || []);
        }
      } catch (error) {
        console.error("Erro ao carregar filtros:", error);
      }
    };

    loadFilters();
  }, []);

  // KPI calculations
  const kpis = useMemo(() => {
    if (data.length === 0) {
      return { totalInflows: 0, totalOutflows: 0, finalBalance: 0 };
    }

    const totalInflows = data.reduce((sum, entry) => sum + entry.inflows, 0);
    const totalOutflows = data.reduce((sum, entry) => sum + entry.outflows, 0);
    const finalBalance = data[data.length - 1].balance;

    return { totalInflows, totalOutflows, finalBalance };
  }, [data]);

  // Chart data with formatted date labels
  const chartData = useMemo(() => {
    return data.map((entry) => ({
      ...entry,
      dateLabel: format(new Date(entry.date + "T12:00:00"), "dd/MM"),
    }));
  }, [data]);

  // Totals row for table
  const totals = useMemo(() => {
    const totalInflows = data.reduce((sum, e) => sum + e.inflows, 0);
    const totalOutflows = data.reduce((sum, e) => sum + e.outflows, 0);
    const totalNet = data.reduce((sum, e) => sum + e.net, 0);
    return { totalInflows, totalOutflows, totalNet };
  }, [data]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
      });

      if (selectedAccountId && selectedAccountId !== "ALL") {
        params.set("financeAccountId", selectedAccountId);
      }
      if (selectedBranchId && selectedBranchId !== "ALL") {
        params.set("branchId", selectedBranchId);
      }

      const res = await fetch(`/api/finance/reports/cash-flow?${params}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || error.error || "Erro ao gerar fluxo de caixa");
      }

      const reportData = await res.json();
      setData(reportData.data || reportData);
      toast.success("Fluxo de caixa gerado com sucesso!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!data || data.length === 0) return;
    const { exportToPDF } = await import("@/lib/report-export");
    await exportToPDF({
      title: "Fluxo de Caixa",
      subtitle: "Movimentacao financeira no periodo",
      period: { start: startDate, end: endDate },
      sections: [
        {
          title: "Fluxo de Caixa Diario",
          columns: [
            { header: "Data", key: "date", format: "text" },
            { header: "Entradas", key: "inflows", format: "currency" },
            { header: "Saidas", key: "outflows", format: "currency" },
            { header: "Saldo Dia", key: "net", format: "currency" },
            { header: "Acumulado", key: "balance", format: "currency" },
          ],
          data: data.map((entry) => ({
            date: format(new Date(entry.date + "T12:00:00"), "dd/MM/yyyy"),
            inflows: entry.inflows,
            outflows: entry.outflows,
            net: entry.net,
            balance: entry.balance,
          })),
        },
      ],
    });
  };

  const handleExportExcel = async () => {
    if (!data || data.length === 0) return;
    const { exportToExcel } = await import("@/lib/report-export");
    await exportToExcel({
      fileName: `fluxo-caixa-${format(startDate, "yyyy-MM-dd")}-a-${format(endDate, "yyyy-MM-dd")}.xlsx`,
      sheets: [
        {
          name: "Fluxo de Caixa",
          data: [
            ["Data", "Entradas (R$)", "Saidas (R$)", "Saldo Dia (R$)", "Acumulado (R$)"],
            ...data.map((entry) => [
              format(new Date(entry.date + "T12:00:00"), "dd/MM/yyyy"),
              entry.inflows,
              entry.outflows,
              entry.net,
              entry.balance,
            ]),
            [],
            [
              "TOTAL",
              totals.totalInflows,
              totals.totalOutflows,
              totals.totalNet,
              data.length > 0 ? data[data.length - 1].balance : 0,
            ],
          ],
        },
      ],
    });
  };

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div className="rounded-lg border bg-background p-3 shadow-md">
        <p className="mb-2 font-semibold">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/financeiro">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Fluxo de Caixa</h1>
          <p className="text-muted-foreground">
            Acompanhe entradas, saidas e saldo acumulado
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Start date */}
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

            {/* End date */}
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

            {/* Account select */}
            <div className="space-y-2">
              <Label>Conta Financeira</Label>
              <Select
                value={selectedAccountId}
                onValueChange={setSelectedAccountId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as contas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as contas</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Branch select */}
            <div className="space-y-2">
              <Label>Filial</Label>
              <Select
                value={selectedBranchId}
                onValueChange={setSelectedBranchId}
              >
                <SelectTrigger>
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

          <div className="mt-4">
            <Button onClick={fetchReport} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gerar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Results */}
      {!loading && data.length > 0 && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <KPICard
              title="Total Entradas"
              value={formatCurrency(kpis.totalInflows)}
              icon={ArrowUpCircle}
              subtitle="No periodo selecionado"
              className="border-l-4 border-l-green-500"
            />
            <KPICard
              title="Total Saidas"
              value={formatCurrency(kpis.totalOutflows)}
              icon={ArrowDownCircle}
              subtitle="No periodo selecionado"
              className="border-l-4 border-l-red-500"
            />
            <KPICard
              title="Saldo Liquido"
              value={formatCurrency(kpis.finalBalance)}
              icon={Wallet}
              subtitle="Saldo acumulado final"
              className={cn(
                "border-l-4",
                kpis.finalBalance >= 0
                  ? "border-l-blue-500"
                  : "border-l-red-500"
              )}
            />
          </div>

          {/* Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Fluxo de Caixa - Grafico</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dateLabel" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar
                    dataKey="inflows"
                    name="Entradas"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="outflows"
                    name="Saidas"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    name="Saldo Acumulado"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Detalhamento Diario</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Data</th>
                      <th className="text-right p-2">Entradas</th>
                      <th className="text-right p-2">Saidas</th>
                      <th className="text-right p-2">Saldo Dia</th>
                      <th className="text-right p-2">Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((entry, index) => (
                      <tr key={entry.date} className="border-b hover:bg-muted/50">
                        <td className="p-2">
                          {format(new Date(entry.date + "T12:00:00"), "dd/MM/yyyy")}
                        </td>
                        <td className="text-right p-2 text-green-600">
                          {formatCurrency(entry.inflows)}
                        </td>
                        <td className="text-right p-2 text-red-600">
                          {formatCurrency(entry.outflows)}
                        </td>
                        <td
                          className={cn(
                            "text-right p-2",
                            entry.net >= 0 ? "text-green-600" : "text-red-600"
                          )}
                        >
                          {formatCurrency(entry.net)}
                        </td>
                        <td
                          className={cn(
                            "text-right p-2",
                            entry.balance >= 0 ? "text-blue-600" : "text-red-600"
                          )}
                        >
                          {formatCurrency(entry.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td className="p-2">TOTAL</td>
                      <td className="text-right p-2 text-green-600">
                        {formatCurrency(totals.totalInflows)}
                      </td>
                      <td className="text-right p-2 text-red-600">
                        {formatCurrency(totals.totalOutflows)}
                      </td>
                      <td
                        className={cn(
                          "text-right p-2",
                          totals.totalNet >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        )}
                      >
                        {formatCurrency(totals.totalNet)}
                      </td>
                      <td
                        className={cn(
                          "text-right p-2",
                          kpis.finalBalance >= 0
                            ? "text-blue-600"
                            : "text-red-600"
                        )}
                      >
                        {formatCurrency(kpis.finalBalance)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Export Buttons */}
          <div className="flex justify-end">
            <ExportButtons
              onExportPDF={handleExportPDF}
              onExportExcel={handleExportExcel}
              disabled={data.length === 0}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function FluxoCaixaPage() {
  return (
    <ProtectedRoute permission="financial.view">
      <FluxoCaixaPageContent />
    </ProtectedRoute>
  );
}
