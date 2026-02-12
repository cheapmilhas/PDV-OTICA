"use client";

import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { KPICard } from "@/components/reports/kpi-card";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  DollarSign,
  Users,
  TrendingUp,
  Loader2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
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

interface ReceivableData {
  id: string;
  saleId: string;
  saleDate: Date;
  customerName: string | null;
  customerId: string | null;
  dueDate: Date;
  amount: number;
  paymentMethod: string;
  status: string;
  daysOverdue: number;
  agingCategory: string;
}

interface ReportData {
  summary: {
    totalReceivable: number;
    overdue: number;
    toReceive: number;
    averageTicket: number;
    totalCustomers: number;
    overdueCustomers: number;
    totalPayments: number;
    overduePayments: number;
  };
  receivables: ReceivableData[];
  customerBreakdown: Array<{
    customerId: string;
    customerName: string;
    totalAmount: number;
    overdueAmount: number;
    paymentCount: number;
  }>;
  agingBreakdown: Array<{
    category: string;
    count: number;
    amount: number;
  }>;
  monthBreakdown: Array<{
    month: string;
    count: number;
    amount: number;
  }>;
}

interface Customer {
  id: string;
  name: string;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

export default function RelatorioContasReceberPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  // Filters
  const [customerId, setCustomerId] = useState<string>("ALL");
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Options for selects
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    // Fetch customers
    const fetchCustomers = async () => {
      try {
        const res = await fetch("/api/customers");
        if (res.ok) {
          const customersData = await res.json();
          // Handle both array and paginated response
          if (Array.isArray(customersData)) {
            setCustomers(customersData);
          } else if (customersData.data && Array.isArray(customersData.data)) {
            setCustomers(customersData.data);
          } else {
            setCustomers([]);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar clientes:", error);
      }
    };

    fetchCustomers();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      if (customerId && customerId !== "ALL") params.set("customerId", customerId);
      if (overdueOnly) params.set("overdue", "true");

      const res = await fetch(
        `/api/reports/financial/accounts-receivable?${params}`
      );
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
    toast("Exportação em PDF será implementada em breve", { icon: "ℹ️" });
  };

  const handleExportExcel = () => {
    if (!data) return;

    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(
        data.receivables.map((receivable) => ({
          "ID Venda": receivable.saleId,
          "Data Venda": format(new Date(receivable.saleDate), "dd/MM/yyyy"),
          Cliente: receivable.customerName || "N/A",
          "Data Vencimento": format(new Date(receivable.dueDate), "dd/MM/yyyy"),
          Valor: receivable.amount,
          "Forma Pagamento": receivable.paymentMethod,
          "Dias Atraso": receivable.daysOverdue,
          Categoria: receivable.agingCategory,
        }))
      );

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contas a Receber");
      XLSX.writeFile(
        wb,
        `contas-receber-${format(new Date(), "yyyy-MM-dd")}.xlsx`
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contas a Receber</h1>
          <p className="text-muted-foreground">
            Análise de recebíveis e inadimplência
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os clientes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os clientes</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Filtros Adicionais</Label>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="overdueOnly"
                  checked={overdueOnly}
                  onCheckedChange={(checked) =>
                    setOverdueOnly(checked as boolean)
                  }
                />
                <label
                  htmlFor="overdueOnly"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Apenas vencidos
                </label>
              </div>
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
              title="Total a Receber"
              value={formatCurrency(data.summary.totalReceivable)}
              subtitle={`${data.summary.totalPayments} pagamentos`}
              icon={DollarSign}
            />
            <KPICard
              title="Vencidos"
              value={formatCurrency(data.summary.overdue)}
              subtitle={`${data.summary.overduePayments} pagamentos`}
              icon={AlertTriangle}
            />
            <KPICard
              title="A Vencer"
              value={formatCurrency(data.summary.toReceive)}
              icon={Clock}
            />
            <KPICard
              title="Clientes Devedores"
              value={data.summary.totalCustomers.toString()}
              subtitle={`${data.summary.overdueCustomers} com atraso`}
              icon={Users}
            />
          </div>

          {/* Gráficos */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Aging Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Análise de Vencimento (Aging)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.agingBreakdown.filter((item) => item.count > 0)}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry: any) =>
                        `${entry.category}: ${formatCurrency(entry.amount)}`
                      }
                    >
                      {data.agingBreakdown.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Recebimentos por Mês */}
            <Card>
              <CardHeader>
                <CardTitle>Recebimentos por Mês</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.monthBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="amount" name="Valor Total" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Top Clientes Devedores */}
          {data.customerBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Top Clientes Devedores ({data.customerBreakdown.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Cliente</th>
                        <th className="text-center p-2">Qtd. Pagamentos</th>
                        <th className="text-right p-2">Total a Receber</th>
                        <th className="text-right p-2">Vencido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.customerBreakdown.slice(0, 20).map((customer) => (
                        <tr
                          key={customer.customerId}
                          className="border-b hover:bg-muted/50"
                        >
                          <td className="p-2 font-medium">
                            {customer.customerName}
                          </td>
                          <td className="p-2 text-center">
                            {customer.paymentCount}
                          </td>
                          <td className="p-2 text-right">
                            {formatCurrency(customer.totalAmount)}
                          </td>
                          <td
                            className={`p-2 text-right font-medium ${
                              customer.overdueAmount > 0
                                ? "text-red-600"
                                : "text-green-600"
                            }`}
                          >
                            {formatCurrency(customer.overdueAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.customerBreakdown.length > 20 && (
                    <p className="text-sm text-muted-foreground mt-4 text-center">
                      Mostrando 20 de {data.customerBreakdown.length} clientes
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabela Detalhada */}
          <Card>
            <CardHeader>
              <CardTitle>
                Contas a Receber Detalhadas ({data.receivables.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Data Venda</th>
                      <th className="text-left p-2">Cliente</th>
                      <th className="text-left p-2">Vencimento</th>
                      <th className="text-right p-2">Valor</th>
                      <th className="text-left p-2">Forma Pagamento</th>
                      <th className="text-center p-2">Dias Atraso</th>
                      <th className="text-left p-2">Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.receivables.slice(0, 100).map((receivable) => {
                      const isOverdue = receivable.daysOverdue > 0;
                      return (
                        <tr
                          key={receivable.id}
                          className={`border-b hover:bg-muted/50 ${
                            isOverdue ? "bg-red-50" : ""
                          }`}
                        >
                          <td className="p-2">
                            {format(
                              new Date(receivable.saleDate),
                              "dd/MM/yyyy"
                            )}
                          </td>
                          <td className="p-2 font-medium">
                            {receivable.customerName || "N/A"}
                          </td>
                          <td className="p-2">
                            {format(new Date(receivable.dueDate), "dd/MM/yyyy")}
                          </td>
                          <td className="p-2 text-right font-medium">
                            {formatCurrency(receivable.amount)}
                          </td>
                          <td className="p-2">{receivable.paymentMethod}</td>
                          <td
                            className={`p-2 text-center font-medium ${
                              isOverdue ? "text-red-600" : "text-green-600"
                            }`}
                          >
                            {isOverdue ? receivable.daysOverdue : "—"}
                          </td>
                          <td className="p-2">
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                isOverdue
                                  ? "bg-red-100 text-red-800"
                                  : "bg-green-100 text-green-800"
                              }`}
                            >
                              {receivable.agingCategory}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {data.receivables.length > 100 && (
                  <p className="text-sm text-muted-foreground mt-4 text-center">
                    Mostrando 100 de {data.receivables.length} contas. Use os
                    filtros para refinar.
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
            Clique em "Gerar Relatório" para visualizar as contas a receber
          </CardContent>
        </Card>
      )}
    </div>
  );
}
