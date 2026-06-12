import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";
import { HealthBadge } from "@/components/health-badge";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
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
const ONBOARDING_STYLES: Record<string, string> = {
  PENDING_INVITE: "text-muted-foreground",
  INVITE_SENT: "text-blue-600",
  ACTIVE: "text-emerald-600",
  IN_PROGRESS: "text-amber-600",
  COMPLETED: "text-emerald-600",
  STALLED: "text-rose-600",
};

type CompanyRow = Prisma.CompanyGetPayload<{ include: typeof companyInclude }>;

interface ClientesTableProps {
  companies: CompanyRow[];
}

export function ClientesTable({ companies }: ClientesTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Empresa", "Plano / MRR", "Status", "Health", "Onboarding", "Tags", "Usuários", "Cadastro", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-12 text-center">
                  <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">Nenhuma empresa encontrada</p>
                </td>
              </tr>
            ) : companies.map((c) => {
              const sub = c.subscriptions[0];
              const status = sub?.status ?? "NO_SUBSCRIPTION";

              // MRR
              const mrr = sub
                ? sub.billingCycle === "YEARLY"
                  ? Math.round(sub.plan.priceYearly / 12)
                  : sub.plan.priceMonthly
                : null;

              // Onboarding progress
              const checklist = c.onboardingChecklist;
              const requiredSteps = checklist?.steps ?? [];
              const completedRequired = requiredSteps.filter((s) => s.isCompleted).length;
              const progressPct = requiredSteps.length > 0
                ? Math.round((completedRequired / requiredSteps.length) * 100)
                : null;

              return (
                <tr key={c.id} className="border-b border-border hover:bg-muted transition-colors">
                  {/* Empresa */}
                  <td className="px-4 py-3">
                    <Link href={`/admin/clientes/${c.id}`} className="font-medium text-foreground hover:text-primary">
                      {c.name}
                    </Link>
                    {c.cnpj && <p className="text-xs text-muted-foreground font-mono">{c.cnpj}</p>}
                  </td>

                  {/* Plano / MRR */}
                  <td className="px-4 py-3">
                    <p className="text-foreground text-xs">{sub?.plan?.name ?? "—"}</p>
                    {mrr !== null && (
                      <p className="text-xs text-muted-foreground">
                        R$ {(mrr / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês
                      </p>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <AdminStatusBadge kind="subscription" status={status} />
                  </td>

                  {/* Health */}
                  <td className="px-4 py-3">
                    {c.healthScore && c.healthCategory ? (
                      <HealthBadge score={c.healthScore} category={c.healthCategory} size="sm" showLabel={false} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Onboarding */}
                  <td className="px-4 py-3">
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
                              progressPct === 100 ? "bg-emerald-500" :
                              progressPct >= 50 ? "bg-amber-500" : "bg-rose-500"
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
                  </td>

                  {/* Tags */}
                  <td className="px-4 py-3">
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
                  </td>

                  {/* Usuários */}
                  <td className="px-4 py-3 text-muted-foreground text-center text-xs">{c._count.users}</td>

                  {/* Cadastro */}
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                  </td>

                  {/* Ação */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/clientes/${c.id}`}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors inline-flex"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
