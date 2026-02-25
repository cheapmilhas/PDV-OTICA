"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  BarChart,
  PieChart,
  Bar,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  CalendarIcon,
  Loader2,
  ArrowLeft,
  TrendingUp,
  ShoppingCart,
  DollarSign,
  Package,
  BarChart3,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";

// ---- Types ----

type Dimension = "brand" | "category" | "seller" | "paymentMethod" | "productType";

interface BIRow {
  dimension: string;
  revenue: number;
  quantity: number;
  avgTicket: number;
  margin: number;
}

interface BIData {
  data: BIRow[];
  totals: {
    revenue: number;
    quantity: number;
    avgTicket: number;
  };
}

interface StockAgingRow {
  productName: string;
  daysInStock: number;
  quantity: number;
  totalCost: number;
  ageRange: string;
}

interface StockAgingSummary {
  [key: string]: {
    count: number;
    value: number;
  };
}

interface StockAgingData {
  data: StockAgingRow[];
  summary: StockAgingSummary;
}

// Map API aging band keys ("0-30 dias") to UI keys ("0-30")
function mapAgeBandKey(band: string): string {
  if (band.includes("180")) return "180+";
  const match = band.match(/^(\d+-\d+)/);
  return match ? match[1] : band;
}

// Transform API BI response to UI format
function transformBIResponse(apiData: any[]): BIRow[] {
  return apiData.map((item: any) => ({
    dimension: item.name || item.method || "Desconhecido",
    revenue: Number(item.revenue || item.totalAmount || 0),
    quantity: Number(item.qty || item.salesCount || item.count || 0),
    avgTicket: Number(item.avgTicket || (item.revenue && item.count ? item.revenue / item.count : 0)),
    margin: Number(item.margin != null ? (item.revenue ? (item.margin / item.revenue) * 100 : 0) : 0),
  }));
}

// Transform API stock aging response to UI format
function transformStockAgingResponse(apiData: any): StockAgingData {
  const items = (apiData.items || []).map((item: any) => ({
    productName: item.product?.name || "Sem nome",
    daysInStock: item.ageDays || 0,
    quantity: item.qtyRemaining || 0,
    totalCost: item.totalValue || 0,
    ageRange: mapAgeBandKey(item.ageBand || ""),
  }));

  const summary: StockAgingSummary = {};
  if (apiData.summary) {
    for (const [key, val] of Object.entries(apiData.summary)) {
      const mappedKey = mapAgeBandKey(key);
      summary[mappedKey] = { count: (val as any).count || 0, value: (val as any).value || 0 };
    }
  }

  return { data: items, summary };
}

interface Branch {
  id: string;
  name: string;
}

// ---- Constants ----

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const PIE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
];

