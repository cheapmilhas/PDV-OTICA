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
  Building2,
  TrendingUp,
  Loader2,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import toast from "react-hot-toast";
import Link from "next/link";
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

interface PayableData {
  id: string;
  supplierName: string | null;
  supplierId: string | null;
  description: string | null;
  dueDate: Date;
  amount: number;
  status: string;
  daysOverdue: number;
  agingCategory: string;
}

interface ReportData {
  summary: {
    totalPayable: number;
    overdue: number;
    toPay: number;
    averageTicket: number;
    totalSuppliers: number;
    overdueSuppliers: number;
    totalPayments: number;
    overduePayments: number;
  };
  payables: PayableData[];
  supplierBreakdown: Array<{
    supplierId: string;
    supplierName: string;
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

interface Supplier {
  id: string;
  name: string;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

export default function RelatorioContasPagarPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  // Filters
  const [supplierId, setSupplierId] = useState<string>("ALL");
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Options for selects
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    // Fetch suppliers
    const fetchSuppliers = async () => {
      try {
        const res = await fetch("/api/suppliers");
        if (res.ok) {
          const suppliersData = await res.json();
          // Handle both array and paginated response
          if (Array.isArray(suppliersData)) {
            setSuppliers(suppliersData);
          } else if (suppliersData.data && Array.isArray(suppliersData.data)) {
            setSuppliers(suppliersData.data);
          } else {
            setSuppliers([]);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar fornecedores:", error);
        setSuppliers([]);
      }
    };

    fetchSuppliers();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      if (supplierId && supplierId !== "ALL") params.set("supplierId", supplierId);
      if (overdueOnly) params.set("overdue", "true");

      const res = await fetch(
        `/api/reports/financial/accounts-payable?${params}`
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

  const handleExportPDF = async () => {
    if (!data) return;
    const { exportToPDF } = await import("@/lib/report-export");
    await exportToPDF({
      title: "Contas a Pagar",
      subtitle: overdueOnly ? "Apenas vencidos" : undefined,
      sections: [
        {
          title: "Resumo",
          columns: [
            { header: "Indicador", key: "label", format: "text" },
            { header: "Valor", key: "value", format: "text" },
          ],
          data: [
            { label: "Total a Pagar", value: formatCurrency(data.summary.totalPayable) },
            { label: "Vencidos", value: formatCurrency(data.summary.overdue) },
            { label: "A Vencer", value: formatCurrency(data.summary.toPay) },
            { label: "Ticket Médio", value: formatCurrency(data.summary.averageTicket) },
            { label: "Total de Fornecedores", value: String(data.summary.totalSuppliers) },
            { label: "Fornecedores com Atraso", value: String(data.summary.overdueSuppliers) },
            { label: "Total de Contas", value: String(data.summary.totalPayments) },
            { label: "Contas Vencidas", value: String(data.summary.overduePayments) },
          ],
        },
        {
          title: "Breakdown por Fornecedor",
          columns: [
            { header: "Fornecedor", key: "supplierName", format: "text" },
            { header: "Total", key: "totalAmount", format: "currency" },
            { header: "Vencido", key: "overdueAmount", format: "currency" },
            { header: "Contas", key: "paymentCount", format: "number" },
          ],
          data: data.supplierBreakdown,
        },
        {
          title: "Análise por Aging",
          columns: [
            { header: "Categoria", key: "category", format: "text" },
            { header: "Quantidade", key: "count", format: "number" },
            { header: "Valor", key: "amount", format: "currency" },
          ],
          data: data.agingBreakdown,
        },
        {
          title: "Projeção Mensal",
          columns: [
            { header: "Mês", key: "month", format: "text" },
            { header: "Quantidade", key: "count", format: "number" },
            { header: "Valor", key: "amount", format: "currency" },
          ],
          data: data.monthBreakdown,
        },
        {
          title: "Contas a Pagar (Detalhado)",
          columns: [
            { header: "Fornecedor", key: "supplierName", format: "text" },
            { header: "Descrição", key: "description", format: "text" },
            { header: "Vencimento", key: "dueDateFormatted", format: "text" },
            { header: "Valor", key: "amount", format: "currency" },
            { header: "Status", key: "agingCategory", format: "text" },
            { header: "Dias Atraso", key: "daysOverdue", format: "number" },
          ],
          data: data.payables.map((p) => ({
            ...p,
            supplierName: p.supplierName || "N/A",
            description: p.description || "-",
            dueDateFormatted: new Date(p.dueDate).toLocaleDateString("pt-BR"),
          })),
        },
      ],
    });
  };

  const handleExportExcel = async () => {
    if (!data) return;
    const { exportToExcel } = await import("@/lib/report-export");
    await exportToExcel({
      fileName: `contas-pagar-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      sheets: [
        {
          name: "Resumo",
          data: [
            ["Indicador", "Valor"],
            ["Total a Pagar", data.summary.totalPayable],
            ["Vencidos", data.summary.overdue],
            ["A Vencer", data.summary.toPay],
            ["Ticket Médio", data.summary.averageTicket],
            ["Total de Fornecedores", data.summary.totalSuppliers],
            ["Fornecedores com Atraso", data.summary.overdueSuppliers],
            ["Total de Contas", data.summary.totalPayments],
            ["Contas Vencidas", data.summary.overduePayments],
          ],
        },
        {
          name: "Por Fornecedor",
          data: [
            ["Fornecedor", "Total", "Vencido", "Contas"],
            ...data.supplierBreakdown.map((s) => [
              s.supplierName,
              s.totalAmount,
              s.overdueAmount,
              s.paymentCount,
            ]),
          ],
        },
        {
          name: "Aging",
          data: [
            ["Categoria", "Quantidade", "Valor"],
            ...data.agingBreakdown.map((a) => [
              a.category,
              a.count,
              a.amount,
            ]),
          ],
        },
        {
          name: "Projeção Mensal",
          data: [
            ["Mês", "Quantidade", "Valor"],
            ...data.monthBreakdown.map((m) => [
              m.month,
              m.count,
              m.amount,
            ]),
          ],
        },
        {
          name: "Contas a Pagar",
          data: [
            ["Fornecedor", "Descrição", "Vencimento", "Valor", "Status", "Dias Atraso"],
            ...data.payables.map((p) => [
              p.supplierName || "N/A",
              p.description || "-",
              new Date(p.dueDate).toLocaleDateString("pt-BR"),
              p.amount,
              p.agingCategory,
              p.daysOverdue,
            ]),
          ],
        },
      ],
    });
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
          <h1 className="text-3xl font-bold">Contas a Pagar</h1>
          <p className="text-muted-foreground">
            Gestão de contas a pagar e fornecedores
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os fornecedores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os fornecedores</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Filtros Adicionais</Label>
              <div className="flex items-center space-x-2 h-10">
                <Checkbox
                  id="overdue"
                  checked={overdueOnly}
                  onCheckedChange={(checked) => setOverdueOnly(checked as boolean)}
                />
                <label
                  htmlFor="overdue"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Apenas vencidos
                </label>
              </div>
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
            <ExportButtons onExportPDF={handleExportPDF} onExportExcel={handleExportExcel} disabled={!data} />
          </div>

          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Total a Pagar"
              value={formatCurrency(data.summary.totalPayable)}
              icon={DollarSign}
              subtitle={`${data.summary.totalPayments} conta(s)`}
            />
            <KPICard
              title="Vencidos"
              value={formatCurrency(data.summary.overdue)}
              icon={AlertTriangle}
              subtitle={`${data.summary.overduePayments} conta(s)`}
            />
            <KPICard
              title="A Vencer"
              value={formatCurrency(data.summary.toPay)}
              icon={TrendingUp}
              subtitle={`${data.summary.totalPayments - data.summary.overduePayments} conta(s)`}
            />
            <KPICard
              title="Fornecedores"
              value={data.summary.totalSuppliers.toString()}
              icon={Building2}
              subtitle={`${data.summary.overdueSuppliers} com atraso`}
            />
          </div>

          {/* Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Aging Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Análise por Aging</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.agingBreakdown}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry: any) => `${entry.category}: ${formatCurrency(entry.amount)}`}
                    >
                      {data.agingBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly Projection */}
            <Card>
              <CardHeader>
                <CardTitle>Projeção Mensal</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.monthBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="amount" fill="#8884d8" name="Valor" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Supplier Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Breakdown por Fornecedor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Fornecedor</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-right p-2">Vencido</th>
                      <th className="text-right p-2">Contas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.supplierBreakdown.map((supplier) => (
                      <tr key={supplier.supplierId} className="border-b">
                        <td className="p-2">{supplier.supplierName}</td>
                        <td className="text-right p-2">{formatCurrency(supplier.totalAmount)}</td>
                        <td className="text-right p-2 text-red-600">
                          {formatCurrency(supplier.overdueAmount)}
                        </td>
                        <td className="text-right p-2">{supplier.paymentCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Payables List */}
          <Card>
            <CardHeader>
              <CardTitle>Contas a Pagar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Fornecedor</th>
                      <th className="text-left p-2">Descrição</th>
                      <th className="text-right p-2">Vencimento</th>
                      <th className="text-right p-2">Valor</th>
                      <th className="text-center p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payables.slice(0, 50).map((payable) => (
                      <tr key={payable.id} className="border-b">
                        <td className="p-2">{payable.supplierName || "N/A"}</td>
                        <td className="p-2">{payable.description || "-"}</td>
                        <td className="text-right p-2">
                          {new Date(payable.dueDate).toLocaleDateString("pt-BR")}
                          {payable.daysOverdue > 0 && (
                            <span className="text-red-600 text-xs ml-2">
                              ({payable.daysOverdue}d atraso)
                            </span>
                          )}
                        </td>
                        <td className="text-right p-2">{formatCurrency(payable.amount)}</td>
                        <td className="text-center p-2">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              payable.daysOverdue > 0
                                ? "bg-red-100 text-red-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {payable.agingCategory}
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
    </div>
  );
}
