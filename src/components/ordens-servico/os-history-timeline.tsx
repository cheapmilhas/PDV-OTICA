"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, RotateCcw, Stethoscope, FileText, ExternalLink } from "lucide-react";
import { formatDateBR } from "@/lib/date-utils";
import {
  buildOsTimeline,
  type OsTimelineRootInput,
  type OsTimelineEvent,
  type OsTimelineEventType,
} from "@/lib/os-timeline";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  APPROVED: "Aprovada",
  SENT_TO_LAB: "No laboratório",
  IN_PROGRESS: "Em produção",
  READY: "Pronta",
  DELIVERED: "Entregue",
  CANCELED: "Cancelada",
};

const TYPE_META: Record<
  OsTimelineEventType,
  { label: string; Icon: typeof Shield; dot: string; badge: string }
> = {
  ORIGINAL: { label: "OS original", Icon: FileText, dot: "bg-slate-500", badge: "bg-slate-100 text-slate-700" },
  WARRANTY: { label: "Garantia", Icon: Shield, dot: "bg-blue-600", badge: "bg-blue-100 text-blue-800" },
  REWORK: { label: "Retrabalho", Icon: RotateCcw, dot: "bg-amber-600", badge: "bg-amber-100 text-amber-800" },
  MEDICAL_ERROR: { label: "Erro médico", Icon: Stethoscope, dot: "bg-red-600", badge: "bg-red-100 text-red-800" },
};

function statusClasses(status: string, isCanceled: boolean): string {
  if (isCanceled) return "bg-slate-100 text-slate-500 line-through";
  if (status === "DELIVERED") return "bg-emerald-100 text-emerald-800";
  return "bg-indigo-100 text-indigo-800";
}

function DeadlineLabel({ event }: { event: OsTimelineEvent }) {
  const { state, lateDays } = event.deadline;
  if (state === "ON_TIME")
    return <span className="font-semibold text-emerald-600">no prazo</span>;
  if (state === "LATE")
    return (
      <span className="font-semibold text-red-600">
        {lateDays !== null ? `atrasou ${lateDays}d` : "atrasada"}
      </span>
    );
  return <span className="font-medium text-slate-500">em aberto</span>;
}

interface OsHistoryTimelineProps {
  order: OsTimelineRootInput & { originalOrder?: unknown };
}

/**
 * Histórico (linha do tempo) de uma OS-raiz: resumo de contadores por tipo +
 * timeline vertical das derivações. Só renderiza na raiz (sem originalOrder).
 */
export function OsHistoryTimeline({ order }: OsHistoryTimelineProps) {
  // Só a OS-raiz mostra o histórico; derivações têm originalOrder.
  if ((order as { originalOrder?: unknown }).originalOrder) return null;

  const { events, counts } = buildOsTimeline(order);

  // Sem derivações: nada a mostrar (a tela já é a OS original).
  if (events.length <= 1) return null;

  return (
    <Card className="border-blue-200">
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Histórico desta OS
        </h3>

        {/* Resumo por tipo (não-canceladas) */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Stat n={counts.warranty} label="Garantias" accent="border-l-blue-600" />
          <Stat n={counts.rework} label="Retrabalhos" accent="border-l-amber-600" />
          <Stat n={counts.medicalError} label="Erros médicos" accent="border-l-red-600" />
        </div>

        {/* Linha do tempo vertical */}
        <ol className="relative ml-2 border-l-2 border-slate-200" aria-label="Histórico da OS">
          {events.map((ev) => {
            const meta = TYPE_META[ev.type];
            const Icon = meta.Icon;
            return (
              <li key={ev.id} className="relative mb-4 pl-6 last:mb-0">
                <span
                  className={`absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white ${meta.dot}`}
                  aria-hidden="true"
                />
                <Link
                  href={`/dashboard/ordens-servico/${ev.id}/detalhes`}
                  className="block cursor-pointer rounded-lg border border-slate-200 bg-white p-3 transition-colors duration-200 hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.badge}`}>
                      <Icon className="h-3 w-3" aria-hidden="true" />
                      {meta.label}
                    </span>
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {ev.displayNumber}
                    </span>
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusClasses(ev.status, ev.isCanceled)}`}>
                      {STATUS_LABEL[ev.status] ?? ev.status}
                    </span>
                    <ExternalLink className="ml-auto h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  </div>

                  {ev.reason && (
                    <p className="mt-1 text-xs text-slate-600">Motivo: {ev.reason}</p>
                  )}

                  <p className="mt-1 text-xs text-slate-500">
                    Aberta {formatDateBR(ev.createdAt)}
                    {ev.promisedDate && ` · Prometida ${formatDateBR(ev.promisedDate)}`}
                    {ev.deliveredAt && ` · Entregue ${formatDateBR(ev.deliveredAt)}`}
                    {" — "}
                    <DeadlineLabel event={ev} />
                  </p>
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function Stat({ n, label, accent }: { n: number; label: string; accent: string }) {
  return (
    <div className={`min-w-[110px] rounded-lg border border-slate-200 border-l-[3px] ${accent} bg-white px-3 py-2`}>
      <div className="text-xl font-bold leading-none text-slate-900">{n}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