const AGE_RANGES = [
  { key: "0-30", label: "0-30 dias", color: "#10b981", bgClass: "bg-green-100 text-green-800 border-green-300" },
  { key: "31-60", label: "31-60 dias", color: "#f59e0b", bgClass: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  { key: "61-90", label: "61-90 dias", color: "#f97316", bgClass: "bg-orange-100 text-orange-800 border-orange-300" },
  { key: "91-180", label: "91-180 dias", color: "#ef4444", bgClass: "bg-red-100 text-red-800 border-red-300" },
  { key: "180+", label: "180+ dias", color: "#991b1b", bgClass: "bg-red-200 text-red-900 border-red-500" },
];

const DIMENSION_TABS: { value: Dimension; label: string }[] = [
  { value: "brand", label: "Marca" },
  { value: "category", label: "Categoria" },
  { value: "seller", label: "Vendedor" },
  { value: "paymentMethod", label: "Pagamento" },
  { value: "productType", label: "Tipo Produto" },
];

// ---- Helper: row color by age ----

function getRowColorByAge(ageRange: string): string {
  switch (ageRange) {
    case "0-30":
      return "bg-green-50";
    case "31-60":
      return "bg-yellow-50";
    case "61-90":
      return "bg-orange-50";
    case "91-180":
      return "bg-red-50";
    case "180+":
      return "bg-red-100";
    default:
      return "";
  }
}

// ---- Main Component ----

function BIPageContent() {
  // Date range: last 30 days default
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [branchId, setBranchId] = useState<string>("all");
  const [branches, setBranches] = useState<Branch[]>([]);

  // BI dimension data
  const [activeDimension, setActiveDimension] = useState<Dimension>("brand");
  const [biData, setBiData] = useState<BIData | null>(null);
  const [biLoading, setBiLoading] = useState(false);

  // Stock aging data
  const [stockData, setStockData] = useState<StockAgingData | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  // Load branches on mount
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const res = await fetch("/api/branches?status=ativos&pageSize=100");
        if (res.ok) {
          const data = await res.json();
          setBranches(data.data || []);
        }
      } catch (error) {
        console.error("Erro ao carregar filiais:", error);
      }
    };
    loadBranches();
  }, []);

  // Fetch BI dimension data
  const fetchBIData = useCallback(async (dimension: Dimension) => {
    setBiLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
        dimension,
      });
      if (branchId && branchId !== "all") {
        params.set("branchId", branchId);
      }

      const res = await fetch(`/api/finance/bi?${params}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao buscar dados de BI");
      }

      const json = await res.json();
      const apiResult = json.data || json;
      const rows = transformBIResponse(apiResult.data || []);
      const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
      const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
      setBiData({
        data: rows,
        totals: {
          revenue: totalRevenue,
          quantity: totalQty,
          avgTicket: totalQty > 0 ? totalRevenue / totalQty : 0,
        },
      });
    } catch (error: any) {
      toast.error(error.message);
      setBiData(null);
    } finally {
      setBiLoading(false);
    }
  }, [startDate, endDate, branchId]);

  // Fetch stock aging data
  const fetchStockAging = useCallback(async () => {
    setStockLoading(true);
    try {
      const params = new URLSearchParams();
      if (branchId && branchId !== "all") {
        params.set("branchId", branchId);
      }

      const res = await fetch(`/api/finance/bi/stock-aging?${params}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao buscar dados de estoque");
      }

      const json = await res.json();
      const apiResult = json.data || json;
      setStockData(transformStockAgingResponse(apiResult));
    } catch (error: any) {
      toast.error(error.message);
      setStockData(null);
    } finally {
      setStockLoading(false);
    }
  }, [branchId]);

  // Trigger fetch when "Gerar" is clicked
  const handleGenerate = () => {
    fetchBIData(activeDimension);
    fetchStockAging();
  };

  // Refetch when dimension tab changes (only if we already have data)
  const handleDimensionChange = (dimension: string) => {
    const dim = dimension as Dimension;
    setActiveDimension(dim);
    if (biData) {
      fetchBIData(dim);
    }
  };

  // Prepare chart data: Top 10 for BarChart
  const barChartData = biData
    ? [...biData.data]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .reverse()
    : [];

  // Prepare PieChart data: Top 5 + "Outros"
  const pieChartData = (() => {
    if (!biData) return [];
    const sorted = [...biData.data].sort((a, b) => b.revenue - a.revenue);
    const top5 = sorted.slice(0, 5);
    const othersRevenue = sorted.slice(5).reduce((sum, row) => sum + row.revenue, 0);
    const result = top5.map((row) => ({
      name: row.dimension,
      value: row.revenue,
    }));
    if (othersRevenue > 0) {
      result.push({ name: "Outros", value: othersRevenue });
    }
    return result;
  })();

  // Prepare stock aging chart data
  const stockBarChartData = (() => {
    if (!stockData?.summary) return [];
    return AGE_RANGES.map((range) => ({
      name: range.label,
      value: stockData.summary[range.key]?.value || 0,
      count: stockData.summary[range.key]?.count || 0,
      fill: range.color,
    }));
  })();

  // Export handlers
  const handleExportPDF = async () => {
    if (!biData) return;
    const { exportToPDF } = await import("@/lib/report-export");
    await exportToPDF({
      title: "Analise de Negocio (BI)",
      subtitle: `Dimensao: ${DIMENSION_TABS.find((t) => t.value === activeDimension)?.label}`,
      period: { start: startDate, end: endDate },
      sections: [
        {
          title: "Ranking",
          columns: [
            { header: "Nome", key: "dimension", format: "text" as const },
            { header: "Receita", key: "revenue", format: "currency" as const },
            { header: "Qtd", key: "quantity", format: "number" as const },
            { header: "Ticket Medio", key: "avgTicket", format: "currency" as const },
            { header: "Margem %", key: "margin", format: "number" as const },
          ],
          data: biData.data,
        },
      ],
    });
  };

  const handleExportExcel = async () => {
    if (!biData) return;
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(
      biData.data.map((row) => ({
        Nome: row.dimension,
        Receita: row.revenue,
        Quantidade: row.quantity,
        "Ticket Medio": row.avgTicket,
        "Margem %": row.margin,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BI");
    XLSX.writeFile(wb, `bi-${activeDimension}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/financeiro">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Analise de Negocio (BI)</h1>
            <p className="text-muted-foreground">
              Analise multidimensional de receitas, margens e estoque
            </p>
          </div>
        </div>
        <ExportButtons
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          disabled={!biData}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Start Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Data Inicial</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-[200px] justify-start text-left"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(startDate, "dd/MM/yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Data Final</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-[200px] justify-start text-left"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(endDate, "dd/MM/yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Branch Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Filial</label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="w-[200px]">
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

            {/* Generate button */}
            <Button onClick={handleGenerate} disabled={biLoading || stockLoading}>
              {biLoading || stockLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Gerar
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards (shown when we have data) */}
      {biData && (
        <div className="grid gap-4 md:grid-cols-3">
          <KPICard
            title="Receita Total"
            value={formatCurrency(biData.totals.revenue)}
            subtitle={`Periodo: ${format(startDate, "dd/MM/yy")} - ${format(endDate, "dd/MM/yy")}`}
            icon={DollarSign}
          />
          <KPICard
            title="Quantidade Total"
            value={biData.totals.quantity.toLocaleString("pt-BR")}
            subtitle="Itens vendidos no periodo"
            icon={ShoppingCart}
          />
          <KPICard
            title="Ticket Medio"
            value={formatCurrency(biData.totals.avgTicket)}
            subtitle="Valor medio por venda"
            icon={TrendingUp}
          />
        </div>
      )}

      {/* Dimension Tabs */}
      <Tabs
        value={activeDimension}
        onValueChange={handleDimensionChange}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-5">
          {DIMENSION_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {DIMENSION_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="space-y-6">
            {/* Loading */}
            {biLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* No data yet */}
            {!biLoading && !biData && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    Selecione o periodo e clique em &quot;Gerar&quot; para visualizar os dados.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Data loaded */}
            {!biLoading && biData && (
              <>
                {/* Ranking Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Ranking por {tab.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {biData.data.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        Nenhum dado encontrado para o periodo selecionado.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              <TableHead>Nome</TableHead>
                              <TableHead className="text-right">Receita</TableHead>
                              <TableHead className="text-right">Qtd</TableHead>
                              <TableHead className="text-right">Ticket Medio</TableHead>
                              <TableHead className="text-right">Margem %</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[...biData.data]
                              .sort((a, b) => b.revenue - a.revenue)
                              .map((row, index) => (
                                <TableRow key={row.dimension}>
                                  <TableCell className="font-medium text-muted-foreground">
                                    {index + 1}
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {row.dimension}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {formatCurrency(row.revenue)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {row.quantity.toLocaleString("pt-BR")}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(row.avgTicket)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Badge
                                      variant={row.margin >= 50 ? "default" : row.margin >= 30 ? "secondary" : "destructive"}
                                    >
                                      {row.margin.toFixed(1)}%
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Charts */}
                {biData.data.length > 0 && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Horizontal BarChart: Top 10 by Revenue */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Top 10 por Receita</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={400}>
                          <BarChart
                            data={barChartData}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                            <YAxis
                              dataKey="dimension"
                              type="category"
                              width={120}
                              tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                              formatter={(value: any) => [formatCurrency(Number(value)), "Receita"]}
                            />
                            <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                              {barChartData.map((_, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* PieChart: Revenue Distribution */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Distribuicao de Receita</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={400}>
                          <PieChart>
                            <Pie
                              data={pieChartData}
                              cx="50%"
                              cy="50%"
                              labelLine={true}
                              label={({ name, percent }: any) =>
                                `${name} (${((percent || 0) * 100).toFixed(1)}%)`
                              }
                              outerRadius={130}
                              dataKey="value"
                            >
                              {pieChartData.map((_, index) => (
                                <Cell
                                  key={`pie-cell-${index}`}
                                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: any) => [formatCurrency(Number(value)), "Receita"]}
                            />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* ======== Stock Aging Section ======== */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold">Aging de Estoque</h2>
            <p className="text-muted-foreground">
              Analise de tempo de permanencia dos produtos em estoque
            </p>
          </div>
        </div>

        {/* Loading */}
        {stockLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* No data yet */}
        {!stockLoading && !stockData && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                Clique em &quot;Gerar&quot; para visualizar os dados de aging de estoque.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stock data loaded */}
        {!stockLoading && stockData && (
          <>
            {/* Age Range Summary Cards */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
              {AGE_RANGES.map((range) => {
                const summary = stockData.summary[range.key];
                return (
                  <Card key={range.key} className="relative overflow-hidden">
                    <CardContent className="pt-6 pb-4">
                      <div className="flex flex-col items-center text-center">
                        <Badge
                          variant="outline"
                          className={`mb-2 text-xs font-semibold border ${range.bgClass}`}
                        >
                          {range.label}
                        </Badge>
                        <p className="text-lg font-bold">
                          {summary ? summary.count.toLocaleString("pt-BR") : 0} itens
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(summary?.value || 0)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Stock Aging Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Valor em Estoque por Faixa de Idade</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart
                    data={stockBarChartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => formatCurrency(v)} />
                    <Tooltip
                      formatter={(value: any, name: any) => {
                        if (name === "value") return [formatCurrency(Number(value)), "Valor"];
                        return [value, name];
                      }}
                      labelFormatter={(label) => `Faixa: ${label}`}
                    />
                    <Bar dataKey="value" name="value" radius={[4, 4, 0, 0]}>
                      {stockBarChartData.map((entry, index) => (
                        <Cell key={`stock-cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Stock Aging Table */}
            <Card>
              <CardHeader>
                <CardTitle>Detalhamento de Produtos Parados</CardTitle>
              </CardHeader>
              <CardContent>
                {stockData.data.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhum produto encontrado.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-right">Dias Parado</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Custo Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stockData.data.map((row, index) => (
                          <TableRow key={index} className={getRowColorByAge(row.ageRange)}>
                            <TableCell className="font-medium">
                              {row.productName}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant="outline"
                                className={
                                  AGE_RANGES.find((r) => r.key === row.ageRange)?.bgClass || ""
                                }
                              >
                                {row.daysInStock} dias
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {row.quantity.toLocaleString("pt-BR")}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(row.totalCost)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="financial.view">
      <BIPageContent />
    </ProtectedRoute>
  );
}
