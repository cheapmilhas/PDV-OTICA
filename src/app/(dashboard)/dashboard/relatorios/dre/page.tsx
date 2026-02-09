"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { KPICard } from "@/components/reports/kpi-card";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Loader2,
  ArrowLeft,
  CalendarIcon,
  BarChart3,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface MonthlyDREData {
  month: string;
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
}

interface ReportData {
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

export default function RelatorioDREPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState<Date>(
    new Date(new Date().getFullYear(), 0, 1) // First day of current year
  );
  const [endDate, setEndDate] = useState<Date>(new Date());

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
      });

      const res = await fetch(`/api/reports/financial/dre?${params}`);
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
          <h1 className="text-3xl font-bold">DRE Gerencial</h1>
          <p className="text-muted-foreground">
            Demonstrativo de Resultado do Exercício
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>

          <div className="mt-4">
            <Button onClick={fetchReport} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gerar Relatório
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {data && (
        <>
          {/* Export */}
          <div className="flex justify-end">
            <ExportButtons
              data={data}
              filename="dre-gerencial"
              pdfTitle="DRE Gerencial"
            />
          </div>

          {/* KPIs Consolidados */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Receita Líquida"
              value={formatCurrency(data.consolidated.netRevenue)}
              icon={DollarSign}
              description="No período"
            />
            <KPICard
              title="Lucro Bruto"
              value={formatCurrency(data.consolidated.grossProfit)}
              icon={TrendingUp}
              description={`${data.consolidated.grossMargin.toFixed(1)}% margem`}
              trend={data.consolidated.grossProfit > 0 ? "positive" : "negative"}
            />
            <KPICard
              title="EBITDA"
              value={formatCurrency(data.consolidated.ebitda)}
              icon={BarChart3}
              description="Resultado operacional"
              trend={data.consolidated.ebitda > 0 ? "positive" : "negative"}
            />
            <KPICard
              title="Lucro Líquido"
              value={formatCurrency(data.consolidated.netProfit)}
              icon={data.consolidated.netProfit >= 0 ? TrendingUp : TrendingDown}
              description={`${data.consolidated.netMargin.toFixed(1)}% margem`}
              trend={data.consolidated.netProfit > 0 ? "positive" : "negative"}
            />
          </div>

          {/* DRE Detalhado Consolidado */}
          <Card>
            <CardHeader>
              <CardTitle>DRE Consolidado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center font-semibold text-lg">
                    <span>Receita Bruta</span>
                    <span>{formatCurrency(data.consolidated.grossRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center text-red-600 pl-4">
                    <span>(-) Deduções</span>
                    <span>({formatCurrency(data.consolidated.deductions)})</span>
                  </div>
                  <div className="flex justify-between items-center font-semibold border-t pt-2">
                    <span>(=) Receita Líquida</span>
                    <span>{formatCurrency(data.consolidated.netRevenue)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-red-600">
                    <span>(-) CMV</span>
                    <span>({formatCurrency(data.consolidated.cogs)})</span>
                  </div>
                  <div className="flex justify-between items-center font-semibold border-t pt-2 text-green-600">
                    <span>(=) Lucro Bruto</span>
                    <span>{formatCurrency(data.consolidated.grossProfit)} ({data.consolidated.grossMargin.toFixed(1)}%)</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-red-600">
                    <span>(-) Despesas Operacionais</span>
                    <span>({formatCurrency(data.consolidated.operatingExpenses)})</span>
                  </div>
                  <div className="flex justify-between items-center font-semibold border-t pt-2">
                    <span>(=) EBITDA</span>
                    <span className={data.consolidated.ebitda >= 0 ? "text-green-600" : "text-red-600"}>
                      {formatCurrency(data.consolidated.ebitda)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span>(+/-) Resultado Financeiro</span>
                    <span className={data.consolidated.financialResult >= 0 ? "text-green-600" : "text-red-600"}>
                      {formatCurrency(data.consolidated.financialResult)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-lg border-t-2 pt-2">
                    <span>(=) Lucro Líquido</span>
                    <span className={data.consolidated.netProfit >= 0 ? "text-green-600" : "text-red-600"}>
                      {formatCurrency(data.consolidated.netProfit)} ({data.consolidated.netMargin.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid gap-4">
            {/* Revenue and Profit Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Evolução Mensal - Receitas e Lucros</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={data.monthly}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="netRevenue"
                      stroke="#8884d8"
                      name="Receita Líquida"
                    />
                    <Line
                      type="monotone"
                      dataKey="grossProfit"
                      stroke="#82ca9d"
                      name="Lucro Bruto"
                    />
                    <Line
                      type="monotone"
                      dataKey="netProfit"
                      stroke="#ffc658"
                      name="Lucro Líquido"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Margins Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Evolução das Margens (%)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.monthly}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => `${value.toFixed(1)}%`} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="grossMargin"
                      stroke="#82ca9d"
                      name="Margem Bruta"
                    />
                    <Line
                      type="monotone"
                      dataKey="netMargin"
                      stroke="#ffc658"
                      name="Margem Líquida"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Breakdown Mensal</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={data.monthly}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="netRevenue" fill="#8884d8" name="Receita Líquida" />
                    <Bar dataKey="cogs" fill="#ff8042" name="CMV" />
                    <Bar dataKey="operatingExpenses" fill="#ffbb28" name="Despesas" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Table */}
          <Card>
            <CardHeader>
              <CardTitle>Análise Mensal Detalhada</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Mês</th>
                      <th className="text-right p-2">Rec. Líquida</th>
                      <th className="text-right p-2">CMV</th>
                      <th className="text-right p-2">Lucro Bruto</th>
                      <th className="text-right p-2">Despesas</th>
                      <th className="text-right p-2">EBITDA</th>
                      <th className="text-right p-2">Lucro Líq.</th>
                      <th className="text-right p-2">Mg. Bruta</th>
                      <th className="text-right p-2">Mg. Líq.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthly.map((month) => (
                      <tr key={month.month} className="border-b">
                        <td className="p-2">{month.month}</td>
                        <td className="text-right p-2">{formatCurrency(month.netRevenue)}</td>
                        <td className="text-right p-2 text-red-600">
                          {formatCurrency(month.cogs)}
                        </td>
                        <td className="text-right p-2 text-green-600">
                          {formatCurrency(month.grossProfit)}
                        </td>
                        <td className="text-right p-2 text-red-600">
                          {formatCurrency(month.operatingExpenses)}
                        </td>
                        <td className="text-right p-2">
                          {formatCurrency(month.ebitda)}
                        </td>
                        <td className={`text-right p-2 font-semibold ${month.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(month.netProfit)}
                        </td>
                        <td className="text-right p-2">{month.grossMargin.toFixed(1)}%</td>
                        <td className={`text-right p-2 ${month.netMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {month.netMargin.toFixed(1)}%
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
    </div>
  );
}
