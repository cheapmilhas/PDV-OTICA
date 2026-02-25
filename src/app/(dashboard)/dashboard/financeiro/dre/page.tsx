"use client";

import { useState, useEffect, Fragment } from "react";
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
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  DollarSign,
  TrendingUp,
  Percent,
  Loader2,
  ArrowLeft,
  CalendarIcon,
  BarChart3,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency, cn } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Types
interface DRELineChild {
  code: string;
  name: string;
  amount: number;
}

interface DRELine {
  code: string;
  name: string;
  amount: number;
  children?: DRELineChild[];
}

interface DRESummary {
  grossRevenue: number;
  deductions: number;
  netRevenue: number;
  cogs: number;
  grossMargin: number;
  expenses: number;
  netProfit: number;
}

interface DREData {
  period: { start: string; end: string };
  lines: DRELine[];
  summary: DRESummary;
}

interface Branch {
  id: string;
  name: string;
}

// Colors
const COLORS = {
  blue: "#3b82f6",
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
  cyan: "#06b6d4",
};

const PIE_COLORS = [COLORS.red, COLORS.yellow, COLORS.purple, COLORS.cyan];

function getLineColorClass(line: DRELine): string {
  const { code, amount } = line;

  // Summary/profit lines
  if (code === "MB" || code === "LL") {
    return amount >= 0 ? "text-green-600" : "text-red-600";
  }

  // Revenue lines
  if (code.startsWith("3") || code === "RL") {
    return "text-blue-600";
  }

  // Cost lines (CMV)
  if (code.startsWith("4")) {
    return "text-red-600";
  }

  // Expense lines
  if (code.startsWith("5")) {
    return "text-red-600";
  }

  return "";
}

function isSummaryLine(code: string): boolean {
  return ["RL", "MB", "LL"].includes(code);
}

