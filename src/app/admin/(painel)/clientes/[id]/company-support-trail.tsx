"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { AlertTriangle, History, Loader2 } from "lucide-react";

import { TIMEZONE } from "@/lib/date-utils";

interface CompanySupportTrailProps {
  companyId: string;
}

interface TrailItem {
  id: string;
  origem: "medical" | "vis";
  event: string;
  createdAt: string;
  operador: string | null;
  grantId: string | null;
  reason: string | null;
  /** Dia (YYYY-MM-DD) JÁ no fuso America/Sao_Paulo, calculado no servidor. */
  dia: string;
}

type MedicalStatus = "ok" | "unavailable" | "not_provisioned";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; items: TrailItem[]; truncated: boolean; medical: MedicalStatus }
  | { kind: "error"; message: string };

/** Os sete eventos do Domus mais as três ações que só o Vis registra. */
const ROTULO_EVENTO: Record<string, string> = {
  // Domus — o ciclo completo do acesso.
  code_generated: "Cliente gerou o código",
  code_redeemed: "Operador resgatou o código",
  token_issued: "Link de acesso emitido",
  session_activated: "Acesso iniciado",
  session_revoked: "Acesso encerrado",
  pending_access_revoked: "Acesso pendente cancelado",
  access_denied: "Acesso recusado",
  // Vis — as tentativas que o Domus não enxerga.
  SUPPORT_ACCESS_GRANTED: "Código resgatado no Vis",
  SUPPORT_ACCESS_DENIED: "Resgate recusado no Vis",
  SUPPORT_ACCESS_STUCK: "Resgate travado no Vis",
};

/**
 * COMO o acesso terminou. Vocabulário exclusivo das revogações.
 */
const MOTIVO_FIM: Record<string, string> = {
  client: "encerrado pelo cliente",
  operator: "encerrado pelo operador",
  expired: "expirou",
};

/**
 * POR QUE a tentativa foi recusada. Vocabulário exclusivo de `access_denied`.
 */
const MOTIVO_RECUSA: Record<string, string> = {
  grant_not_activatable: "o acesso já não podia ser ativado",
};

/**
 * O `reason` carrega DOIS vocabulários disjuntos e o EVENTO é que decide qual
 * ler. Um mapa único mostraria uma recusa como se fosse revogação — ou pior,
 * imprimiria o código cru na tela do operador.
 */
export function rotuloDoMotivo(event: string, reason: string | null): string | null {
  if (!reason) return null;
  if (event === "session_revoked" || event === "pending_access_revoked") {
    return MOTIVO_FIM[reason] ?? null;
  }
  if (event === "access_denied") {
    return MOTIVO_RECUSA[reason] ?? null;
  }
  return null;
}

/**
 * O vocabulário de eventos não tem CHECK no banco: um evento novo do Domus pode
 * chegar aqui antes desta tela conhecer o nome dele. Some-lo seria pior que
 * mostrá-lo cru — numa trilha de consentimento, linha faltando é o pior defeito.
 */
function rotuloDoEvento(event: string): string {
  return ROTULO_EVENTO[event] ?? `Evento não catalogado (${event})`;
}

function formatarDia(dia: string): string {
  // `dia` já vem no fuso de São Paulo: só reordena os pedaços, sem construir
  // Date (que reintroduziria a conversão de fuso no navegador).
  const [ano, mes, d] = dia.split("-");
  return ano && mes && d ? `${d}/${mes}/${ano}` : dia;
}

function agruparPorDia(items: TrailItem[]): Array<{ dia: string; itens: TrailItem[] }> {
  const grupos: Array<{ dia: string; itens: TrailItem[] }> = [];
  for (const item of items) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === item.dia) ultimo.itens.push(item);
    else grupos.push({ dia: item.dia, itens: [item] });
  }
  return grupos;
}

/**
 * N7 — trilha de acessos de suporte da clínica, do lado do OPERADOR.
 *
 * É a MESMA trilha que o cliente já vê no Domus, mais o que só o Vis registra:
 * as tentativas recusadas, que nunca viraram grant lá.
 *
 * Carrega sob demanda: a ficha do cliente não paga a ida ao Domus se ninguém
 * pedir a trilha.
 */
export function CompanySupportTrail({ companyId }: CompanySupportTrailProps) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function carregar() {
    if (state.kind === "loading") return;
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/support-trail`);
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: { items?: TrailItem[]; truncated?: boolean; medical?: MedicalStatus };
      };
      if (!res.ok || !json.data) {
        setState({
          kind: "error",
          message: json.error ?? "Não foi possível carregar a trilha.",
        });
        return;
      }
      setState({
        kind: "ready",
        items: Array.isArray(json.data.items) ? json.data.items : [],
        truncated: json.data.truncated === true,
        medical: json.data.medical ?? "ok",
      });
    } catch {
      setState({ kind: "error", message: "Falha de rede ao carregar a trilha." });
    }
  }

  const grupos = state.kind === "ready" ? agruparPorDia(state.items) : [];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        Trilha de acessos
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Quem entrou nesta clínica, quando e como o acesso terminou. É a mesma
        trilha que o cliente enxerga do lado dele.
      </p>

      {state.kind === "idle" || state.kind === "loading" || state.kind === "error" ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={carregar}
            disabled={state.kind === "loading"}
            className="flex items-center gap-1.5 px-4 py-2 bg-muted text-foreground text-xs rounded-lg hover:bg-muted/70 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {state.kind === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Ver histórico de acessos
          </button>
          {state.kind === "error" && (
            <p className="text-xs text-destructive">{state.message}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {state.medical === "unavailable" && (
            // NUNCA lista vazia calada: uma trilha vazia que na verdade é erro
            // de rede levaria o operador a concluir que não houve acesso nenhum.
            <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Não foi possível consultar o Medical agora. Mostrando apenas o
                que o Vis registrou.
              </p>
            </div>
          )}

          {state.medical === "not_provisioned" && (
            <div className="flex gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Esta empresa ainda não tem clínica provisionada no Medical.
                Mostrando apenas o que o Vis registrou.
              </p>
            </div>
          )}

          {state.items.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {state.medical === "ok"
                ? "Nenhum acesso de suporte registrado para esta clínica."
                : "Nada registrado no Vis para esta empresa."}
            </p>
          ) : (
            <div className="space-y-4">
              {grupos.map((grupo) => (
                <div key={grupo.dia}>
                  <p className="text-xs font-semibold text-foreground mb-1.5">
                    {formatarDia(grupo.dia)}
                  </p>
                  <ul className="space-y-1.5">
                    {grupo.itens.map((item) => {
                      const motivo = rotuloDoMotivo(item.event, item.reason);
                      return (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs"
                        >
                          <span className="font-mono text-muted-foreground tabular-nums">
                            {formatInTimeZone(new Date(item.createdAt), TIMEZONE, "HH:mm")}
                          </span>
                          <span className="text-foreground">
                            {rotuloDoEvento(item.event)}
                          </span>
                          {item.operador && (
                            <span className="text-muted-foreground">
                              · {item.operador}
                            </span>
                          )}
                          {motivo && (
                            <span className="font-medium text-foreground">
                              · {motivo}
                            </span>
                          )}
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              item.origem === "medical"
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {item.origem === "medical" ? "Medical" : "Vis"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {state.truncated && (
            <p className="text-xs text-muted-foreground">
              Mostrando os 200 eventos mais recentes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
