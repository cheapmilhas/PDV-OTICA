"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, BarChart3, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface BranchData {
  branchId: string;
  branchName: string;
  salesCount: number;
  salesTotal: number;
  avgTicket: number;
  osTotal: number;
  osDelivered: number;
  newCustomers: number;
  stockValue: number;
}

interface ComparisonData {
  branches: BranchData[];
  totals: BranchData;
  period: { start: string; end: string };
}

export default function ComparativoLojasPage() {
  return (
    <ProtectedRoute permission="reports.view">
      <ComparativoContent />
    </ProtectedRoute>
  );
}

function ComparativoContent() {
  const now = new Date();
  const [startDate, setStartDate] = useState(format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(now, "yyyy-MM-dd"));
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ startDate, endDate });
        const res = await fetch(`/api/reports/branch-comparison?${params}`);
        const result = await res.json();
        if (result.success) setData(result.data);
      } catch {
        toast.error("Erro ao carregar comparativo");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [startDate, endDate]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.branches.length < 2) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Comparativo entre Lojas</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              Este relatório requer pelo menos 2 filiais ativas.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const chartData = data.branches.map((b) => ({
    name: b.branchName,
    Faturamento: b.salesTotal,
    Vendas: b.salesCount,
    "Ticket Médio": b.avgTicket,
  }));

  const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Comparativo entre Lojas</h1>
          <p className="text-muted-foreground text-sm">Performance de cada filial no período</p>
        </div>
        <div className="flex items-center gap-2">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36" />
          </div>
        </div>
      </div>

      {/* Gráfico de faturamento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Faturamento por Loja</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="Faturamento" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tabela comparativa */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Detalhamento por Filial</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium">Métrica</th>
                  {data.branches.map((b) => (
                    <th key={b.branchId} className="text-right py-3 px-2 font-medium">
                      {b.branchName}
                    </th>
                  ))}
                  <th className="text-right py-3 px-2 font-bold bg-muted/50">Total</th>
                </tr>
              </thead>
              <tbody>
                <MetricRow label="Vendas" branches={data.branches} totals={data.totals} field="salesCount" />
                <MetricRow label="Faturamento" branches={data.branches} totals={data.totals} field="salesTotal" isCurrency />
                <MetricRow label="Ticket Médio" branches={data.branches} totals={data.totals} field="avgTicket" isCurrency />
                <MetricRow label="OS Criadas" branches={data.branches} totals={data.totals} field="osTotal" />
                <MetricRow label="OS Entregues" branches={data.branches} totals={data.totals} field="osDelivered" />
                <MetricRow label="Clientes Novos" branches={data.branches} totals={data.totals} field="newCustomers" />
                <MetricRow label="Estoque (valor)" branches={data.branches} totals={data.totals} field="stockValue" isCurrency />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricRow({
  label,
  branches,
  totals,
  field,
  isCurrency,
}: {
  label: string;
  branches: BranchData[];
  totals: BranchData;
  field: keyof BranchData;
  isCurrency?: boolean;
}) {
  const fmt = (v: number | string) =>
    isCurrency ? formatCurrency(Number(v)) : Number(v).toLocaleString("pt-BR");

  return (
    <tr className="border-b hover:bg-muted/30 transition-colors">
      <td className="py-2.5 px-2 font-medium">{label}</td>
      {branches.map((b) => (
        <td key={b.branchId} className="py-2.5 px-2 text-right tabular-nums">
          {fmt(b[field])}
        </td>
      ))}
      <td className="py-2.5 px-2 text-right font-bold bg-muted/50 tabular-nums">
        {fmt(totals[field])}
      </td>
    </tr>
  );
}
