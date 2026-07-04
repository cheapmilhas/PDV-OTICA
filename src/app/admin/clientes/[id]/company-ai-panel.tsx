"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { Loader2, Sparkles, Zap, DollarSign, Save, Percent, TrendingUp, Tag } from "lucide-react";
import { toast } from "sonner";
import { KPICard } from "@/components/admin/KPICard";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiSettings {
  iaAvailable: boolean;
  iaEnabled: boolean;
  iaMonthlyTokenLimit: number | null;
}

interface MonthlyUsage {
  totalTokens: number;
  totalCostUsd: number;
  byFeature: Record<string, { tokens: number; costUsd: number }>;
}

interface DailyPoint {
  date: string;
  tokens: number;
  costUsd: number;
}

interface AiUsageData {
  usage: MonthlyUsage;
  daily: DailyPoint[];
  costBrlReal: number;
  markupPercent: number;
  priceBrl: number;
  lucroBrl: number;
  creditTokenFactor: number;
  settings: AiSettings | null;
}

interface CompanyAiPanelProps {
  companyId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACCENT = "hsl(var(--primary))";

function DailyChart({ data }: { data: DailyPoint[] }) {
  const rawId = useId();
  const gradientId = `ai-gradient-${rawId.replace(/:/g, "")}`;

  const chartData = data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    tokens: d.tokens,
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
          formatter={(value) => [`${(value as number).toLocaleString("pt-BR")} tokens`, "Tokens"]}
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
          dataKey="tokens"
          stroke={ACCENT}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export function CompanyAiPanel({ companyId }: CompanyAiPanelProps) {
  const [data, setData] = useState<AiUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Toggle saving state per field
  const [savingAvailable, setSavingAvailable] = useState(false);
  const [savingEnabled, setSavingEnabled] = useState(false);

  // Cota mensal input
  const [quotaInput, setQuotaInput] = useState("");
  const [savingQuota, setSavingQuota] = useState(false);

  // Margem override input
  const [markupInput, setMarkupInput] = useState("");
  const [savingMarkup, setSavingMarkup] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/admin/companies/${companyId}/ai-usage`);
      if (!res.ok) throw new Error("Erro ao carregar dados de IA");
      const json = await res.json();
      const aiData = json.data as AiUsageData;
      setData(aiData);
      // Sync quota input
      const limit = aiData.settings?.iaMonthlyTokenLimit;
      setQuotaInput(limit != null ? String(limit) : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function patchSettings(body: Partial<{ iaAvailable: boolean; iaEnabled: boolean; iaMonthlyTokenLimit: number | null; markupPercentOverride: number | null }>) {
    const res = await fetch(`/api/admin/companies/${companyId}/ai-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error((json as { error?: string }).error ?? "Erro ao salvar");
    }
  }

  async function handleToggleAvailable(value: boolean) {
    if (!data) return;
    setSavingAvailable(true);
    try {
      await patchSettings({ iaAvailable: value });
      await fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingAvailable(false);
    }
  }

  async function handleToggleEnabled(value: boolean) {
    if (!data) return;
    setSavingEnabled(true);
    try {
      await patchSettings({ iaEnabled: value });
      await fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingEnabled(false);
    }
  }

  async function handleSaveQuota() {
    if (!data) return;
    setSavingQuota(true);
    try {
      const trimmed = quotaInput.trim();
      const limit = trimmed === "" || trimmed === "0" ? null : parseInt(trimmed, 10);
      if (trimmed !== "" && trimmed !== "0" && (isNaN(limit!) || limit! < 0)) {
        toast.error("Cota inválida. Use um número positivo ou deixe em branco para ilimitado.");
        return;
      }
      await patchSettings({ iaMonthlyTokenLimit: limit });
      await fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingQuota(false);
    }
  }

  async function handleSaveMarkup() {
    if (!data) return;
    setSavingMarkup(true);
    try {
      const trimmed = markupInput.trim();
      let override: number | null;
      if (trimmed === "") {
        override = null;
      } else {
        const parsed = parseFloat(trimmed);
        if (isNaN(parsed)) {
          toast.error("Margem inválida. Use um número (negativo permitido = subsídio) ou deixe em branco para usar o global.");
          return;
        }
        override = parsed;
      }
      await patchSettings({ markupPercentOverride: override });
      setMarkupInput("");
      await fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingMarkup(false);
    }
  }

  // ── Loading / error ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Sparkles className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{error ?? "Não foi possível carregar dados de IA"}</p>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="mt-3 text-xs text-primary underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const { usage, daily, costBrlReal, markupPercent, priceBrl, lucroBrl, creditTokenFactor, settings } = data;
  const iaAvailable = settings?.iaAvailable ?? false;
  const iaEnabled = settings?.iaEnabled ?? false;
  const iaMonthlyTokenLimit = settings?.iaMonthlyTokenLimit ?? null;

