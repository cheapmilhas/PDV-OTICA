import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CreditCard, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { FilterBar, FilterChip } from "@/components/admin/FilterBar";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo", TRIAL: "Trial", PAST_DUE: "Inadimplente",
  SUSPENDED: "Suspenso", CANCELED: "Cancelado", TRIAL_EXPIRED: "Trial Expirado",
};

export default async function AssinaturasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const statusFilter = params.status;

  const [subscriptions, statusCounts] = await Promise.all([
    prisma.subscription.findMany({
      where: statusFilter ? { status: statusFilter as any } : {},
      orderBy: { createdAt: "desc" },
      include: {
        company: { select: { id: true, name: true, email: true } },
        plan: { select: { name: true, priceMonthly: true } },
      },
      take: 100,
    }),
    prisma.subscription.groupBy({ by: ["status"], _count: true }),
  ]);

  const counts = statusCounts.reduce((acc, item) => ({ ...acc, [item.status]: item._count }), {} as Record<string, number>);
  const total = statusCounts.reduce((acc, item) => acc + item._count, 0);

  return (
    <div className="p-6">
      <PageHeader title="Assinaturas" subtitle={`${total} assinatura${total !== 1 ? "s" : ""} no total`} />

      {/* Filtros por status */}
      <FilterBar>
        <FilterChip href="/admin/assinaturas" active={!statusFilter}>
          Todas ({total})
        </FilterChip>
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <FilterChip key={status} href={`/admin/assinaturas?status=${status}`} active={statusFilter === status}>
            {label} ({counts[status] ?? 0})
          </FilterChip>
        ))}
      </FilterBar>

      {/* Tabela */}
      {subscriptions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={CreditCard} message="Nenhuma assinatura encontrada" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ResponsiveTable minWidth={880}>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ciclo</TableHead>
                <TableHead>Valor/mês</TableHead>
                <TableHead>Trial expira</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((sub) => (
                <TableRow key={sub.id}>
                  {/* Empresa */}
                  <TableCell>
                    <Link href={`/admin/clientes/${sub.company.id}`} className="font-medium text-foreground hover:text-primary">{sub.company.name}</Link>
                    {sub.company.email && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{sub.company.email}</p>}
                  </TableCell>

                  {/* Plano */}
                  <TableCell className="text-foreground">{sub.plan.name}</TableCell>

                  {/* Status */}
                  <TableCell>
                    <AdminStatusBadge kind="subscription" status={sub.status} />
                  </TableCell>

                  {/* Ciclo */}
                  <TableCell className="text-muted-foreground">{sub.billingCycle === "YEARLY" ? "Anual" : "Mensal"}</TableCell>

                  {/* Valor/mês */}
                  <TableCell className="text-foreground">
                    R$ {(sub.plan.priceMonthly / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </TableCell>

                  {/* Trial expira */}
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>

                  {/* Criada em */}
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{new Date(sub.createdAt).toLocaleDateString("pt-BR")}</TableCell>

                  {/* Ação */}
                  <TableCell>
                    <Link
                      href={`/admin/clientes/${sub.company.id}`}
                      aria-label={`Abrir ${sub.company.name}`}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
        </div>
      )}
    </div>
  );
}
