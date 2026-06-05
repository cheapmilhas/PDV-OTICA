"use client";

// src/app/admin/monitoramento/cockpit-client.tsx
//
// Cliente do cockpit: recebe a carga inicial server-side e faz polling de
// /api/admin/observability a cada 10s, atualizando o pulso (e o restante) sem
// recarregar a página. Tipos definidos localmente para não puxar lib/prisma ao
// bundle do client.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Database, Gauge, HardDrive,
  HelpCircle, RefreshCw, TrendingDown, Users, Wallet, Zap,
} from "lucide-react";
import { IssueCard, type Issue } from "./issue-card";
import type { BlueprintDescriptor } from "./action-modal";

type HealthStatus = "ok" | "degraded" | "down";

interface Pulse {
  status: HealthStatus;
  db: { status: HealthStatus; latencyMs: number | null };
  uptimeS: number;
  version: string;
  timestamp: string;
  reqCount: number;
  errorCount: number;
  errorRatePct: number;
  p50Ms: number | null;
  p95Ms: number | null;
  slowQueries: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRatePct: number | null;
  memoryRssMb: number;
  memoryHeapUsedMb: number;
}

interface Trends {
  windowHours: number;
  sampleCount: number;
  reqCount: number;
  errorCount: number;
  errorRatePct: number;
  p50Ms: number | null;
  p95Ms: number | null;
  slowQueries: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRatePct: number | null;
}

interface ClientHealth {
  totalCompanies: number;
  activeCompanies: number;
  mrrAtRisk: { mrrAtRiskCents: number; atRiskCount: number };
  overdue: { overdueCount: number; overdueTotalCents: number };
  categories: { CRITICAL: number; AT_RISK: number; HEALTHY: number; THRIVING: number; UNKNOWN: number };
}

interface Payload {
  pulse: Pulse;
  trends: Trends;
  clientHealth: ClientHealth;
  issues: Issue[];
}

const POLL_MS = 10_000;

export function CockpitClient({ initial }: { initial: Payload }) {
  const [data, setData] = useState<Payload>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>("agora");
  const [tab, setTab] = useState<"overview" | "resolve">("overview");
  const [blueprints, setBlueprints] = useState<Record<string, BlueprintDescriptor>>({});
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Carrega os descritores de blueprint uma vez (filtrados por role pelo endpoint).
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/actions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => {
        if (!alive) return;
        const map: Record<string, BlueprintDescriptor> = {};
        for (const bp of json.data ?? []) map[bp.id] = bp;
        setBlueprints(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/observability", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setData(json.data);
          setLastUpdate(new Date().toLocaleTimeString("pt-BR"));
        }
      }
    } catch {
      // polling é best-effort; mantém o último estado bom.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    timer.current = setInterval(refresh, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  const { pulse, trends, clientHealth } = data;
  const issues = data.issues ?? [];
  const criticalCount = issues.filter((i) => i.severity === "critical").length;

  return (
    <div className="space-y-6">
      <StatusBanner pulse={pulse} lastUpdate={lastUpdate} refreshing={refreshing} onRefresh={refresh} />

      <div className="flex items-center gap-2 border-b border-gray-800">
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")} label="Visão geral" />
        <TabBtn active={tab === "resolve"} onClick={() => setTab("resolve")} label="Resolução" badge={issues.length} critical={criticalCount > 0} />
      </div>

      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SystemColumn pulse={pulse} trends={trends} />
          <ClientColumn clientHealth={clientHealth} />
        </div>
      ) : (
        <ResolveTab issues={issues} blueprints={blueprints} onResolved={refresh} />
      )}
    </div>
  );
}

// ─── Faixa de status ──────────────────────────────────────────────────────────

const STATUS_META: Record<HealthStatus, { label: string; dot: string; ring: string; text: string }> = {
  ok: { label: "Operacional", dot: "bg-green-400", ring: "border-green-500/30 bg-green-500/10", text: "text-green-300" },
  degraded: { label: "Degradado", dot: "bg-amber-400", ring: "border-amber-500/30 bg-amber-500/10", text: "text-amber-300" },
  down: { label: "Fora do ar", dot: "bg-red-400", ring: "border-red-500/30 bg-red-500/10", text: "text-red-300" },
};

