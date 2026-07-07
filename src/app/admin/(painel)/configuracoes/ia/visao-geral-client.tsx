"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Sparkles, DollarSign, TrendingUp, Tag, Building2, Cpu } from "lucide-react";
import { KPICard } from "@/components/admin/KPICard";
import { EmptyState } from "@/components/admin/EmptyState";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { AiCostTrendChart, type AiCostTrendPoint } from "@/components/admin/AiCostTrendChart";
import { formatCurrency } from "@/lib/utils";
import { formatTrend, type Trend } from "@/lib/admin-metrics";

// ─── Types (espelham o retorno da rota) ───────────────────────────────────────

interface FeatureCost {
  feature: string;
  totalTokens: number;
  costUsd: number;
  costBrl: number;
}

interface Overview {
  costBrlReal: number;
  priceBrl: number;
  profitBrl: number;
  costTrend: Trend;
  profitTrend: Trend;
  activeShops: number;
  availableShops: number;
  internal: { totalTokens: number; costUsd: number; costBrl: number };
  byFeature: FeatureCost[];
}

interface Payload {
  overview: Overview;
  trend: AiCostTrendPoint[];
}

// Rótulos amigáveis das features conhecidas; desconhecidas caem no id cru.
const FEATURE_LABELS: Record<string, string> = {
  lead_qualification: "Qualificação de leads",
  lens_advisor: "Assistente de lentes",
  lens_advisor_playground: "Playground de lentes",
  ocr_prescription: "OCR de receita",
  whatsapp_copilot: "Copiloto WhatsApp",
  audio_transcription: "Transcrição de áudio",
  crm: "CRM (assistente)",
  bi_analytics: "BI / Analytics",
  campaigns: "Campanhas",
  cash_flow: "Fluxo de caixa",
  dre_report: "DRE",
  bank_reconciliation: "Conciliação bancária",
  branch_comparison: "Comparação de filiais",
};

function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

// ─── Trend badge (para os KPICards) ───────────────────────────────────────────

function trendToKpi(trend: Trend): { direction: "up" | "down"; label: string } | undefined {
  if (trend.direction === "flat") return undefined;
  return { direction: trend.direction, label: formatTrend(trend) };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function VisaoGeralClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/ai-cost-overview");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Erro ao carregar o resumo de IA");
      }
      const json = (await res.json()) as { data: Payload };
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Sparkles}
            message={error ?? "Não foi possível carregar o resumo de IA"}
            action={
              <Button variant="link" size="sm" onClick={() => { setLoading(true); fetchData(); }}>
                Tentar novamente
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const { overview, trend } = data;
  const totalFeatureTokens = overview.byFeature.reduce((s, f) => s + f.totalTokens, 0);
  const hasTrend = trend.some((p) => p.costBrl > 0 || p.profitBrl > 0);

  return (
    <div className="space-y-5 p-6">
      {/* ── Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={DollarSign}
          label="Custo real (mês)"
          value={formatCurrency(overview.costBrlReal)}
          hint="Pago ao provedor (todas as óticas)"
          trend={trendToKpi(overview.costTrend)}
        />
        <KPICard
          icon={Tag}
          label="Preço cobrado (mês)"
          value={formatCurrency(overview.priceBrl)}
          hint="Soma cobrada das óticas"
        />
        <KPICard
          icon={TrendingUp}
          label={overview.profitBrl < 0 ? "Subsídio (mês)" : "Lucro (mês)"}
          value={formatCurrency(overview.profitBrl)}
          hint="Preço cobrado − custo real"
          trend={trendToKpi(overview.profitTrend)}
        />
        <KPICard
          icon={Building2}
          label="Óticas com IA ativa"
          value={`${overview.activeShops}`}
          hint={`${overview.availableShops} com IA disponível`}
        />
      </div>

      {/* ── Tendência 6 meses ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <h2 className="text-sm font-semibold text-foreground">Custo × lucro (6 meses)</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Lucro histórico estimado pela margem global atual (não há histórico de margem por ótica).
        </p>
        {hasTrend ? (
          <div className="h-56">
            <AiCostTrendChart data={trend} />
          </div>
        ) : (
          <EmptyState icon={TrendingUp} message="Sem consumo de IA nos últimos 6 meses." />
        )}
      </div>

      {/* ── Consumo interno ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard
          icon={Cpu}
          label="Consumo interno / playground"
          value={formatCurrency(overview.internal.costBrl)}
          hint={`${overview.internal.totalTokens.toLocaleString("pt-BR")} tokens — custo do super admin (sem ótica)`}
        />
      </div>

      {/* ── Custo por feature ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Custo por funcionalidade (mês)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Onde o gasto de IA está concentrado (inclui consumo interno).
          </p>
        </div>
        {overview.byFeature.length === 0 ? (
          <EmptyState icon={Sparkles} message="Nenhum consumo de IA registrado este mês." />
        ) : (
          <ResponsiveTable minWidth={520}>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionalidade</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">% dos tokens</TableHead>
                <TableHead className="text-right">Custo real</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.byFeature.map((f) => {
                const pct = totalFeatureTokens > 0 ? ((f.totalTokens / totalFeatureTokens) * 100).toFixed(1) : "0.0";
                return (
                  <TableRow key={f.feature}>
                    <TableCell className="text-foreground">{featureLabel(f.feature)}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {f.totalTokens.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{pct}%</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">{formatCurrency(f.costBrl)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </ResponsiveTable>
        )}
      </div>
    </div>
  );
}
