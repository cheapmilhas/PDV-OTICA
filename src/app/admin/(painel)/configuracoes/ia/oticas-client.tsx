"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from "lucide-react";
import { KPICard } from "@/components/admin/KPICard";
import { EmptyState } from "@/components/admin/EmptyState";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { DollarSign, TrendingUp, Building2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverviewRow {
  companyId: string;
  companyName: string;
  iaAvailable: boolean;
  iaEnabled: boolean;
  iaMonthlyTokenLimit: number | null;
  markupPercentOverride: number | null;
  totalTokens: number;
  totalCostUsd: number;
  costBrlReal: number;
  markupPercent: number;
  priceBrl: number;
  lucroBrl: number;
}

type SortKey = "companyName" | "costBrlReal" | "priceBrl" | "lucroBrl" | "totalTokens" | "markupPercent";
type SortDir = "asc" | "desc";

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  disabled,
  saving,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  saving?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || saving}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-primary" : "bg-input"
      }`}
    >
      <span
        className={`pointer-events-none block h-3.5 w-3.5 rounded-full bg-background shadow-sm ring-0 transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ─── Sortable header ──────────────────────────────────────────────────────────

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === col;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          active ? "text-foreground" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        {active ? (
          sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function OticaRow({
  row,
  onPatch,
}: {
  row: OverviewRow;
  onPatch: (
    companyId: string,
    body: Partial<{
      iaAvailable: boolean;
      iaEnabled: boolean;
      iaMonthlyTokenLimit: number | null;
      markupPercentOverride: number | null;
    }>
  ) => Promise<void>;
}) {
  const [savingAvailable, setSavingAvailable] = useState(false);
  const [savingEnabled, setSavingEnabled] = useState(false);

  // Inputs inline (draft) — sincronizados quando a linha muda após refetch.
  const [markupDraft, setMarkupDraft] = useState(
    row.markupPercentOverride != null ? String(row.markupPercentOverride) : ""
  );
  const [quotaDraft, setQuotaDraft] = useState(
    row.iaMonthlyTokenLimit != null ? String(row.iaMonthlyTokenLimit) : ""
  );
  const [savingMarkup, setSavingMarkup] = useState(false);
  const [savingQuota, setSavingQuota] = useState(false);

  useEffect(() => {
    setMarkupDraft(row.markupPercentOverride != null ? String(row.markupPercentOverride) : "");
  }, [row.markupPercentOverride]);
  useEffect(() => {
    setQuotaDraft(row.iaMonthlyTokenLimit != null ? String(row.iaMonthlyTokenLimit) : "");
  }, [row.iaMonthlyTokenLimit]);

  // onPatch já mostra o toast de erro; aqui só engolimos o rethrow (evita
  // unhandled rejection no onClick) e devolvemos o estado de "salvando".
  async function toggleAvailable(v: boolean) {
    setSavingAvailable(true);
    try {
      await onPatch(row.companyId, { iaAvailable: v });
    } catch {
      /* toast já exibido em onPatch */
    } finally {
      setSavingAvailable(false);
    }
  }
  async function toggleEnabled(v: boolean) {
    setSavingEnabled(true);
    try {
      await onPatch(row.companyId, { iaEnabled: v });
    } catch {
      /* toast já exibido em onPatch */
    } finally {
      setSavingEnabled(false);
    }
  }

  const markupDirty = markupDraft.trim() !== (row.markupPercentOverride != null ? String(row.markupPercentOverride) : "");
  const quotaDirty = quotaDraft.trim() !== (row.iaMonthlyTokenLimit != null ? String(row.iaMonthlyTokenLimit) : "");

  async function saveMarkup() {
    const trimmed = markupDraft.trim();
    let override: number | null;
    if (trimmed === "") {
      override = null;
    } else {
      const parsed = parseFloat(trimmed);
      if (isNaN(parsed)) {
        toast.error("Margem inválida. Use um número (negativo = subsídio) ou deixe em branco para o global.");
        return;
      }
      override = parsed;
    }
    setSavingMarkup(true);
    try {
      await onPatch(row.companyId, { markupPercentOverride: override });
    } catch {
      /* toast já exibido em onPatch */
    } finally {
      setSavingMarkup(false);
    }
  }

  async function saveQuota() {
    const trimmed = quotaDraft.trim();
    let limit: number | null;
    if (trimmed === "") {
      // Vazio = ilimitado. NOTA: 0 NÃO é "ilimitado" — é um teto de zero tokens
      // (corta a IA da ótica). Só o campo vazio remove a cota.
      limit = null;
    } else {
      const parsed = parseInt(trimmed, 10);
      if (isNaN(parsed) || parsed < 0) {
        toast.error("Cota inválida. Use um número ≥ 0, ou deixe em branco para ilimitado.");
        return;
      }
      limit = parsed;
    }
    setSavingQuota(true);
    try {
      await onPatch(row.companyId, { iaMonthlyTokenLimit: limit });
    } catch {
      /* toast já exibido em onPatch */
    } finally {
      setSavingQuota(false);
    }
  }

  return (
    <TableRow>
      {/* Ótica */}
      <TableCell>
        <Link
          href={`/admin/clientes/${row.companyId}`}
          className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors"
        >
          {row.companyName}
          <ExternalLink className="h-3 w-3 opacity-50" />
        </Link>
      </TableCell>

      {/* Disponível / Ativa */}
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-0.5">
            <Toggle
              label={`Disponível — ${row.companyName}`}
              checked={row.iaAvailable}
              saving={savingAvailable}
              onChange={toggleAvailable}
            />
            <span className="text-[10px] text-muted-foreground">Dispon.</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Toggle
              label={`Ativa — ${row.companyName}`}
              checked={row.iaEnabled}
              disabled={!row.iaAvailable}
              saving={savingEnabled}
              onChange={toggleEnabled}
            />
            <span className="text-[10px] text-muted-foreground">Ativa</span>
          </div>
        </div>
      </TableCell>

      {/* Gasto (custo real) */}
      <TableCell className="text-right tabular-nums">{formatCurrency(row.costBrlReal)}</TableCell>

      {/* Margem efetiva + override inline */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          <input
            type="number"
            step="1"
            value={markupDraft}
            onChange={(e) => setMarkupDraft(e.target.value)}
            placeholder={`${row.markupPercent}% (global)`}
            title={`Margem efetiva: ${row.markupPercent}%${row.markupPercentOverride == null ? " (global)" : " (override)"}`}
            className="w-20 px-2 py-1 bg-background border border-input rounded-md text-xs text-right text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">%</span>
          <Button
            size="sm"
            variant={markupDirty ? "default" : "ghost"}
            disabled={!markupDirty || savingMarkup}
            onClick={saveMarkup}
            className="h-7 px-2"
          >
            {savingMarkup ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </TableCell>

      {/* Preço cobrado */}
      <TableCell className="text-right tabular-nums">{formatCurrency(row.priceBrl)}</TableCell>

      {/* Lucro / subsídio */}
      <TableCell className="text-right tabular-nums">
        <span className={row.lucroBrl < 0 ? "text-rose-600" : "text-emerald-600"}>
          {formatCurrency(row.lucroBrl)}
        </span>
      </TableCell>

      {/* Uso / cota */}
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground tabular-nums">
            {row.totalTokens.toLocaleString("pt-BR")} tok
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="0"
              value={quotaDraft}
              onChange={(e) => setQuotaDraft(e.target.value)}
              placeholder="ilimitado"
              title="Cota mensal de tokens (vazio = ilimitado)"
              className="w-28 px-2 py-1 bg-background border border-input rounded-md text-xs text-right text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              size="sm"
              variant={quotaDirty ? "default" : "ghost"}
              disabled={!quotaDirty || savingQuota}
              onClick={saveQuota}
              className="h-7 px-2"
            >
              {savingQuota ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function OticasClient() {
  const [rows, setRows] = useState<OverviewRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lucroBrl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/ai-companies-overview");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Erro ao carregar as óticas");
      }
      const json = (await res.json()) as { data: OverviewRow[] };
      setRows(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Edição na linha: PATCH a rota existente + refetch (números do mês recalculam).
  const handlePatch = useCallback(
    async (
      companyId: string,
      body: Partial<{
        iaAvailable: boolean;
        iaEnabled: boolean;
        iaMonthlyTokenLimit: number | null;
        markupPercentOverride: number | null;
      }>
    ) => {
      const res = await fetch(`/api/admin/companies/${companyId}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = (j as { error?: string }).error ?? "Erro ao salvar";
        toast.error(msg);
        throw new Error(msg);
      }
      toast.success("Ótica atualizada.");
      await fetchData();
    },
    [fetchData]
  );

  function handleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(k);
      // Nome ordena asc por padrão; números desc (maiores primeiro).
      setSortDir(k === "companyName" ? "asc" : "desc");
    }
  }

  const totals = useMemo(() => {
    const list = rows ?? [];
    return {
      count: list.length,
      activeCount: list.filter((r) => r.iaEnabled).length,
      costBrlReal: list.reduce((s, r) => s + r.costBrlReal, 0),
      priceBrl: list.reduce((s, r) => s + r.priceBrl, 0),
      lucroBrl: list.reduce((s, r) => s + r.lucroBrl, 0),
    };
  }, [rows]);

  const visible = useMemo(() => {
    const list = rows ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q ? list.filter((r) => r.companyName.toLowerCase().includes(q)) : list;
    const dir = sortDir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "companyName") {
        return a.companyName.localeCompare(b.companyName, "pt-BR") * dir;
      }
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [rows, query, sortKey, sortDir]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Sparkles}
            message={error}
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

  return (
    <div className="space-y-5 p-6">
      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={Building2}
          label="Óticas com IA"
          value={`${totals.count}`}
          hint={`${totals.activeCount} com IA ativa`}
        />
        <KPICard
          icon={DollarSign}
          label="Custo real (mês)"
          value={formatCurrency(totals.costBrlReal)}
          hint="Soma paga ao provedor (sem margem)"
        />
        <KPICard
          icon={DollarSign}
          label="Preço cobrado (mês)"
          value={formatCurrency(totals.priceBrl)}
          hint="Soma cobrada das óticas"
        />
        <KPICard
          icon={TrendingUp}
          label={totals.lucroBrl < 0 ? "Subsídio (mês)" : "Lucro (mês)"}
          value={formatCurrency(totals.lucroBrl)}
          hint="Preço cobrado − custo real"
        />
      </div>

      {/* Busca */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar ótica…"
          className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Tabela */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Sparkles}
            message={
              query.trim()
                ? "Nenhuma ótica encontrada para a busca."
                : "Nenhuma ótica com IA disponível ou ativa ainda."
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ResponsiveTable minWidth={920}>
            <TableHeader>
              <TableRow>
                <SortHeader label="Ótica" col="companyName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <TableHead>Status</TableHead>
                <SortHeader label="Gasto" col="costBrlReal" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Margem" col="markupPercent" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Preço" col="priceBrl" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Lucro" col="lucroBrl" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Uso / Cota" col="totalTokens" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <OticaRow key={row.companyId} row={row} onPatch={handlePatch} />
              ))}
            </TableBody>
          </ResponsiveTable>
        </div>
      )}
    </div>
  );
}