function StatusBanner({ pulse, lastUpdate, refreshing, onRefresh }: { pulse: Pulse; lastUpdate: string; refreshing: boolean; onRefresh: () => void }) {
  const meta = STATUS_META[pulse.status];
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border px-5 py-4 ${meta.ring}`}>
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3">
          {pulse.status === "ok" && (
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${meta.dot}`} />
          )}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${meta.dot}`} />
        </span>
        <div>
          <p className={`text-lg font-semibold ${meta.text}`}>Sistema {meta.label}</p>
          <p className="text-xs text-gray-400">
            Build {pulse.version} · uptime {formatUptime(pulse.uptimeS)}
          </p>
        </div>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        Atualizado {lastUpdate}
      </button>
    </div>
  );
}

// ─── Coluna do Sistema ──────────────────────────────────────────────────────────

function SystemColumn({ pulse, trends }: { pulse: Pulse; trends: Trends }) {
  return (
    <section className="space-y-4">
      <ColumnHeader icon={Activity} title="Sistema" subtitle="Pulso ao vivo · tendências 24h" />

      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={Database}
          label="Banco de dados"
          value={pulse.db.latencyMs !== null ? `${pulse.db.latencyMs}ms` : "—"}
          tone={pulse.db.status === "ok" ? "good" : pulse.db.status === "degraded" ? "warn" : "bad"}
          statusText={pulse.db.status === "ok" ? "Respondendo rápido" : pulse.db.status === "degraded" ? "Está lento" : "Sem resposta"}
          tip="Tempo que o banco leva para responder. Abaixo de 500ms é saudável."
          hint={statusLabel(pulse.db.status)}
        />
        <MetricCard
          icon={Zap}
          label="Velocidade das telas"
          value={pulse.p95Ms !== null ? `${pulse.p95Ms}ms` : "—"}
          tone={tonePctLatency(pulse.p95Ms)}
          statusText={tonePctLatency(pulse.p95Ms) === "good" ? "Telas abrindo rápido" : tonePctLatency(pulse.p95Ms) === "warn" ? "Um pouco lento" : tonePctLatency(pulse.p95Ms) === "bad" ? "Muito lento" : undefined}
          tip="Quanto tempo as telas levam para carregar para os usuários."
          hint={pulse.p50Ms !== null ? `p50 ${pulse.p50Ms}ms · p95` : "sem amostras"}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Taxa de erro"
          value={`${pulse.errorRatePct}%`}
          tone={pulse.errorRatePct >= 5 ? "bad" : pulse.errorRatePct > 0 ? "warn" : "good"}
          statusText={pulse.errorRatePct >= 5 ? "Muitos erros" : pulse.errorRatePct > 0 ? "Poucos erros" : "Nenhum erro"}
          tip="Porcentagem de ações que falharam. O ideal é 0%."
          hint={`${pulse.errorCount} de ${pulse.reqCount} req`}
        />
        <MetricCard
          icon={HardDrive}
          label="Memória"
          value={`${pulse.memoryRssMb}MB`}
          tone="neutral"
          statusText="Uso normal"
          tip="Quanta memória o servidor está usando agora."
          hint={`heap ${pulse.memoryHeapUsedMb}MB`}
        />
        <MetricCard
          icon={Gauge}
          label="Cache"
          value={pulse.cacheHitRatePct !== null ? `${pulse.cacheHitRatePct}%` : "—"}
          tone={pulse.cacheHitRatePct === null ? "neutral" : pulse.cacheHitRatePct >= 80 ? "good" : "warn"}
          statusText={pulse.cacheHitRatePct === null ? "Sem dados ainda" : pulse.cacheHitRatePct >= 80 ? "Funcionando bem" : "Pode melhorar"}
          tip="O cache acelera o sistema reaproveitando dados. Quanto maior, melhor."
          hint={`${pulse.cacheHits} hits · ${pulse.cacheMisses} miss`}
        />
        <MetricCard
          icon={TrendingDown}
          label="Consultas lentas"
          value={`${pulse.slowQueries}`}
          tone={pulse.slowQueries > 0 ? "warn" : "good"}
          statusText={pulse.slowQueries > 0 ? "Há consultas lentas" : "Nenhuma consulta lenta"}
          tip="Consultas ao banco que demoraram mais que o esperado."
          hint="nesta instância"
        />
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Tendências da frota · {trends.windowHours}h
        </p>
        {trends.sampleCount === 0 ? (
          <p className="text-sm text-gray-500">
            Sem amostras ainda. As tendências aparecem conforme a frota recebe tráfego
            (flush a cada 5 min).
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-center">
            <TrendStat label="Requests" value={trends.reqCount.toLocaleString("pt-BR")} />
            <TrendStat label="Erros" value={`${trends.errorRatePct}%`} />
            <TrendStat label="p95 médio" value={trends.p95Ms !== null ? `${trends.p95Ms}ms` : "—"} />
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Coluna dos Clientes ────────────────────────────────────────────────────────

function ClientColumn({ clientHealth }: { clientHealth: ClientHealth }) {
  const cat = clientHealth.categories;
  return (
    <section className="space-y-4">
      <ColumnHeader icon={Users} title="Clientes" subtitle="Saúde da base · receita em risco" />

      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={Wallet}
          label="MRR em risco"
          value={formatBRL(clientHealth.mrrAtRisk.mrrAtRiskCents)}
          tone={clientHealth.mrrAtRisk.mrrAtRiskCents > 0 ? "warn" : "good"}
          statusText={clientHealth.mrrAtRisk.mrrAtRiskCents > 0 ? "Há receita em risco" : "Nenhuma receita em risco"}
          tip="Valor mensal de assinaturas que podem ser perdidas (suspensas/atrasadas)."
          hint={`${clientHealth.mrrAtRisk.atRiskCount} assinatura(s)`}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Inadimplência"
          value={formatBRL(clientHealth.overdue.overdueTotalCents)}
          tone={clientHealth.overdue.overdueCount > 0 ? "bad" : "good"}
          statusText={clientHealth.overdue.overdueCount > 0 ? "Há faturas vencidas" : "Ninguém devendo"}
          tip="Total de faturas vencidas e não pagas."
          hint={`${clientHealth.overdue.overdueCount} fatura(s) vencida(s)`}
        />
        <MetricCard
          icon={Users}
          label="Empresas ativas"
          value={`${clientHealth.activeCompanies}`}
          tone="neutral"
          statusText="Clientes usando o sistema"
          tip="Empresas com acesso liberado."
          hint={`${clientHealth.totalCompanies} no total`}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Saudáveis+"
          value={`${cat.HEALTHY + cat.THRIVING}`}
          tone="good"
          statusText="Clientes saudáveis"
          tip="Clientes com boa saúde (engajamento e pagamento em dia)."
          hint={`${cat.CRITICAL + cat.AT_RISK} precisam de atenção`}
        />
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Distribuição de saúde
        </p>
        <CategoryBar categories={cat} />
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <CategoryLegend color="bg-red-400" label="Crítico" value={cat.CRITICAL} />
          <CategoryLegend color="bg-amber-400" label="Em risco" value={cat.AT_RISK} />
          <CategoryLegend color="bg-green-400" label="Saudável" value={cat.HEALTHY} />
          <CategoryLegend color="bg-indigo-400" label="Excelente" value={cat.THRIVING} />
          {cat.UNKNOWN > 0 && <CategoryLegend color="bg-gray-600" label="Sem cálculo" value={cat.UNKNOWN} />}
        </div>
      </div>
    </section>
  );
}

// ─── Componentes pequenos ─────────────────────────────────────────────────────

function ColumnHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-5 w-5 text-gray-400" />
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </div>
  );
}

const TONE: Record<string, { value: string; icon: string; border: string }> = {
  good: { value: "text-green-300", icon: "text-green-400", border: "border-gray-800" },
  warn: { value: "text-amber-300", icon: "text-amber-400", border: "border-amber-500/20" },
  bad: { value: "text-red-300", icon: "text-red-400", border: "border-red-500/20" },
  neutral: { value: "text-white", icon: "text-gray-400", border: "border-gray-800" },
};

function MetricCard({ icon: Icon, label, value, tone, hint, statusText, tip }: { icon: React.ElementType; label: string; value: string; tone: keyof typeof TONE; hint?: string; statusText?: string; tip?: string }) {
  const t = TONE[tone];
  return (
    <div className={`rounded-xl border bg-gray-900/40 p-4 ${t.border}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className={`h-4 w-4 ${t.icon}`} />
        <span className="text-xs font-medium text-gray-400">{label}</span>
        {tip && (
          <span className="cursor-help" title={tip} aria-label={tip}>
            <HelpCircle className="h-3.5 w-3.5 text-gray-600 hover:text-gray-400" />
          </span>
        )}
      </div>
      {statusText && <p className={`text-base font-semibold ${t.value}`}>{statusText}</p>}
      <p className={`text-2xl font-bold tabular-nums ${statusText ? "text-gray-300" : t.value}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function TrendStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xl font-bold tabular-nums text-white">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function CategoryBar({ categories }: { categories: ClientHealth["categories"] }) {
  const total =
    categories.CRITICAL + categories.AT_RISK + categories.HEALTHY + categories.THRIVING + categories.UNKNOWN;
  if (total === 0) return <p className="text-sm text-gray-500">Nenhuma empresa cadastrada.</p>;
  const segs = [
    { v: categories.CRITICAL, c: "bg-red-400" },
    { v: categories.AT_RISK, c: "bg-amber-400" },
    { v: categories.HEALTHY, c: "bg-green-400" },
    { v: categories.THRIVING, c: "bg-indigo-400" },
    { v: categories.UNKNOWN, c: "bg-gray-600" },
  ].filter((s) => s.v > 0);
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-800">
      {segs.map((s, i) => (
        <div key={i} className={s.c} style={{ width: `${(s.v / total) * 100}%` }} />
      ))}
    </div>
  );
}

function CategoryLegend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-gray-400">{label}</span>
      <span className="ml-auto font-semibold tabular-nums text-gray-300">{value}</span>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusLabel(s: HealthStatus): string {
  return s === "ok" ? "saudável" : s === "degraded" ? "lento" : "indisponível";
}

function tonePctLatency(p95: number | null): keyof typeof TONE {
  if (p95 === null) return "neutral";
  if (p95 >= 2000) return "bad";
  if (p95 >= 800) return "warn";
  return "good";
}

// ─── Abas ─────────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, label, badge, critical }: { active: boolean; onClick: () => void; label: string; badge?: number; critical?: boolean }) {
  return (
    <button onClick={onClick} className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${active ? "text-white" : "text-gray-400 hover:text-gray-200"}`}>
      {label}
      {badge != null && badge > 0 && (
        <span className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${critical ? "bg-red-500/20 text-red-300" : "bg-gray-700 text-gray-300"}`}>{badge}</span>
      )}
      {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-indigo-500" />}
    </button>
  );
}

function ResolveTab({ issues, blueprints, onResolved }: { issues: Issue[]; blueprints: Record<string, BlueprintDescriptor>; onResolved: () => void }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-8 text-center">
        <p className="text-lg font-semibold text-green-300">Tudo certo! 🎉</p>
        <p className="mt-1 text-sm text-gray-400">Nenhum problema precisa da sua atenção agora.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {issues.map((i) => (
        <IssueCard key={i.id} issue={i} blueprints={blueprints} onResolved={onResolved} />
      ))}
    </div>
  );
}
