"use client";

import {
  Building2, Calendar, CreditCard, ShoppingCart, AlertTriangle,
  CheckCircle, XCircle, UserPlus, UserMinus, GitBranch, FileText,
  TrendingUp, TrendingDown, Lock, Unlock, Zap, MessageSquare,
  Activity, Star
} from "lucide-react";

type ActivityLogEntry = {
  id: string;
  type: string;
  title: string;
  detail: unknown;
  actorType: string;
  actorName: string | null;
  createdAt: Date;
};

const ACTIVITY_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  COMPANY_CREATED:            { icon: Building2,      color: "text-primary",     bg: "bg-primary/10" },
  ONBOARDING_STARTED:         { icon: Zap,            color: "text-blue-600",    bg: "bg-blue-100" },
  ONBOARDING_COMPLETED:       { icon: CheckCircle,    color: "text-emerald-600", bg: "bg-emerald-100" },
  TRIAL_STARTED:              { icon: Calendar,       color: "text-blue-600",    bg: "bg-blue-100" },
  TRIAL_EXTENDED:             { icon: Calendar,       color: "text-amber-600",   bg: "bg-amber-100" },
  TRIAL_EXPIRED:              { icon: XCircle,        color: "text-rose-600",    bg: "bg-rose-100" },
  SUBSCRIPTION_CREATED:       { icon: CreditCard,     color: "text-emerald-600", bg: "bg-emerald-100" },
  PLAN_CHANGED:               { icon: TrendingUp,     color: "text-primary",     bg: "bg-primary/10" },
  CYCLE_CHANGED:              { icon: Activity,       color: "text-muted-foreground", bg: "bg-muted" },
  SUBSCRIPTION_CANCELED:      { icon: XCircle,        color: "text-rose-600",    bg: "bg-rose-100" },
  SUBSCRIPTION_REACTIVATED:   { icon: CheckCircle,    color: "text-emerald-600", bg: "bg-emerald-100" },
  INVOICE_CREATED:            { icon: FileText,       color: "text-muted-foreground", bg: "bg-muted" },
  INVOICE_SENT:               { icon: FileText,       color: "text-blue-600",    bg: "bg-blue-100" },
  INVOICE_PAID:               { icon: CheckCircle,    color: "text-emerald-600", bg: "bg-emerald-100" },
  INVOICE_OVERDUE:            { icon: AlertTriangle,  color: "text-rose-600",    bg: "bg-rose-100" },
  COMPANY_BLOCKED:            { icon: Lock,           color: "text-rose-600",    bg: "bg-rose-100" },
  COMPANY_UNBLOCKED:          { icon: Unlock,         color: "text-emerald-600", bg: "bg-emerald-100" },
  COMPANY_SUSPENDED:          { icon: Lock,           color: "text-orange-600",  bg: "bg-orange-100" },
  TICKET_OPENED:              { icon: MessageSquare,  color: "text-amber-600",   bg: "bg-amber-100" },
  TICKET_RESOLVED:            { icon: CheckCircle,    color: "text-emerald-600", bg: "bg-emerald-100" },
  TICKET_ESCALATED:           { icon: AlertTriangle,  color: "text-rose-600",    bg: "bg-rose-100" },
  FIRST_SALE:                 { icon: ShoppingCart,   color: "text-emerald-600", bg: "bg-emerald-100" },
  USAGE_ALERT:                { icon: AlertTriangle,  color: "text-amber-600",   bg: "bg-amber-100" },
  HEALTH_SCORE_CHANGED:       { icon: Star,           color: "text-primary",     bg: "bg-primary/10" },
  IMPERSONATION:              { icon: UserPlus,       color: "text-purple-600",  bg: "bg-purple-100" },
  NOTE_ADDED:                 { icon: FileText,       color: "text-muted-foreground", bg: "bg-muted" },
  USER_CREATED:               { icon: UserPlus,       color: "text-blue-600",    bg: "bg-blue-100" },
  USER_REMOVED:               { icon: UserMinus,      color: "text-rose-600",    bg: "bg-rose-100" },
  BRANCH_CREATED:             { icon: GitBranch,      color: "text-primary",     bg: "bg-primary/10" },
  DATA_UPDATED:               { icon: Activity,       color: "text-muted-foreground", bg: "bg-muted" },
};

const ACTOR_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  CLIENT: "Cliente",
  SYSTEM: "Sistema",
};

function formatRelative(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins}min`;
  if (hours < 24) return `há ${hours}h`;
  if (days < 7) return `há ${days}d`;
  return new Date(date).toLocaleDateString("pt-BR");
}

export function CompanyTimeline({ logs }: { logs: ActivityLogEntry[] }) {
  if (logs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Activity className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Timeline de Atividades</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{logs.length} eventos registrados</p>
      </div>
      <div className="relative">
        {/* Linha vertical */}
        <div className="absolute left-[2.375rem] top-0 bottom-0 w-px bg-border" />

        <div className="divide-y divide-border">
          {logs.map((log) => {
            const config = ACTIVITY_CONFIG[log.type] ?? {
              icon: Activity,
              color: "text-muted-foreground",
              bg: "bg-muted",
            };
            const Icon = config.icon;

            return (
              <div key={log.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-muted transition-colors">
                {/* Ícone */}
                <div className={`relative z-10 flex-shrink-0 w-7 h-7 rounded-full ${config.bg} flex items-center justify-center mt-0.5`}>
                  <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">{log.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {ACTOR_LABELS[log.actorType] ?? log.actorType}
                      {log.actorName ? ` · ${log.actorName}` : ""}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground" suppressHydrationWarning title={new Date(log.createdAt).toLocaleString("pt-BR")}>
                      {formatRelative(log.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
