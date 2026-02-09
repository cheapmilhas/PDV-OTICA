"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { KPICard } from "@/components/reports/kpi-card";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  DollarSign,
  CalendarIcon,
  Loader2,
  Clock,
  CheckCircle,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface CashShiftData {
  id: string;
  branchName: string;
  openedBy: string;
  closedBy: string | null;
  openedAt: Date;
  closedAt: Date | null;
  status: string;
  openingFloat: number;
  closingDeclared: number | null;
  closingExpected: number | null;
  difference: number | null;
  totalMovements: number;
  totalIn: number;
  totalOut: number;
}

interface ReportData {
  summary: {
    totalShifts: number;
    openShifts: number;
    closedShifts: number;
    totalDifference: number;
    averageDifference: number;
    shiftsWithDifference: number;
  };
  shifts: CashShiftData[];
  differenceBreakdown: Array<{
    range: string;
    count: number;
  }>;
  branchBreakdown: Array<{
    branchId: string;
    branchName: string;
    shiftCount: number;
    totalDifference: number;
  }>;
}

interface Branch {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Aberto",
  CLOSED: "Fechado",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  CLOSED: "bg-green-100 text-green-800",
};

export default function RelatorioHistoricoCaixasPage() {
  const [startDate, setStartDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  // Filters
  const [branchId, setBranchId] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("ALL");

  // Options for selects
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    // Fetch branches
    const fetchBranches = async () => {
      try {
        const res = await fetch("/api/branches");
        if (res.ok) {
          const branchesData = await res.json();
          // Handle both array and paginated response
          if (Array.isArray(branchesData)) {
            setBranches(branchesData);
          } else if (branchesData.data && Array.isArray(branchesData.data)) {
            setBranches(branchesData.data);
          } else {
            setBranches([]);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar filiais:", error);
        setBranches([]);
      }
    };

    fetchBranches();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
      });

      if (branchId && branchId !== "ALL") params.set("branchId", branchId);
      if (status && status !== "ALL") params.set("status", status);

      const res = await fetch(`/api/reports/financial/cash-history?${params}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro ao gerar relatório");
      }

      const reportData = await res.json();
      setData(reportData);
      toast.success("Relatório gerado com sucesso!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    toast.info("Exportação em PDF será implementada em breve");
  };

  const handleExportExcel = () => {
    if (!data) return;

    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(
        data.shifts.map((shift) => ({
          Filial: shift.branchName,
          "Aberto Por": shift.openedBy,
          "Fechado Por": shift.closedBy || "N/A",
          "Data Abertura": format(new Date(shift.openedAt), "dd/MM/yyyy HH:mm"),
          "Data Fechamento": shift.closedAt
            ? format(new Date(shift.closedAt), "dd/MM/yyyy HH:mm")
            : "N/A",
          Status: STATUS_LABELS[shift.status],
          "Fundo de Troco": shift.openingFloat,
          "Declarado": shift.closingDeclared || 0,
          "Esperado": shift.closingExpected || 0,
          "Diferença": shift.difference || 0,
          "Movimentos": shift.totalMovements,
          "Total Entradas": shift.totalIn,
          "Total Saídas": shift.totalOut,
        }))
      );

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Histórico de Caixas");
      XLSX.writeFile(
        wb,
        `historico-caixas-${format(new Date(), "yyyy-MM-dd")}.xlsx`
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Histórico de Caixas</h1>
          <p className="text-muted-foreground">
            Análise completa de abertura e fechamento de caixas
          </p>
        </div>
        <ExportButtons
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          disabled={!data}
        />
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left"
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

            <div className="space-y-2">
              <Label>Data Final</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left"
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

            <div className="space-y-2">
              <Label>Filial</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="OPEN">Aberto</SelectItem>
                  <SelectItem value="CLOSED">Fechado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <Button onClick={fetchReport} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                "Gerar Relatório"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Total de Caixas"
              value={data.summary.totalShifts.toString()}
              subtitle={`${data.summary.closedShifts} fechados`}
              icon={CheckCircle}
            />
            <KPICard
              title="Caixas Abertos"
              value={data.summary.openShifts.toString()}
              icon={Clock}
            />
            <KPICard
              title="Diferença Total"
              value={formatCurrency(data.summary.totalDifference)}
              subtitle={`Média: ${formatCurrency(data.summary.averageDifference)}`}
              icon={DollarSign}
            />
            <KPICard
              title="Caixas com Diferença"
              value={data.summary.shiftsWithDifference.toString()}
              subtitle={`${((data.summary.shiftsWithDifference / (data.summary.closedShifts || 1)) * 100).toFixed(1)}% do total`}
              icon={AlertTriangle}
            />
          </div>

          {/* Gráficos */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Distribuição de Diferenças */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Diferenças</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.differenceBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="range"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="count"
                      name="Quantidade de Caixas"
                      fill="#8884d8"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Caixas por Filial */}
            <Card>
              <CardHeader>
                <CardTitle>Caixas por Filial</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.branchBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="branchName"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend />
                    <Bar
                      dataKey="shiftCount"
                      name="Qtd. Caixas"
                      fill="#82ca9d"
                    />
                    <Bar
                      dataKey="totalDifference"
                      name="Diferença Total"
                      fill="#ffc658"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Tabela Detalhada */}
          <Card>
            <CardHeader>
              <CardTitle>
                Caixas Detalhados ({data.shifts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Filial</th>
                      <th className="text-left p-2">Aberto Por</th>
                      <th className="text-left p-2">Fechado Por</th>
                      <th className="text-left p-2">Abertura</th>
                      <th className="text-left p-2">Fechamento</th>
                      <th className="text-right p-2">Declarado</th>
                      <th className="text-right p-2">Esperado</th>
                      <th className="text-right p-2">Diferença</th>
                      <th className="text-center p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.shifts.map((shift) => (
                      <tr
                        key={shift.id}
                        className="border-b hover:bg-muted/50"
                      >
                        <td className="p-2 font-medium">{shift.branchName}</td>
                        <td className="p-2">{shift.openedBy}</td>
                        <td className="p-2">{shift.closedBy || "—"}</td>
                        <td className="p-2">
                          {format(new Date(shift.openedAt), "dd/MM/yyyy HH:mm")}
                        </td>
                        <td className="p-2">
                          {shift.closedAt
                            ? format(new Date(shift.closedAt), "dd/MM/yyyy HH:mm")
                            : "—"}
                        </td>
                        <td className="p-2 text-right">
                          {shift.closingDeclared
                            ? formatCurrency(shift.closingDeclared)
                            : "—"}
                        </td>
                        <td className="p-2 text-right">
                          {shift.closingExpected
                            ? formatCurrency(shift.closingExpected)
                            : "—"}
                        </td>
                        <td
                          className={`p-2 text-right font-medium ${
                            shift.difference && shift.difference !== 0
                              ? shift.difference > 0
                                ? "text-green-600"
                                : "text-red-600"
                              : ""
                          }`}
                        >
                          {shift.difference !== null
                            ? formatCurrency(shift.difference)
                            : "—"}
                        </td>
                        <td className="p-2 text-center">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              STATUS_COLORS[shift.status]
                            }`}
                          >
                            {STATUS_LABELS[shift.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!data && !loading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Selecione o período e clique em "Gerar Relatório" para visualizar os
            dados
          </CardContent>
        </Card>
      )}
    </div>
  );
}
