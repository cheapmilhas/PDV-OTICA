"use client";

import { useState, useCallback } from "react";
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
import { Loader2, AlertTriangle, ArrowRight } from "lucide-react";

/**
 * Aba "Preview da regra nova" do Relatório de Comissões — Comissão Fase 2 / 3a.
 *
 * READ-ONLY: chama /api/reports/commissions/preview (que calcula na hora, sem
 * gravar) e mostra, por vendedor no MÊS escolhido: comissão ATUAL × NOVA × dif.
 * Deixa explícito que é PREVIEW e NÃO afeta pagamento.
 */

interface PreviewRow {
  userId: string;
  userName: string;
  current: string;
  proposed: string;
  diff: string;
  diffPercent: string | null;
  proposedDetail: {
    netSales: string;
    metaCommission: string;
    campaignBonus: string;
    appliedPercent: string;
  };
}
interface PreviewReport {
  year: number;
  month: number;
  rows: PreviewRow[];
  totals: { current: string; proposed: string; diff: string };
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const brl = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CommissionPreviewTab() {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<PreviewReport | null>(null);

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/commissions/preview?year=${year}&month=${month}`);
      const json = await res.json();
      if (json.success) {
        setReport(json.data);
      } else {
        toast({ title: "Erro", description: json.error ?? "Não foi possível gerar o preview", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Erro ao gerar o preview", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [year, month, toast]);

  const diffClass = (diff: string) => {
    const n = Number(diff);
    if (n > 0) return "text-green-600";
    if (n < 0) return "text-red-600";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      {/* Aviso: é só preview */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900">
          <strong>Isto é uma PRÉVIA — não afeta o pagamento.</strong> Mostra quanto cada vendedor
          receberia pela regra nova (metas por níveis + campanha) comparado ao que é pago hoje.
          Nada é gravado; o valor real continua sendo o da aba "Atual".
        </div>
      </div>

      {/* Seletor de mês (próprio — a regra nova é por mês calendário fechado) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mês para comparar</CardTitle>
          <CardDescription>
            A comissão nova depende do total do mês inteiro (% do nível atingido, retroativo),
            por isso a comparação é por mês calendário.
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
            <Button onClick={fetchPreview} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Comparar
            </Button>
          </div>
        </CardContent>
      </Card>

      {report && (
        <>
          {/* Totais */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total atual (pago hoje)</p>
                <p className="text-2xl font-bold">{brl(report.totals.current)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total pela regra nova</p>
                <p className="text-2xl font-bold">{brl(report.totals.proposed)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Diferença</p>
                <p className={`text-2xl font-bold ${diffClass(report.totals.diff)}`}>
                  {Number(report.totals.diff) >= 0 ? "+" : ""}{brl(report.totals.diff)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabela por vendedor */}
          <Card>
            <CardHeader>
              <CardTitle>
                {MONTHS[report.month - 1]}/{report.year} — por vendedor ({report.rows.length})
              </CardTitle>
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
                      <TableHead className="text-right">Atual</TableHead>
                      <TableHead className="text-right">Nova</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                      <TableHead className="text-right">Detalhe (nova)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((r) => (
                      <TableRow key={r.userId}>
                        <TableCell className="font-medium">{r.userName}</TableCell>
                        <TableCell className="text-right">{brl(r.current)}</TableCell>
                        <TableCell className="text-right font-medium">
                          <span className="inline-flex items-center gap-1">
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            {brl(r.proposed)}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${diffClass(r.diff)}`}>
                          {Number(r.diff) >= 0 ? "+" : ""}{brl(r.diff)}
                          {r.diffPercent !== null && (
                            <span className="block text-xs text-muted-foreground">
                              {Number(r.diff) >= 0 ? "+" : ""}{r.diffPercent}%
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          meta {brl(r.proposedDetail.metaCommission)} ({r.proposedDetail.appliedPercent}%)
                          <br />
                          campanha {brl(r.proposedDetail.campaignBonus)}
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
