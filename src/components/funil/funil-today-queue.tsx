"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, PartyPopper } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { WhatsAppButton } from "@/components/whatsapp/whatsapp-button";
import { buildWaMeUrl } from "@/lib/whatsapp-deeplink";
import type { QueueSeverity, TodayQueueItem } from "@/lib/today-queue";

interface FunilTodayQueueProps {
  /** Só busca quando a aba está ativa (evita polling desnecessário). */
  active: boolean;
  /** Filial selecionada (null = todas). */
  branchId: string | null;
}

interface QueueResponse {
  queue: TodayQueueItem[];
  total: number;
  overflow: number;
}

/** Resumo do dono (#12): o dia num relance. Shape espelha o service. */
interface OwnerDailySummary {
  conversations: number;
  replied: number;
  awaiting: number;
  complaints: number;
}

/** Cor do pontinho do semáforo. */
const DOT: Record<QueueSeverity, string> = {
  red: "bg-red-500",
  yellow: "bg-amber-500",
  green: "bg-green-500",
};

/**
 * "Fila de Hoje" (Sprint 2, #4): a ÚNICA lista priorizada da atendente. Uma
 * pessoa por linha, semáforo de cor, frase imperativa com o nome e botão que
 * abre o WhatsApp com o texto pronto. Teto no servidor (≤10) + "+N mais antigos".
 * Read-only: nada aqui muda estado — só organiza o que fazer agora.
 */
export function FunilTodayQueue({ active, branchId }: FunilTodayQueueProps) {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [summary, setSummary] = useState<OwnerDailySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchQueue = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    fetch(`/api/funil/fila-hoje?${params}`)
      .then((res) => res.json())
      .then((json) => setData(json.data ?? null))
      .catch(() => toast.error("Erro ao carregar a fila de hoje"))
      .finally(() => setLoading(false));
    // Resumo do dono (#12): busca em paralelo, falha silenciosa (não trava a fila).
    fetch(`/api/funil/resumo-hoje?${params}`)
      .then((res) => res.json())
      .then((json) => setSummary(json.data ?? null))
      .catch(() => {});
  }, [branchId]);

  useEffect(() => {
    if (active) fetchQueue();
  }, [active, fetchQueue]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const queue = data?.queue ?? [];
  const overflow = data?.overflow ?? 0;

  return (
    <div className="space-y-4">
      {/* Resumo do dono (#12): o dia num relance. Só aparece se houve conversa hoje.
          Rótulo "todas as filiais" porque o WhatsApp é compartilhado — o resumo é
          company-wide, ao contrário da fila de leads abaixo (que é por filial). */}
      {summary && summary.conversations > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
          <span className="font-semibold">Hoje (todas as filiais):</span>
          <span>
            {summary.conversations}{" "}
            {summary.conversations === 1 ? "conversa" : "conversas"}
          </span>
          <span className="text-green-700">{summary.replied} respondida{summary.replied === 1 ? "" : "s"}</span>
          {summary.awaiting > 0 && (
            <span className="text-orange-700">{summary.awaiting} sem resposta</span>
          )}
          {summary.complaints > 0 && (
            <span className="font-medium text-red-700">
              {summary.complaints} reclamação{summary.complaints === 1 ? "" : "ões"}
            </span>
          )}
        </div>
      )}

      {/* 1 número no topo: quantas pessoas pra cuidar hoje. */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-bold">
            {queue.length > 0
              ? `Você tem ${queue.length} pra hoje`
              : "Tudo em dia por aqui"}
          </p>
          <p className="text-sm text-muted-foreground">
            Do mais urgente pro menos. Toque em avisar pra abrir o WhatsApp.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchQueue} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {queue.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <PartyPopper className="h-10 w-10 text-green-500" />
            <p className="font-medium">Nenhum cliente esperando 🎉</p>
            <p className="text-sm text-muted-foreground">
              Ninguém pra avisar ou responder agora. Bom trabalho!
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {queue.map((it) => (
            <li key={it.key}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 py-3">
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${DOT[it.severity]}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {it.href ? (
                        <Link href={it.href} className="hover:underline">
                          {it.headline}
                        </Link>
                      ) : (
                        it.headline
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {it.customerName} · {it.subtext}
                    </p>
                  </div>
                  {/* Sem telefone válido o WhatsAppButton não renderiza — então
                      damos uma saída (abrir o cadastro/OS) em vez de deixar a linha
                      SEM AÇÃO (pior caso: uma reclamação 🔴 no topo, sem o que fazer). */}
                  {buildWaMeUrl(it.phone) ? (
                    <WhatsAppButton
                      phone={it.phone}
                      draftText={it.draftText}
                      label="Avisar"
                    />
                  ) : it.href ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={it.href}>Sem telefone — abrir</Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem telefone</span>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {overflow > 0 && (
        <p className="text-center text-sm text-muted-foreground">
          + {overflow} {overflow === 1 ? "mais antigo" : "mais antigos"} — cuide dos de cima
          primeiro e atualize.
        </p>
      )}
    </div>
  );
}
