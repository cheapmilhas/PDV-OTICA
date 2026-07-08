"use client";

import { PlugZap } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { CronHealthRow } from "@/services/cron-heartbeat.service";
import { cronMeta, frequencyLabelFor } from "@/services/system-health-labels";
import { STATE_STYLES } from "./state-styles";

function formatDateTime(iso: string | null): string {
  if (!iso) return "ainda não rodou";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Drawer read-only com o detalhe de uma tarefa automática (cron). Alimentado
 * pelo CronHealthRow que a linha já tem — zero fetch. O erro exibido é o
 * `lastErrorSafe` (já sanitizado no servidor); o cru nunca chega aqui.
 *
 * Gate de acesso: herdado da página /admin/configuracoes/saude (SUPER_ADMIN).
 * Se um dia afrouxar a role dessa tela, revalidar a sanitização de erro.
 */
export function CronDetailSheet({
  row,
  onOpenChange,
}: {
  row: CronHealthRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const meta = row ? cronMeta(row.jobKey) : null;
  const s = row ? STATE_STYLES[row.state] : null;

  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        {row && meta && s && (
          <>
            <SheetHeader>
              <SheetTitle>{row.label}</SheetTitle>
              <SheetDescription>{row.does}</SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-5 text-sm">
              {/* Situação */}
              <div className={`rounded-lg border ${s.border} ${s.bg} p-3`}>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
              </div>

              {/* Se esta tarefa parar */}
              {meta.ifStops && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1">Se esta tarefa parar</p>
                  <p className="text-xs text-muted-foreground">{meta.ifStops}</p>
                </div>
              )}

              {/* Frequência */}
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Com que frequência roda</p>
                <p className="text-xs text-muted-foreground">
                  {frequencyLabelFor(row.expectedEveryMs, meta.frequencyLabel)}
                </p>
              </div>

              {/* Último ciclo */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground mb-1">Último ciclo</p>
                <p className="text-xs text-muted-foreground">
                  Começou: {formatDateTime(row.lastStartedAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Terminou com sucesso: {formatDateTime(row.lastSucceededAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Duração: {formatDuration(row.lastDurationMs)}
                </p>
              </div>

              {/* Erro (já sanitizado) */}
              {row.lastErrorSafe && (
                <details className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-xs font-medium text-foreground">
                    Ver detalhe técnico do último erro
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                    {row.lastErrorSafe}
                  </pre>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Se o problema persistir, avise o suporte técnico.
                  </p>
                </details>
              )}

              {/* Aviso de gatilho externo */}
              {row.external && (
                <div className="flex gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3">
                  <PlugZap className="h-4 w-4 flex-shrink-0 text-amber-600" />
                  <p className="text-xs text-muted-foreground">
                    Esta tarefa é acionada por um serviço externo (cron-job.org). Se ficar muito
                    tempo sem rodar, reative o gatilho.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