function DREDinamicoPageContent() {
  const [data, setData] = useState<DREData | null>(null);
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("all");

  // Default: first day of current month to today
  const [startDate, setStartDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [endDate, setEndDate] = useState<Date>(new Date());

  // Fetch branches on mount
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const res = await fetch("/api/branches?status=ativos&pageSize=100");
        if (res.ok) {
          const result = await res.json();
          setBranches(result.data || []);
        }
      } catch (error) {
        console.error("Erro ao carregar filiais:", error);
      }
    };
    loadBranches();
  }, []);

  const fetchDRE = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
      });

      if (branchId && branchId !== "all") {
        params.set("branchId", branchId);
      }

      const res = await fetch(`/api/finance/reports/dre?${params}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || error.error || "Erro ao gerar DRE");
      }

      const dreData = await res.json();
      setData(dreData.data || dreData);
      toast.success("DRE gerado com sucesso!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Computed values
  const grossMarginPercent =
    data && data.summary.netRevenue !== 0
      ? ((data.summary.grossMargin / data.summary.netRevenue) * 100).toFixed(1)
      : "0.0";

  const netMarginPercent =
    data && data.summary.netRevenue !== 0
      ? ((data.summary.netProfit / data.summary.netRevenue) * 100).toFixed(1)
      : "0.0";

  // Waterfall chart data
  const waterfallData = data
    ? [
        {
          name: "Receita Bruta",
          value: data.summary.grossRevenue,
          fill: COLORS.blue,
        },
        {
          name: "(-) Deducoes",
          value: -Math.abs(data.summary.deductions),
          fill: COLORS.yellow,
        },
        {
          name: "(-) CMV",
          value: -Math.abs(data.summary.cogs),
          fill: COLORS.red,
        },
        {
          name: "(-) Despesas",
          value: -Math.abs(data.summary.expenses),
          fill: COLORS.purple,
        },
        {
          name: "= Lucro Liq.",
          value: data.summary.netProfit,
          fill: data.summary.netProfit >= 0 ? COLORS.green : COLORS.red,
        },
      ]
    : [];

  // Pie chart data - cost composition
  const pieData = data
    ? [
        { name: "CMV", value: Math.abs(data.summary.cogs) },
        {
          name: "Taxas Cartao",
          value: Math.abs(data.summary.deductions),
        },
        {
          name: "Comissoes",
          value: Math.abs(data.summary.expenses) * 0.4,
        },
        {
          name: "Outras Despesas",
          value: Math.abs(data.summary.expenses) * 0.6,
        },
      ].filter((item) => item.value > 0)
    : [];

  // Export handlers
  const handleExportPDF = async () => {
    if (!data) return;
    const { exportToPDF } = await import("@/lib/report-export");
    await exportToPDF({
      title: "DRE Dinamica (Ledger)",
      subtitle: "Demonstrativo de Resultado do Exercicio",
      period: { start: startDate, end: endDate },
      sections: [
        {
          title: "DRE Detalhado",
          columns: [
            { header: "Conta", key: "name", format: "text" },
            { header: "Valor (R$)", key: "amount", format: "currency" },
            { header: "% Receita Liq.", key: "percent", format: "percent" },
          ],
          data: data.lines.flatMap((line) => {
            const netRev = data.summary.netRevenue || 1;
            const rows = [
              {
                name: `${line.code} - ${line.name}`,
                amount: line.amount,
                percent: ((line.amount / netRev) * 100).toFixed(1),
              },
            ];
            if (line.children) {
              for (const child of line.children) {
                rows.push({
                  name: `    ${child.code} - ${child.name}`,
                  amount: child.amount,
                  percent: ((child.amount / netRev) * 100).toFixed(1),
                });
              }
            }
            return rows;
          }),
        },
      ],
    });
  };

  const handleExportExcel = async () => {
    if (!data) return;
    const { exportToExcel } = await import("@/lib/report-export");
    const netRev = data.summary.netRevenue || 1;

    const sheetData: any[][] = [
      ["Codigo", "Conta", "Valor (R$)", "% Receita Liq."],
    ];

    for (const line of data.lines) {
      sheetData.push([
        line.code,
        line.name,
        line.amount,
        `${((line.amount / netRev) * 100).toFixed(1)}%`,
      ]);
      if (line.children) {
        for (const child of line.children) {
          sheetData.push([
            child.code,
            `  ${child.name}`,
            child.amount,
            `${((child.amount / netRev) * 100).toFixed(1)}%`,
          ]);
        }
      }
    }

    sheetData.push([]);
    sheetData.push(["Resumo"]);
    sheetData.push(["Receita Bruta", data.summary.grossRevenue]);
    sheetData.push(["Deducoes", data.summary.deductions]);
    sheetData.push(["Receita Liquida", data.summary.netRevenue]);
    sheetData.push(["CMV", data.summary.cogs]);
    sheetData.push(["Margem Bruta", data.summary.grossMargin]);
    sheetData.push(["Despesas", data.summary.expenses]);
    sheetData.push(["Lucro Liquido", data.summary.netProfit]);

    await exportToExcel({
      fileName: `dre-dinamica-${format(startDate, "yyyy-MM-dd")}.xlsx`,
      sheets: [{ name: "DRE", data: sheetData }],
    });
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
          <h1 className="text-3xl font-bold">DRE Dinamica (Ledger)</h1>
          <p className="text-muted-foreground">
            Demonstrativo de Resultado baseado no razao contabil
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            {/* Start Date */}
            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
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
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
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
                <SelectTrigger>
                  <SelectValue placeholder="Todas as filiais" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as filiais</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Generate Button */}
            <div>
              <Button onClick={fetchDRE} disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Receita Liquida"
              value={formatCurrency(data.summary.netRevenue)}
              icon={DollarSign}
              subtitle={`${format(startDate, "dd/MM")} a ${format(endDate, "dd/MM/yyyy")}`}
            />
            <KPICard
              title="Lucro Bruto"
              value={formatCurrency(data.summary.grossMargin)}
              icon={TrendingUp}
              subtitle={`Margem Bruta: ${grossMarginPercent}%`}
            />
            <KPICard
              title="Margem Bruta %"
              value={`${grossMarginPercent}%`}
              icon={Percent}
              subtitle="Lucro Bruto / Receita Liq."
              className={
                Number(grossMarginPercent) >= 30 ? "border-green-200" : "border-yellow-200"
              }
            />
            <KPICard
              title="Margem Liquida %"
              value={`${netMarginPercent}%`}
              icon={BarChart3}
              subtitle="Lucro Liquido / Receita Liq."
              className={
                Number(netMarginPercent) >= 10
                  ? "border-green-200"
                  : Number(netMarginPercent) >= 0
                    ? "border-yellow-200"
                    : "border-red-200"
              }
            />
          </div>

          {/* DRE Table */}
          <Card>
            <CardHeader>
              <CardTitle>Demonstrativo de Resultado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-semibold">Conta</th>
                      <th className="text-right p-3 font-semibold">Valor</th>
                      <th className="text-right p-3 font-semibold">
                        % Rec. Liquida
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((line) => {
                      const netRev = data.summary.netRevenue || 1;
                      const pctLine = ((line.amount / netRev) * 100).toFixed(1);
                      const colorClass = getLineColorClass(line);
                      const isSummary = isSummaryLine(line.code);

                      return (
                        <Fragment key={line.code}>
                          {/* Main line */}
                          <tr
                            className={cn(
                              "border-b",
                              isSummary && "border-t-2 bg-muted/30"
                            )}
                          >
                            <td
                              className={cn(
                                "p-3",
                                colorClass,
                                isSummary
                                  ? "font-bold text-base"
                                  : "font-semibold"
                              )}
                            >
                              {line.name}
                            </td>
                            <td
                              className={cn(
                                "text-right p-3",
                                colorClass,
                                isSummary
                                  ? "font-bold text-base"
                                  : "font-semibold"
                              )}
                            >
                              {formatCurrency(line.amount)}
                            </td>
                            <td
                              className={cn(
                                "text-right p-3",
                                colorClass,
                                isSummary ? "font-bold" : "font-medium"
                              )}
                            >
                              {pctLine}%
                            </td>
                          </tr>

                          {/* Children */}
                          {line.children?.map((child) => {
                            const pctChild = (
                              (child.amount / netRev) *
                              100
                            ).toFixed(1);
                            return (
                              <tr
                                key={child.code}
                                className="border-b border-dashed"
                              >
                                <td className="p-3 pl-8 text-muted-foreground">
                                  {child.code} - {child.name}
                                </td>
                                <td className="text-right p-3 text-muted-foreground">
                                  {formatCurrency(child.amount)}
                                </td>
                                <td className="text-right p-3 text-muted-foreground">
                                  {pctChild}%
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Waterfall BarChart */}
            <Card>
              <CardHeader>
                <CardTitle>Cascata de Resultado</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={waterfallData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tickFormatter={(v) =>
                        `R$ ${(v / 1000).toFixed(0)}k`
                      }
                    />
                    <Tooltip
                      formatter={(value: any) => [
                        formatCurrency(value),
                        "Valor",
                      ]}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {waterfallData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Pie Chart - Cost Composition */}
            <Card>
              <CardHeader>
                <CardTitle>Composicao de Custos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }: any) =>
                        `${name}: ${((percent || 0) * 100).toFixed(1)}%`
                      }
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any) => [
                        formatCurrency(value),
                        "Valor",
                      ]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Export Buttons */}
          <div className="flex justify-end">
            <ExportButtons
              onExportPDF={handleExportPDF}
              onExportExcel={handleExportExcel}
              disabled={!data}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function DREDinamicoPage() {
  return (
    <ProtectedRoute permission="financial.view">
      <DREDinamicoPageContent />
    </ProtectedRoute>
  );
}
