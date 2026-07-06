import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";
import { HealthBadge } from "@/components/health-badge";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { Prisma } from "@prisma/client";
import type { companyInclude } from "./page";

const ONBOARDING_LABELS: Record<string, string> = {
  PENDING_INVITE: "Convite pendente",
  INVITE_SENT: "Convite enviado",
  ACTIVE: "Ativo",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Completo",
  STALLED: "Parado",
};
// Tom semântico via token (theme-aware), não cor hardcoded.
const ONBOARDING_STYLES: Record<string, string> = {
  PENDING_INVITE: "text-muted-foreground",
  INVITE_SENT: "text-info",
  ACTIVE: "text-success",
  IN_PROGRESS: "text-warning",
  COMPLETED: "text-success",
  STALLED: "text-destructive",
};

type CompanyRow = Prisma.CompanyGetPayload<{ include: typeof companyInclude }>;

interface ClientesTableProps {
  companies: CompanyRow[];
}

export function ClientesTable({ companies }: ClientesTableProps) {
  if (companies.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState icon={Building2} message="Nenhuma empresa encontrada" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <ResponsiveTable minWidth={980}>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Plano / MRR</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Health</TableHead>
            <TableHead>Onboarding</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead className="text-center">Usuários</TableHead>
            <TableHead>Cadastro</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((c) => {
            const sub = c.subscriptions[0];
            const status = sub?.status ?? "NO_SUBSCRIPTION";

            const mrr = sub
              ? sub.billingCycle === "YEARLY"
                ? Math.round(sub.plan.priceYearly / 12)
                : sub.plan.priceMonthly
              : null;

            const checklist = c.onboardingChecklist;
            const requiredSteps = checklist?.steps ?? [];
            const completedRequired = requiredSteps.filter((s) => s.isCompleted).length;
            const progressPct = requiredSteps.length > 0
              ? Math.round((completedRequired / requiredSteps.length) * 100)
              : null;

            return (
              <TableRow key={c.id}>
                {/* Empresa */}
                <TableCell>
                  <Link href={`/admin/clientes/${c.id}`} className="font-medium text-foreground hover:text-primary">
                    {c.name}
                  </Link>
                  {c.cnpj && <p className="text-xs text-muted-foreground font-mono">{c.cnpj}</p>}
                </TableCell>

                {/* Plano / MRR */}
                <TableCell>
                  <p className="text-foreground text-xs">{sub?.plan?.name ?? "—"}</p>
                  {mrr !== null && (
                    <p className="text-xs text-muted-foreground">
                      R$ {(mrr / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês
                    </p>
                  )}
                </TableCell>

                {/* Status */}
                <TableCell>
                  <AdminStatusBadge kind="subscription" status={status} />
                </TableCell>

                {/* Health */}
                <TableCell>
                  {c.healthScore && c.healthCategory ? (
                    <HealthBadge score={c.healthScore} category={c.healthCategory} size="sm" showLabel={false} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* Onboarding */}
                <TableCell>
                  {progressPct !== null ? (
                    <div className="w-20">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs ${ONBOARDING_STYLES[c.onboardingStatus] ?? "text-muted-foreground"}`}>
                          {progressPct}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            progressPct === 100 ? "bg-success" :
                            progressPct >= 50 ? "bg-warning" : "bg-destructive"
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className={`text-xs ${ONBOARDING_STYLES[c.onboardingStatus] ?? "text-muted-foreground"}`}>
                      {ONBOARDING_LABELS[c.onboardingStatus] ?? "—"}
                    </span>
                  )}
                </TableCell>

                {/* Tags — cor vem do cadastro da tag (dado do usuário), mantida. */}
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {c.companyTags.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      c.companyTags.map((ct) => (
                        <span
                          key={ct.id}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{ backgroundColor: ct.tag.color + "33", color: ct.tag.color }}
                        >
                          {ct.tag.name}
                        </span>
                      ))
                    )}
                  </div>
                </TableCell>

                {/* Usuários */}
                <TableCell className="text-muted-foreground text-center text-xs">{c._count.users}</TableCell>

                {/* Cadastro */}
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                  {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                </TableCell>

                {/* Ação */}
                <TableCell>
                  <Link
                    href={`/admin/clientes/${c.id}`}
                    aria-label={`Abrir ${c.name}`}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </ResponsiveTable>
    </div>
  );
}
