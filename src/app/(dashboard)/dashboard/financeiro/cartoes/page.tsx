"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function CartoesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 2, 0);
    return d.toISOString().split("T")[0];
  });
  const [status, setStatus] = useState("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/finance/card-receivables?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar dados");
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusBadge = (s: string) => {
    if (s === "SETTLED") return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Recebido</Badge>;
    if (s === "OVERDUE") return <Badge variant="destructive">Vencido</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Previsão de Recebimento — Cartões</h1>
        <p className="text-muted-foreground">Controle das parcelas de cartão de crédito a receber</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label>Data inicial</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label>Data final</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="SETTLED">Recebido</SelectItem>
                  <SelectItem value="OVERDUE">Vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={fetchData} disabled={loading}>
              {loading ? "Carregando..." : "Filtrar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {data?.summary && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Previsto</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(data.summary.totalGross)}</p>
              <p className="text-xs text-muted-foreground">{data.summary.count} parcelas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Por Mês</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {Object.entries(data.summary.byMonth || {}).map(([month, total]) => (
                <div key={month} className="flex justify-between text-sm">
                  <span>{month}</span>
                  <span className="font-medium">{formatCurrency(total as number)}</span>
                </div>
              ))}
              {Object.keys(data.summary.byMonth || {}).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum dado</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Por Bandeira</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {Object.entries(data.summary.byBrand || {}).map(([brand, total]) => (
                <div key={brand} className="flex justify-between text-sm">
                  <span>{brand}</span>
                  <span className="font-medium">{formatCurrency(total as number)}</span>
                </div>
              ))}
              {Object.keys(data.summary.byBrand || {}).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum dado</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {data?.data?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma parcela encontrada no período.
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {data?.data?.length > 0 && (
        <Card>
          <CardContent className="pt-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-3 pr-4">Data Prevista</th>
                  <th className="text-left py-3 pr-4">Venda</th>
                  <th className="text-left py-3 pr-4">Parcela</th>
                  <th className="text-left py-3 pr-4">Bandeira</th>
                  <th className="text-left py-3 pr-4">NSU</th>
                  <th className="text-right py-3 pr-4">Valor Bruto</th>
                  <th className="text-left py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-4">{format(new Date(r.expectedDate), "dd/MM/yyyy", { locale: ptBR })}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.saleId.substring(0, 8)}</td>
                    <td className="py-2 pr-4">{r.installmentNumber}/{r.totalInstallments}</td>
                    <td className="py-2 pr-4">{r.cardBrand || "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.nsu || "—"}</td>
                    <td className="py-2 pr-4 text-right font-medium">{formatCurrency(r.grossAmount)}</td>
                    <td className="py-2">{statusBadge(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function CartoesPageWrapper() {
  return (
    <ProtectedRoute permission="financial.view">
      <CartoesPage />
    </ProtectedRoute>
  );
}
