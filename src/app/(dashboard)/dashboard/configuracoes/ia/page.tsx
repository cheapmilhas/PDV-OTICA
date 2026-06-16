"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, BotOff } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiUsageData {
  iaAvailable: boolean;
  iaEnabled: boolean;
  creditsUsed: number;
  creditsLimit: number | null;
  daily: { date: string; credits: number }[];
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  saving,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  saving?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled || saving}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-input"
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

// ─── Daily chart ──────────────────────────────────────────────────────────────

const ACCENT = "hsl(var(--primary))";

function DailyChart({ data }: { data: { date: string; credits: number }[] }) {
  const rawId = useId();
  const gradientId = `ia-optician-gradient-${rawId.replace(/:/g, "")}`;

  const chartData = data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    credits: d.credits,
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          vertical={false}
          stroke="hsl(var(--foreground))"
          strokeOpacity={0.06}
        />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <Tooltip
          cursor={{ stroke: ACCENT, strokeOpacity: 0.2 }}
          formatter={(value) => [
            `${(value as number).toLocaleString("pt-BR")} créditos`,
            "Créditos",
          ]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            color: "hsl(var(--popover-foreground))",
            fontSize: 12,
          }}
          labelStyle={{ color: "hsl(var(--muted-foreground))" }}
        />
        <Area
          type="monotone"
          dataKey="credits"
          stroke={ACCENT}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Credits meter ────────────────────────────────────────────────────────────

function CreditsMeter({
  used,
  limit,
}: {
  used: number;
  limit: number | null;
}) {
  const pct = limit != null && limit > 0 ? Math.min((used / limit) * 100, 100) : null;
  const usedStr = used.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const limitStr = limit != null ? limit.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between text-sm">
        <span className="text-muted-foreground">Uso este mês</span>
        {limitStr != null ? (
          <span className="font-medium text-foreground">
            {usedStr} <span className="text-muted-foreground font-normal">/ {limitStr} créditos</span>
          </span>
        ) : (
          <span className="font-medium text-foreground">{usedStr} créditos</span>
        )}
      </div>
      {pct != null && (
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-yellow-500" : "bg-primary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main page content ────────────────────────────────────────────────────────

function IaConfigContent() {
  const [data, setData] = useState<AiUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/company/ai-usage");
      if (!res.ok) throw new Error("Erro ao carregar dados de IA");
      const json = await res.json();
      setData(json.data as AiUsageData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleToggleEnabled(value: boolean) {
    if (!data) return;
    setSavingEnabled(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/company/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iaEnabled: value }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = (json as { error?: { message?: string } }).error?.message ?? "Erro ao salvar";
        setSaveError(msg);
        return;
      }
      await fetchData();
    } catch {
      setSaveError("Erro de rede ao salvar");
    } finally {
      setSavingEnabled(false);
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Não foi possível carregar os dados de IA</p>
            <p className="text-sm text-muted-foreground">{error ?? "Erro desconhecido"}</p>
            <button
              onClick={() => { setLoading(true); fetchData(); }}
              className="text-xs text-primary underline"
            >
              Tentar novamente
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── IA não disponível ────────────────────────────────────────────────────────

  if (!data.iaAvailable) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BotOff className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">IA não disponível</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              A Inteligência Artificial ainda não está habilitada para a sua ótica.
              Fale com o suporte para mais informações.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── IA disponível ────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          Inteligência Artificial
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure e acompanhe o uso de IA da sua ótica.
        </p>
      </div>

      {/* Toggle card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurações</CardTitle>
          <CardDescription>Ligue ou desligue a IA para a sua ótica.</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleRow
            label="IA ativa"
            description="Permite que a IA analise conversas e qualifique leads automaticamente."
            checked={data.iaEnabled}
            saving={savingEnabled}
            onChange={handleToggleEnabled}
          />
          {saveError && (
            <p className="text-xs text-destructive mt-2">{saveError}</p>
          )}
        </CardContent>
      </Card>

      {/* Créditos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Créditos de IA</CardTitle>
          <CardDescription>
            Cada ação de IA consome créditos. O limite é definido pelo suporte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreditsMeter used={data.creditsUsed} limit={data.creditsLimit} />
        </CardContent>
      </Card>

      {/* Gráfico diário */}
      {data.daily.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consumo diário (créditos)</CardTitle>
            <CardDescription>Histórico de uso neste mês.</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyChart data={data.daily} />
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {data.daily.length === 0 && data.creditsUsed === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhum consumo de IA registrado este mês.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IaConfigPage() {
  return (
    <ProtectedRoute permission="settings.edit">
      <IaConfigContent />
    </ProtectedRoute>
  );
}
