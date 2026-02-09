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
  Users,
  TrendingUp,
  CalendarIcon,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
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

interface SellerCommissionData {
  userId: string;
  userName: string;
  totalSales: number;
  totalRevenue: number;
  totalCommission: number;
  averageCommissionPercent: number;
  pendingCommission: number;
  approvedCommission: number;
  paidCommission: number;
  salesCount: number;
}

interface ReportData {
  summary: {
    totalSellers: number;
    totalCommission: number;
    pendingCommission: number;
    approvedCommission: number;
    paidCommission: number;
    totalSales: number;
    totalRevenue: number;
  };
  sellers: SellerCommissionData[];
  statusBreakdown: Array<{
    status: string;
    count: number;
    amount: number;
  }>;
  commissions: Array<{
    id: string;
    saleId: string;
    saleDate: Date;
    userName: string;
    customerName: string | null;
    baseAmount: number;
    percentage: number;
    commissionAmount: number;
    status: string;
  }>;
}

interface User {
  id: string;
  name: string;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovada",
  PAID: "Paga",
  CANCELED: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
  CANCELED: "bg-red-100 text-red-800",
};

export default function RelatorioComissoesPage() {
  const [startDate, setStartDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  // Filters
  const [userId, setUserId] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("ALL");

  // Options for selects
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    // Fetch users (sellers)
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/users");
        if (res.ok) {
          const usersData = await res.json();
          // Handle both array and paginated response
          if (Array.isArray(usersData)) {
            setUsers(usersData);
          } else if (usersData.data && Array.isArray(usersData.data)) {
            setUsers(usersData.data);
          } else {
            setUsers([]);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar vendedores:", error);
        setUsers([]);
      }
    };

    fetchUsers();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
      });

      if (userId && userId !== "ALL") params.set("userId", userId);
      if (status && status !== "ALL") params.set("status", status);

      const res = await fetch(`/api/reports/commissions?${params}`);
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
        data.commissions.map((commission) => ({
          "ID Venda": commission.saleId,
          Data: format(new Date(commission.saleDate), "dd/MM/yyyy HH:mm"),
          Vendedor: commission.userName,
          Cliente: commission.customerName || "N/A",
          "Valor Base": commission.baseAmount,
          "% Comissão": commission.percentage.toFixed(2) + "%",
          "Valor Comissão": commission.commissionAmount,
          Status: STATUS_LABELS[commission.status],
        }))
      );

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Comissões");
      XLSX.writeFile(
        wb,
        `relatorio-comissoes-${format(new Date(), "yyyy-MM-dd")}.xlsx`
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Relatório de Comissões</h1>
          <p className="text-muted-foreground">
            Análise de comissões por vendedor
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
              <Label>Vendedor</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
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
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="APPROVED">Aprovada</SelectItem>
                  <SelectItem value="PAID">Paga</SelectItem>
                  <SelectItem value="CANCELED">Cancelada</SelectItem>
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
              title="Total Comissões"
              value={formatCurrency(data.summary.totalCommission)}
              subtitle={`${data.summary.totalSales} vendas`}
              icon={DollarSign}
            />
            <KPICard
              title="Pendentes"
              value={formatCurrency(data.summary.pendingCommission)}
              icon={Clock}
            />
            <KPICard
              title="Aprovadas"
              value={formatCurrency(data.summary.approvedCommission)}
              icon={CheckCircle}
            />
            <KPICard
              title="Pagas"
              value={formatCurrency(data.summary.paidCommission)}
              icon={TrendingUp}
            />
          </div>

          {/* Gráficos */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Top Vendedores */}
            <Card>
              <CardHeader>
                <CardTitle>Top Vendedores por Comissão</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.sellers.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="userName"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend />
                    <Bar
                      dataKey="totalCommission"
                      name="Comissão Total"
                      fill="#8884d8"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Status das Comissões</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.statusBreakdown}
                      dataKey="amount"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) =>
                        `${STATUS_LABELS[entry.status]}: ${formatCurrency(
                          entry.amount
                        )}`
                      }
                    >
                      {data.statusBreakdown.map((entry, index) => (
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
          </div>

          {/* Tabela de Vendedores */}
          <Card>
            <CardHeader>
              <CardTitle>Vendedores ({data.sellers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Vendedor</th>
                      <th className="text-center p-2">Vendas</th>
                      <th className="text-right p-2">Receita</th>
                      <th className="text-right p-2">Comissão Total</th>
                      <th className="text-right p-2">% Média</th>
                      <th className="text-right p-2">Pendente</th>
                      <th className="text-right p-2">Aprovada</th>
                      <th className="text-right p-2">Paga</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sellers.map((seller) => (
                      <tr key={seller.userId} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-medium">{seller.userName}</td>
                        <td className="p-2 text-center">{seller.salesCount}</td>
                        <td className="p-2 text-right">
                          {formatCurrency(seller.totalRevenue)}
                        </td>
                        <td className="p-2 text-right font-medium">
                          {formatCurrency(seller.totalCommission)}
                        </td>
                        <td className="p-2 text-right">
                          {seller.averageCommissionPercent.toFixed(2)}%
                        </td>
                        <td className="p-2 text-right text-yellow-600">
                          {formatCurrency(seller.pendingCommission)}
                        </td>
                        <td className="p-2 text-right text-blue-600">
                          {formatCurrency(seller.approvedCommission)}
                        </td>
                        <td className="p-2 text-right text-green-600">
                          {formatCurrency(seller.paidCommission)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de Comissões Detalhadas */}
          <Card>
            <CardHeader>
              <CardTitle>
                Comissões Detalhadas ({data.commissions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Data</th>
                      <th className="text-left p-2">Vendedor</th>
                      <th className="text-left p-2">Cliente</th>
                      <th className="text-right p-2">Valor Base</th>
                      <th className="text-right p-2">%</th>
                      <th className="text-right p-2">Comissão</th>
                      <th className="text-center p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.commissions.slice(0, 100).map((commission) => (
                      <tr
                        key={commission.id}
                        className="border-b hover:bg-muted/50"
                      >
                        <td className="p-2">
                          {format(new Date(commission.saleDate), "dd/MM/yyyy HH:mm")}
                        </td>
                        <td className="p-2">{commission.userName}</td>
                        <td className="p-2">{commission.customerName || "—"}</td>
                        <td className="p-2 text-right">
                          {formatCurrency(commission.baseAmount)}
                        </td>
                        <td className="p-2 text-right">
                          {commission.percentage.toFixed(2)}%
                        </td>
                        <td className="p-2 text-right font-medium">
                          {formatCurrency(commission.commissionAmount)}
                        </td>
                        <td className="p-2 text-center">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              STATUS_COLORS[commission.status]
                            }`}
                          >
                            {STATUS_LABELS[commission.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.commissions.length > 100 && (
                  <p className="text-sm text-muted-foreground mt-4 text-center">
                    Mostrando 100 de {data.commissions.length} comissões. Use os
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
            Selecione o período e clique em "Gerar Relatório" para visualizar os
            dados
          </CardContent>
        </Card>
      )}
    </div>
  );
}
