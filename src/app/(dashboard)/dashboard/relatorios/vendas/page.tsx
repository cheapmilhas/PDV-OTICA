"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { KPICard } from "@/components/reports/kpi-card";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  CalendarIcon,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ReportData {
  summary: {
    totalSales: number;
    totalRevenue: number;
    averageTicket: number;
    totalItems: number;
    canceledSales: number;
    canceledRevenue: number;
  };
  paymentMethods: Array<{
    method: string;
    count: number;
    total: number;
    percentage: number;
  }>;
  dailySales: Array<{
    date: string;
    sales: number;
    revenue: number;
  }>;
  topSellers: Array<{
    userId: string;
    userName: string;
    sales: number;
    revenue: number;
  }>;
  sales: Array<{
    id: string;
    date: string;
    customerName: string | null;
    sellerName: string;
    total: number;
    status: string;
    paymentMethods: string[];
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT_CARD: "Cartão Débito",
  CREDIT_CARD: "Cartão Crédito",
  BOLETO: "Boleto",
  STORE_CREDIT: "Crédito Loja",
  CHEQUE: "Cheque",
  AGREEMENT: "Convênio",
  OTHER: "Outro",
};

export default function RelatorioVendasPage() {
  const [startDate, setStartDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
      });

      const res = await fetch(`/api/reports/sales/consolidated?${params}`);
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

    import('xlsx').then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(data.sales.map(sale => ({
        'Data': format(new Date(sale.date), 'dd/MM/yyyy HH:mm'),
        'Cliente': sale.customerName || 'N/A',
        'Vendedor': sale.sellerName,
        'Total': sale.total,
        'Status': sale.status,
        'Formas Pagamento': sale.paymentMethods.join(', ')
      })));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
      XLSX.writeFile(wb, `relatorio-vendas-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Relatório de Vendas</h1>
          <p className="text-muted-foreground">Análise consolidada de vendas do período</p>
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
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data Inicial</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-start text-left">
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
              <label className="text-sm font-medium">Data Final</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-start text-left">
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
              title="Total de Vendas"
              value={data.summary.totalSales}
              subtitle={`${data.summary.canceledSales} canceladas`}
              icon={ShoppingCart}
            />
            <KPICard
              title="Receita Total"
              value={formatCurrency(data.summary.totalRevenue)}
              subtitle={`Cancelado: ${formatCurrency(data.summary.canceledRevenue)}`}
              icon={DollarSign}
            />
            <KPICard
              title="Ticket Médio"
              value={formatCurrency(data.summary.averageTicket)}
              icon={TrendingUp}
            />
            <KPICard
              title="Itens Vendidos"
              value={data.summary.totalItems}
              icon={Package}
            />
          </div>

          {/* Gráficos */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Vendas Diárias */}
            <Card>
              <CardHeader>
                <CardTitle>Vendas Diárias</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.dailySales}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => format(new Date(value), 'dd/MM')}
                    />
                    <YAxis />
                    <Tooltip
                      formatter={(value: any) => formatCurrency(value)}
                      labelFormatter={(label) => format(new Date(label), 'dd/MM/yyyy')}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Receita"
                      stroke="#8884d8"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Formas de Pagamento */}
            <Card>
              <CardHeader>
                <CardTitle>Formas de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.paymentMethods}
                      dataKey="total"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => `${PAYMENT_METHOD_LABELS[entry.method]}: ${entry.percentage.toFixed(1)}%`}
                    >
                      {data.paymentMethods.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Top Vendedores */}
          {data.topSellers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Vendedores</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.topSellers}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="userName" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Receita" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Tabela de Vendas */}
          <Card>
            <CardHeader>
              <CardTitle>Vendas Detalhadas ({data.sales.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Data</th>
                      <th className="text-left p-2">Cliente</th>
                      <th className="text-left p-2">Vendedor</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-center p-2">Status</th>
                      <th className="text-left p-2">Pagamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sales.slice(0, 50).map((sale) => (
                      <tr key={sale.id} className="border-b hover:bg-muted/50">
                        <td className="p-2">{format(new Date(sale.date), 'dd/MM/yyyy HH:mm')}</td>
                        <td className="p-2">{sale.customerName || "—"}</td>
                        <td className="p-2">{sale.sellerName}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(sale.total)}</td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-1 rounded text-xs ${
                            sale.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {sale.status === 'COMPLETED' ? 'Concluída' : 'Cancelada'}
                          </span>
                        </td>
                        <td className="p-2 text-xs">
                          {sale.paymentMethods.map(m => PAYMENT_METHOD_LABELS[m]).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.sales.length > 50 && (
                  <p className="text-sm text-muted-foreground mt-4 text-center">
                    Mostrando 50 de {data.sales.length} vendas. Use os filtros para refinar.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!data && !loading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Selecione o período e clique em "Gerar Relatório" para visualizar os dados
          </CardContent>
        </Card>
      )}
    </div>
  );
}
