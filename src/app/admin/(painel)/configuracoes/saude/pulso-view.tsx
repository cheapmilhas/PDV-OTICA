"use client";

import {
  HeartPulse,
  Database,
  Cloud,
  Bug,
  Clock,
  PlugZap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  EyeOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SystemHealthSnapshot, HealthState, HealthSignal } from "@/services/system-health.service";

/** Paleta dos 4 estados (design "O Pulso"): verde / âmbar / vermelho / cinza. */
const STATE_STYLES: Record<
  HealthState,
  { label: string; dot: string; text: string; bg: string; border: string; Icon: LucideIcon }
> = {
  healthy: {
    label: "Saudável",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-900",
    Icon: CheckCircle2,
  },
  warning: {
    label: "Atenção",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-900",
    Icon: AlertTriangle,
  },
  critical: {
    label: "Crítico",
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-200 dark:border-rose-900",
    Icon: XCircle,
  },
  unknown: {
    label: "Não sei",
    dot: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-900/40",
    border: "border-slate-200 dark:border-slate-800",
    Icon: HelpCircle,
  },
};

const SIGNAL_ICONS: Record<string, LucideIcon> = {
  database: Database,
  vercel: Cloud,
  sentry: Bug,
  crons: Clock,
  integrations: PlugZap,
};

const OVERALL_HEADLINE: Record<HealthState, string> = {
  healthy: "Tudo funcionando",
  warning: "Precisa de atenção",
  critical: "Há um problema agora",
  unknown: "Parcialmente monitorado",
};

function formatSince(ms: number | null): string {
  if (ms === null) return "nunca";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

function SignalCard({ signal }: { signal: HealthSignal }) {
  const s = STATE_STYLES[signal.state];
  const Icon = SIGNAL_ICONS[signal.key] ?? HeartPulse;
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${s.text}`} />
        <span className="text-sm font-medium text-foreground">{signal.label}</span>
        <span className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
          <span className={`h-2 w-2 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{signal.detail}</p>
    </div>
  );
}

export function PulsoView({ snapshot }: { snapshot: SystemHealthSnapshot }) {
  const overall = STATE_STYLES[snapshot.overall];
  const OverallIcon = overall.Icon;
  const captured = new Date(snapshot.capturedAt).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const signals = [
    snapshot.signals.database,
    snapshot.signals.vercel,
    snapshot.signals.crons,
    snapshot.signals.integrations,
    snapshot.signals.sentry,
  ];

  return (
    <div className="space-y-6">
      {/* Hero: o pulso geral */}
      <div className={`rounded-2xl border ${overall.border} ${overall.bg} p-6`}>
        <div className="flex items-center gap-4">
          <div className={`rounded-full p-3 ${overall.bg} border ${overall.border}`}>
            <OverallIcon className={`h-7 w-7 ${overall.text}`} />
          </div>
          <div>
            <div className={`text-lg font-semibold ${overall.text}`}>
              {OVERALL_HEADLINE[snapshot.overall]}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Estado geral = o pior sinal. Fotografado {captured}.
            </div>
          </div>
        </div>
      </div>

      {/* Sinais */}
      <div className="grid gap-3 sm:grid-cols-2">
        {signals.map((sig) => (
          <SignalCard key={sig.key} signal={sig} />
        ))}
      </div>

      {/* Como ligar os sinais cinza (Sentry/Vercel dependem de env do dono) */}
      {(snapshot.signals.sentry.state === "unknown" || snapshot.signals.vercel.state === "unknown") && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            Sinais em cinza — como ligar
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {snapshot.signals.sentry.state === "unknown" && (
              <li className="flex gap-2">
                <Bug className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Sentry:</strong> defina a variável de ambiente{" "}
                  <code className="text-[11px] bg-muted px-1 rounded">SENTRY_DSN</code> na Vercel para
                  começar a capturar erros. O SDK já está instalado — só falta o DSN.
                </span>
              </li>
            )}
            {snapshot.signals.vercel.state === "unknown" && (
              <li className="flex gap-2">
                <Cloud className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Vercel:</strong> defina{" "}
                  <code className="text-[11px] bg-muted px-1 rounded">VERCEL_TOKEN</code> (e opcional{" "}
                  <code className="text-[11px] bg-muted px-1 rounded">VERCEL_TEAM_ID</code>) para
                  monitorar o bloqueio da conta. Sem token, não inventamos o status.
                </span>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Crons detalhados */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Tarefas agendadas (crons)</h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Job</th>
                <th className="text-left font-medium px-3 py-2">Estado</th>
                <th className="text-left font-medium px-3 py-2">Último sucesso</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.cronRows.map((row) => {
                const s = STATE_STYLES[row.state as HealthState];
                return (
                  <tr key={row.jobKey} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs text-foreground">{row.jobKey}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
                        <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatSince(row.sinceLastSuccessMs)}
                    </td>
                  </tr>
                );
              })}
              {snapshot.cronRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Nenhum cron registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feed de incidentes */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">
          Incidentes {snapshot.events.openCount > 0 && (
            <span className="text-rose-600">({snapshot.events.openCount} aberto{snapshot.events.openCount > 1 ? "s" : ""})</span>
          )}
        </h2>
        <div className="space-y-2">
          {snapshot.events.open.length === 0 && snapshot.events.resolved.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum incidente registrado. 🎉</p>
          )}
          {snapshot.events.open.map((e) => {
            const sev = e.severity === "critical" ? STATE_STYLES.critical : STATE_STYLES.warning;
            return (
              <div key={e.id} className={`rounded-lg border ${sev.border} ${sev.bg} px-3 py-2`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${sev.dot}`} />
                  <span className="text-sm font-medium text-foreground">{e.title}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </span>
                </div>
                {e.detail && <p className="mt-1 text-xs text-muted-foreground">{e.detail}</p>}
              </div>
            );
          })}
          {snapshot.events.resolved.map((e) => (
            <div key={e.id} className="rounded-lg border border-border px-3 py-2 opacity-70">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-sm text-muted-foreground line-through">{e.title}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">resolvido</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Honestidade: o que NÃO monitoro */}
      <div className="rounded-xl border border-dashed border-border p-4">
        <div className="flex items-center gap-2 mb-2">
          <EyeOff className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            O que este painel NÃO monitora
          </span>
        </div>
        <ul className="space-y-1">
          {snapshot.notMonitored.map((item) => (
            <li key={item} className="text-xs text-muted-foreground flex gap-2">
              <span className="text-muted-foreground/50">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
