import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import type { HealthState } from "@/services/system-health.service";

/** Paleta dos 4 estados, com rótulos em linguagem de dono. Compartilhada
 *  entre a tabela (pulso-view) e o drawer (cron-detail-sheet). */
export const STATE_STYLES: Record<
  HealthState,
  { label: string; dot: string; text: string; bg: string; border: string; Icon: LucideIcon }
> = {
  healthy: {
    label: "Tudo certo",
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
    label: "Problema",
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-200 dark:border-rose-900",
    Icon: XCircle,
  },
  unknown: {
    label: "Aguardando",
    dot: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-900/40",
    border: "border-slate-200 dark:border-slate-800",
    Icon: HelpCircle,
  },
};
