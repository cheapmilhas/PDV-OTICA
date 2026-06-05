import type { SystemPulse } from "./system-pulse";
import type { HealthCategory, SubscriptionStatus } from "@prisma/client";

export type IssueSeverity = "critical" | "warning" | "info";
export type IssueCategory = "system" | "client";

export interface IssueAction {
  kind: "blueprint" | "link" | "info";
  blueprintId?: string;
  href?: string;
  label: string;
}

export interface Issue {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  explanation: string;
  companyId?: string;
  companyName?: string;
  action?: IssueAction;
}

// ── Limiares (constantes documentadas; não editáveis pela UI — YAGNI) ──
export const ERROR_RATE_PCT = 5;
export const MIN_REQ_FOR_ERROR_ALERT = 20;
export const TRIAL_WARNING_DAYS = 3;

export function detectSystemIssues(pulse: SystemPulse): Issue[] {
  const issues: Issue[] = [];
  if (pulse.status === "down" || pulse.db.status === "down") {
    issues.push({
      id: "system_slow", severity: "critical", category: "system",
      title: "Sistema fora do ar",
      explanation: "O sistema não está conseguindo responder agora. Os usuários podem estar sem acesso.",
      action: { kind: "info", label: "Verificar novamente" },
    });
  } else if (pulse.status === "degraded" || pulse.db.status === "degraded") {
    issues.push({
      id: "system_slow", severity: "warning", category: "system",
      title: "Sistema lento",
      explanation: "As telas estão demorando mais que o normal para responder. Pode ser um pico temporário.",
      action: { kind: "info", label: "Verificar novamente" },
    });
  }
  return issues;
}

export function detectErrorRateIssue(pulse: SystemPulse): Issue | null {
  if (pulse.reqCount < MIN_REQ_FOR_ERROR_ALERT) return null;
  if (pulse.errorRatePct < ERROR_RATE_PCT) return null;
  return {
    id: "error_rate", severity: "critical", category: "system",
    title: "Muitos erros acontecendo",
    explanation: `${pulse.errorRatePct}% das últimas requisições falharam. Algo pode estar quebrado para os usuários.`,
    action: { kind: "link", href: "/admin/configuracoes/logs", label: "Ver registros de erro" },
  };
}

export interface ProblemCompany {
  id: string;
  name: string;
  isBlocked: boolean;
  healthCategory: HealthCategory | null;
  subscriptionStatus: SubscriptionStatus | null;
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
  billingSyncPending: boolean;
  overdueInvoiceCount: number;
  overdueTotalCents: number;
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function detectCompanyIssues(c: ProblemCompany, now: Date): Issue[] {
  const issues: Issue[] = [];

  if (c.overdueInvoiceCount > 0) {
    issues.push({
      id: `overdue:${c.id}`, severity: "critical", category: "client",
      title: "Cliente com fatura vencida",
      explanation: `${c.name} tem ${c.overdueInvoiceCount} fatura(s) vencida(s), somando ${brl(c.overdueTotalCents)}.`,
      companyId: c.id, companyName: c.name,
      action: { kind: "link", href: `/admin/clientes/${c.id}`, label: "Ver cliente" },
    });
  }

  if (c.billingSyncPending) {
    issues.push({
      id: `billing_sync:${c.id}`, severity: "warning", category: "client",
      title: "Cobrança não sincronizada",
      explanation: `A cobrança de ${c.name} não foi atualizada no sistema de pagamento. O valor cobrado pode estar incorreto.`,
      companyId: c.id, companyName: c.name,
      action: { kind: "link", href: `/admin/clientes/${c.id}`, label: "Ver cliente" },
    });
  }

  const trialPast = c.trialEndsAt !== null && c.trialEndsAt.getTime() < now.getTime();
  if (c.subscriptionStatus === "TRIAL_EXPIRED" || (c.subscriptionStatus === "TRIAL" && trialPast)) {
    issues.push({
      id: `trial_expired:${c.id}`, severity: "warning", category: "client",
      title: "Teste grátis expirado",
      explanation: `O período de teste de ${c.name} acabou. Sem ação, o cliente pode parar de usar o sistema.`,
      companyId: c.id, companyName: c.name,
      action: { kind: "link", href: `/admin/clientes/${c.id}`, label: "Ver cliente" },
    });
  } else if (c.subscriptionStatus === "TRIAL" && c.trialEndsAt !== null) {
    const days = Math.ceil((c.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= TRIAL_WARNING_DAYS) {
      issues.push({
        id: `trial_ending:${c.id}`, severity: "info", category: "client",
        title: "Teste grátis terminando",
        explanation: `O teste de ${c.name} termina em ${days} dia(s). Você pode estender se quiser dar mais tempo.`,
        companyId: c.id, companyName: c.name,
        action: { kind: "blueprint", blueprintId: "extend_trial", label: "Estender +7 dias" },
      });
    }
  }

  if (c.subscriptionStatus === "SUSPENDED") {
    issues.push({
      id: `suspended:${c.id}`, severity: "warning", category: "client",
      title: "Assinatura suspensa",
      explanation: `A assinatura de ${c.name} está suspensa. O acesso fica limitado até reativar.`,
      companyId: c.id, companyName: c.name,
      action: { kind: "blueprint", blueprintId: "reactivate", label: "Reativar" },
    });
  }

  if (c.subscriptionStatus === "PAST_DUE") {
    issues.push({
      id: `past_due:${c.id}`, severity: "warning", category: "client",
      title: "Pagamento atrasado",
      explanation: `A assinatura de ${c.name} está com pagamento atrasado. Vale acompanhar antes que seja suspensa.`,
      companyId: c.id, companyName: c.name,
      action: { kind: "link", href: `/admin/clientes/${c.id}`, label: "Ver cliente" },
    });
  }

  if (c.healthCategory === "CRITICAL") {
    issues.push({
      id: `health_critical:${c.id}`, severity: "warning", category: "client",
      title: "Cliente em risco de cancelar",
      explanation: `${c.name} está com sinais de baixo uso/engajamento. Vale uma aproximação.`,
      companyId: c.id, companyName: c.name,
      action: { kind: "link", href: `/admin/clientes/${c.id}`, label: "Ver cliente" },
    });
  }

  return issues;
}