  const creditLimit = iaMonthlyTokenLimit != null
    ? (iaMonthlyTokenLimit / creditTokenFactor).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
    : null;

  const featureRows = Object.entries(usage.byFeature).sort((a, b) => b[1].tokens - a[1].tokens);

  return (
    <div className="space-y-5">
      {/* ── Controles ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">Configurações de IA</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Controle de acesso e cota mensal de tokens para esta empresa.
        </p>

        <div className="divide-y divide-border">
          <ToggleRow
            label="Disponível"
            description="Libera o acesso à IA para esta empresa (master switch)"
            checked={iaAvailable}
            saving={savingAvailable}
            onChange={handleToggleAvailable}
          />
          <ToggleRow
            label="Ativa"
            description="A empresa pode ligar/desligar a IA nas próprias configurações"
            checked={iaEnabled}
            disabled={!iaAvailable}
            saving={savingEnabled}
            onChange={handleToggleEnabled}
          />
        </div>

        {/* Cota mensal */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm font-medium text-foreground mb-1">Cota mensal de tokens</p>
          <p className="text-xs text-muted-foreground mb-3">
            Deixe em branco para ilimitado. Fator: 1 crédito = {creditTokenFactor.toLocaleString("pt-BR")} tokens.
            {creditLimit && (
              <span className="ml-1">Equivale a <strong>{creditLimit}</strong> créditos.</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={quotaInput}
              onChange={(e) => setQuotaInput(e.target.value)}
              placeholder="Ex: 1000000  (vazio = ilimitado)"
              className="flex-1 px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleSaveQuota}
              disabled={savingQuota}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg disabled:opacity-50 transition-colors"
            >
              {savingQuota ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </button>
          </div>
          {iaMonthlyTokenLimit != null && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Cota atual: {iaMonthlyTokenLimit.toLocaleString("pt-BR")} tokens / mês
            </p>
          )}
        </div>

        {/* Margem override */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm font-medium text-foreground mb-1">
            Margem override (%) — vazio mantém o markup global atual
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Define uma margem específica para esta empresa. Negativo é permitido (subsídio).
            Salvar em branco remove o override e volta ao markup global.
            Margem efetiva atual: <strong>{markupPercent}%</strong>.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="1"
              value={markupInput}
              onChange={(e) => setMarkupInput(e.target.value)}
              placeholder="Ex: 50  (vazio = usa o global)"
              className="flex-1 px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleSaveMarkup}
              disabled={savingMarkup}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg disabled:opacity-50 transition-colors"
            >
              {savingMarkup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </button>
          </div>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard
          icon={Zap}
          label="Tokens (mês)"
          value={usage.totalTokens.toLocaleString("pt-BR")}
          hint="Total consumido no mês corrente"
        />
        <KPICard
          icon={DollarSign}
          label="Custo real (mês)"
          value={`R$ ${costBrlReal.toFixed(2)}`}
          hint="Custo bruto em R$ (sem margem)"
        />
        <KPICard
          icon={Percent}
          label="Margem"
          value={`${markupPercent}%`}
          hint="Margem efetiva aplicada (override ou global)"
        />
        <KPICard
          icon={Tag}
          label="Preço à ótica (mês)"
          value={`R$ ${priceBrl.toFixed(2)}`}
          hint="Valor cobrado da ótica (custo + margem)"
        />
        <KPICard
          icon={TrendingUp}
          label={lucroBrl < 0 ? "Subsídio (mês)" : "Lucro (mês)"}
          value={`R$ ${lucroBrl.toFixed(2)}`}
          hint={lucroBrl < 0 ? "Negativo = subsídio (custo > preço)" : "Preço cobrado − custo real"}
        />
      </div>

      {/* ── Consumo diário ─────────────────────────────────────────────────── */}
      {daily.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Consumo diário (tokens)</h2>
          <DailyChart data={daily} />
        </div>
      )}

      {/* ── Breakdown por feature ──────────────────────────────────────────── */}
      {featureRows.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Consumo por funcionalidade</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Funcionalidade</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">Tokens</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">% do total</th>
                </tr>
              </thead>
              <tbody>
                {featureRows.map(([feature, stats]) => {
                  const pct = usage.totalTokens > 0
                    ? ((stats.tokens / usage.totalTokens) * 100).toFixed(1)
                    : "0.0";
                  return (
                    <tr key={feature} className="border-b border-border last:border-0 hover:bg-muted transition-colors">
                      <td className="px-5 py-3 text-foreground font-mono text-xs">{feature}</td>
                      <td className="px-5 py-3 text-right text-foreground">{stats.tokens.toLocaleString("pt-BR")}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state when no usage */}
      {usage.totalTokens === 0 && daily.length === 0 && featureRows.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum consumo de IA registrado este mês.</p>
        </div>
      )}
    </div>
  );
}
