import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusVariant =
  | "success" // pago / entregue / ativo / concluído
  | "warning" // pendente / em processamento
  | "info" // novo / agendado / lab
  | "danger" // atrasado / vencido / cancelado
  | "neutral" // rascunho / arquivado
  | "premium"; // destaque comercial

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  success: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
  info: "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  danger: "bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-300",
  neutral: "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300",
  premium: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300",
};

interface StatusBadgeProps {
  variant: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-semibold border-transparent",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </Badge>
  );
}

/**
 * Mapas semânticos prontos para reuso. Adicione novos status conforme aparecem.
 */
export const SALE_STATUS_VARIANT: Record<string, StatusVariant> = {
  COMPLETED: "success",
  PAID: "success",
  OPEN: "info",
  PENDING: "warning",
  PARTIAL: "warning",
  OVERDUE: "danger",
  CANCELED: "neutral",
  REFUNDED: "neutral",
  DISPUTED: "danger",
};

export const OS_STATUS_VARIANT: Record<string, StatusVariant> = {
  PENDING: "warning",
  IN_LAB: "info",
  READY: "success",
  DELIVERED: "success",
  CANCELED: "neutral",
  ON_HOLD: "warning",
};

export const SUBSCRIPTION_STATUS_VARIANT: Record<string, StatusVariant> = {
  ACTIVE: "success",
  TRIAL: "info",
  TRIAL_EXPIRED: "warning",
  PAST_DUE: "danger",
  SUSPENDED: "danger",
  CANCELED: "neutral",
};
