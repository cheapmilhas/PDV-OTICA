import type { StatusVariant } from "@/components/ui/status-badge";

export type StatusKind = "subscription" | "invoice" | "ticket" | "health";

const VARIANT_MAP: Record<StatusKind, Record<string, StatusVariant>> = {
  subscription: {
    ACTIVE: "success",
    TRIAL: "info",
    PAST_DUE: "danger",
    SUSPENDED: "danger",
    CANCELED: "neutral",
    TRIAL_EXPIRED: "warning",
    NO_SUBSCRIPTION: "neutral",
  },
  invoice: {
    PAID: "success",
    PENDING: "warning",
    OVERDUE: "danger",
    CANCELED: "neutral",
    DRAFT: "neutral",
    REFUNDED: "neutral",
  },
  ticket: {
    OPEN: "info",
    IN_PROGRESS: "warning",
    WAITING_CUSTOMER: "warning",
    RESOLVED: "success",
    CLOSED: "neutral",
  },
  health: {
    THRIVING: "success",
    HEALTHY: "success",
    AT_RISK: "warning",
    CRITICAL: "danger",
  },
};

const LABEL_MAP: Record<StatusKind, Record<string, string>> = {
  subscription: {
    ACTIVE: "Ativo",
    TRIAL: "Trial",
    PAST_DUE: "Inadimplente",
    SUSPENDED: "Suspenso",
    CANCELED: "Cancelado",
    TRIAL_EXPIRED: "Trial Expirado",
    NO_SUBSCRIPTION: "Sem assinatura",
  },
  invoice: {
    PAID: "Paga",
    PENDING: "Pendente",
    OVERDUE: "Vencida",
    CANCELED: "Cancelada",
    DRAFT: "Rascunho",
    REFUNDED: "Reembolsada",
  },
  ticket: {
    OPEN: "Aberto",
    IN_PROGRESS: "Em andamento",
    WAITING_CUSTOMER: "Aguardando cliente",
    RESOLVED: "Resolvido",
    CLOSED: "Fechado",
  },
  health: {
    THRIVING: "Excelente",
    HEALTHY: "Saudável",
    AT_RISK: "Em risco",
    CRITICAL: "Crítico",
  },
};

export function adminStatusVariant(kind: StatusKind, status: string): StatusVariant {
  return VARIANT_MAP[kind]?.[status] ?? "neutral";
}

export function adminStatusLabel(kind: StatusKind, status: string): string {
  return LABEL_MAP[kind]?.[status] ?? status;
}
