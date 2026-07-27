import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowDownUp, CreditCard, ExternalLink } from "lucide-react";
import { daysUntil, formatDaysUntil } from "@/lib/trial-conversion";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/date-utils";
import { getProductContext } from "@/lib/admin-product-context";
import { buildDashboardFilters } from "../dashboard-filters";
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
  searchParams: Promise<{ status?: string; sort?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const statusFilter = params.status;
  // N4: ordenar por vencimento de trial. Nulls por último — assinatura sem
  // trial não deve encabeçar uma lista ordenada por "quem vence primeiro".
  const sortByTrial = params.sort === "trial";

  // Lente de produto (cookie admin.product): segmenta a tela igual ao dashboard.
  // Subscription chega a Company pela relação `company` → via "company".
  const product = await getProductContext();
  const pf = buildDashboardFilters(product);

  // Compõe status (opcional) + produto por AND. O groupBy dos chips e o count do
  // subtítulo TAMBÉM levam o produto — senão os KPIs contariam os dois produtos
  // enquanto a lista mostra um só (número não bateria com o visível).
  const productWhere = pf.subscriptionCompany;
  const filterWhere = statusFilter
    ? { AND: [productWhere, { status: statusFilter as any }] }
    : productWhere;
  const [subscriptions, statusCounts, filteredTotal] = await Promise.all([
    prisma.subscription.findMany({
      where: filterWhere,
      orderBy: sortByTrial
        ? [{ trialEndsAt: { sort: "asc", nulls: "last" } }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        company: { select: { id: true, name: true, email: true } },
        plan: { select: { name: true, priceMonthly: true } },
      },
      take: 100,
    }),
    prisma.subscription.groupBy({ by: ["status"], where: productWhere, _count: true }),
    // Total real respeitando o filtro atual — para o subtítulo não mentir
    // quando a lista é truncada em 100.
    prisma.subscription.count({ where: filterWhere }),
  ]);

  const counts = statusCounts.reduce((acc, item) => ({ ...acc, [item.status]: item._count }), {} as Record<string, number>);
  const total = statusCounts.reduce((acc, item) => acc + item._count, 0);
  // Um único "agora" para a tela inteira: se cada linha chamasse new Date(), a
  // contagem de dias poderia divergir entre linhas na virada da meia-noite.
  const now = new Date();

  return (
    <div className="p-6">
      <PageHeader
        title="Assinaturas"
        subtitle={
          filteredTotal > subscriptions.length
            ? `Mostrando ${subscriptions.length} de ${filteredTotal} assinaturas — refine os filtros para ver as demais`
            : `${filteredTotal} assinatura${filteredTotal !== 1 ? "s" : ""}${statusFilter ? "" : " no total"}`
        }
      />

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
                <TableHead>
                  {/* N4: ordena por quem vence primeiro. Alterna de volta para
                      a ordem padrão (mais recentes) ao clicar de novo. */}
                  <Link
                    href={`/admin/assinaturas?${new URLSearchParams({
                      ...(statusFilter ? { status: statusFilter } : {}),
                      ...(sortByTrial ? {} : { sort: "trial" }),
                    }).toString()}`}
                    className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-label={
                      sortByTrial
                        ? "Remover ordenação por vencimento de trial"
                        : "Ordenar por vencimento de trial"
                    }
                  >
                    Trial expira
                    <ArrowDownUp className={`h-3 w-3 ${sortByTrial ? "text-primary" : "opacity-40"}`} />
                  </Link>
                </TableHead>
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

                  {/* Trial expira — relativo em cima (é o que se lê de relance),
                      absoluto embaixo. Só destaca enquanto o trial está CORRENDO:
                      "venceu há 40d" numa assinatura ativa há meses é ruído. */}
                  <TableCell className="text-xs whitespace-nowrap">
                    {(() => {
                      if (!sub.trialEndsAt) return <span className="text-muted-foreground">—</span>;
                      const dias = daysUntil(sub.trialEndsAt, now);
                      const emTrial = sub.status === "TRIAL";
                      const urgente = emTrial && dias !== null && dias <= 3;
                      return (
                        <>
                          <span className={urgente ? "font-medium text-amber-600 dark:text-amber-500" : "text-foreground"}>
                            {formatDaysUntil(dias)}
                          </span>
                          {/* MESMO fuso do relativo acima. toLocaleDateString usa
                              o fuso do PROCESSO (UTC na Vercel): um trial que
                              vence 01:00Z mostraria "hoje" ao lado de "02/07". */}
                          <p className="text-muted-foreground">
                            {formatInTimeZone(sub.trialEndsAt, TIMEZONE, "dd/MM/yyyy")}
                          </p>
                        </>
                      );
                    })()}
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
