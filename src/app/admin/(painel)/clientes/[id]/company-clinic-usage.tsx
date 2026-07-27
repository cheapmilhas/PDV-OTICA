"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, Check, Circle, RefreshCw } from "lucide-react";

interface Step {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  required: boolean;
}

interface Onboarding {
  steps: Step[];
  doneRequired: number;
  totalRequired: number;
  percent: number;
  ativa: boolean;
}

interface Usage {
  doctorsActive: number;
  staffActive: number;
  patients: number;
  appointments: number;
  appointmentsLast30d: number;
  medicalRecords: number;
}

type State =
  | { kind: "loading" }
  | { kind: "ok"; usage: Usage; onboarding: Onboarding }
  | { kind: "nao_provisionada" }
  | { kind: "indisponivel" };

/**
 * N6 — "esta clínica começou a usar o produto?", na ficha do cliente.
 *
 * 🔑 Client component que busca ao MONTAR, e não server component.
 * A ficha do cliente carrega tudo em `await` serial e as abas são estado de
 * cliente: uma chamada ao Domus no servidor bloquearia a página INTEIRA mesmo
 * com o operador olhando a aba "Resumo", e um timeout derrubaria a ficha toda
 * no error boundary. Aqui o custo fica contido nesta aba.
 *
 * Carrega automático (ao contrário da trilha do N7, que exige clique): o
 * checklist é a razão de a aba existir, e um clique a mais para ver o estado
 * principal seria atrito sem contrapartida.
 */
export function CompanyClinicUsage({ companyId }: { companyId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Guarda contra a dupla montagem do StrictMode em dev e contra corrida de
  // duplo clique em "tentar de novo" — trava SÍNCRONA, porque state do React
  // não atualiza a tempo de barrar a segunda chamada.
  const carregando = useRef(false);

  async function carregar() {
    if (carregando.current) return;
    carregando.current = true;
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/clinic-usage`);
      const json = (await res.json().catch(() => ({}))) as {
        data?: { state?: string; usage?: Usage; onboarding?: Onboarding };
      };
      const d = json.data;
      if (!res.ok || !d) {
        setState({ kind: "indisponivel" });
      } else if (d.state === "nao_provisionada") {
        setState({ kind: "nao_provisionada" });
      } else if (d.state === "ok" && d.usage && d.onboarding) {
        setState({ kind: "ok", usage: d.usage, onboarding: d.onboarding });
      } else {
        setState({ kind: "indisponivel" });
      }
    } catch {
      setState({ kind: "indisponivel" });
    } finally {
      carregando.current = false;
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-medium text-foreground flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Uso da clínica
        </h3>
        {state.kind !== "loading" && (
          <button
            onClick={() => void carregar()}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-3 w-3" />
            Atualizar
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Lido do sistema da clínica no momento em que você abriu esta aba. Nada é
        armazenado aqui.
      </p>

      {state.kind === "loading" && (
        <div className="space-y-2" aria-busy="true">
          <div className="h-2 bg-muted rounded animate-pulse" />
          <div className="h-2 bg-muted rounded w-2/3 animate-pulse" />
        </div>
      )}

      {state.kind === "nao_provisionada" && (
        <p className="text-sm text-muted-foreground">
          Clínica ainda não provisionada no sistema Medical — não há uso a mostrar.
        </p>
      )}

      {/* Estado de falha NUNCA vira lista vazia nem zeros: "não sei" e "não usa"
          são fatos diferentes, e confundi-los faria o operador desistir de um
          cliente ativo. */}
      {state.kind === "indisponivel" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="text-amber-800 dark:text-amber-300 font-medium">
              Não foi possível consultar o uso agora
            </p>
            <p className="text-amber-700 dark:text-amber-400/90">
              Os números estão <strong>desconhecidos</strong> — não são zero. Tente de
              novo em instantes.
            </p>
          </div>
        </div>
      )}

      {state.kind === "ok" && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  state.onboarding.percent === 100
                    ? "bg-emerald-500"
                    : state.onboarding.percent >= 60
                      ? "bg-blue-500"
                      : state.onboarding.percent >= 30
                        ? "bg-amber-500"
                        : "bg-red-500"
                }`}
                style={{ width: `${state.onboarding.percent}%` }}
              />
            </div>
            <span className="text-sm font-medium text-foreground tabular-nums">
              {state.onboarding.percent}%
            </span>
          </div>

          <div className="flex items-center gap-2 mb-4 text-xs">
            <span className="text-muted-foreground">
              {state.onboarding.doneRequired} de {state.onboarding.totalRequired} etapas
              essenciais
            </span>
            <span
              className={`px-1.5 py-0.5 rounded font-medium ${
                state.onboarding.ativa
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
              title={
                state.onboarding.ativa
                  ? "Houve agendamento nos últimos 30 dias"
                  : "Sem agendamento nos últimos 30 dias"
              }
            >
              {state.onboarding.ativa ? "usando" : "parada"}
            </span>
          </div>

          <ul className="space-y-1.5 mb-4">
            {state.onboarding.steps.map((s) => (
              <li key={s.key} className="flex items-start gap-2 text-sm">
                {s.done ? (
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                )}
                <span className="flex-1">
                  <span className={s.done ? "text-muted-foreground line-through" : "text-foreground"}>
                    {s.label}
                  </span>
                  {!s.required && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      opcional
                    </span>
                  )}
                  <span className="block text-xs text-muted-foreground">{s.hint}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border text-center">
            <Metric label="Pacientes" value={state.usage.patients} />
            <Metric label="Agendamentos" value={state.usage.appointments} />
            <Metric label="Últimos 30d" value={state.usage.appointmentsLast30d} />
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
