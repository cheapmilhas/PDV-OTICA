"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DollarSign } from "lucide-react";

/**
 * Tela de Comissões — REGRA NOVA (modo "new" do kill-switch COMMISSION_ENGINE).
 *
 * Comissão do MÊS por vendedor pelo motor (níveis + campanha). READ-ONLY: calcula
 * na hora, nada gravado, SEM lifecycle (aprovar/pagar) e SEM aviso de prévia —
 * é a tela oficial. Substituiu a apuração antiga por tabela Commission.
 */

interface Row {
  userId: string;
  userName: string;
  total: string;
  netSales: string;
  metaCommission: string;
  campaignBonus: string;
  appliedPercent: string;
}
interface Report {
  year: number;
  month: number;
  rows: Row[];
  total: string;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const brl = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CommissionNewView() {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/commissions/monthly?year=${year}&month=${month}`);
      const json = await res.json();
      if (json.success) {
        setReport(json.data);
      } else {
        toast({ title: "Erro", description: json.error ?? "Não foi possível gerar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Erro ao gerar o relatório", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [year, month, toast]);

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <DollarSign className="h-7 w-7" />
          Comissões
        </h1>
        <p className="text-muted-foreground">
          Comissão por vendedor no mês (metas por níveis + campanha)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mês</CardTitle>
          <CardDescription>
            A comissão é apurada por mês calendário — o nível de meta depende do total do mês.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Mês</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ano</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={fetchReport} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar
            </Button>
          </div>
        </CardContent>
      </Card>

      {report && (
        <>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Total de comissões — {MONTHS[report.month - 1]}/{report.year}
              </p>
              <p className="text-3xl font-bold">{brl(report.total)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Por vendedor ({report.rows.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {report.rows.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  Nenhum vendedor com vendas nesse mês.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Vendido (líq.)</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                      <TableHead className="text-right">Detalhe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((r) => (
                      <TableRow key={r.userId}>
                        <TableCell className="font-medium">{r.userName}</TableCell>
                        <TableCell className="text-right">{brl(r.netSales)}</TableCell>
                        <TableCell className="text-right font-semibold">{brl(r.total)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          meta {brl(r.metaCommission)} ({r.appliedPercent}%)
                          <br />
                          campanha {brl(r.campaignBonus)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
