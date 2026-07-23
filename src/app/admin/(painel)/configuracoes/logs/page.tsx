import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ScrollText, User, Building2, Calendar } from "lucide-react";
import { LogsFilters } from "./logs-filters";
import { getProductContext } from "@/lib/admin-product-context";
import { buildDashboardFilters } from "../../dashboard-filters";
import { EmptyState } from "@/components/admin/EmptyState";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const ACTION_LABELS: Record<string, string> = {
  COMPANY_CREATED: "Empresa criada",
  COMPANY_BLOCKED: "Empresa bloqueada",
  COMPANY_UNBLOCKED: "Empresa desbloqueada",
  COMPANY_REACTIVATED: "Empresa reativada",
  COMPANY_DELETED: "Empresa deletada",
  TRIAL_EXTENDED: "Trial estendido",
  INVOICE_CREATED: "Fatura criada",
  INVOICE_SENT: "Fatura enviada",
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  NF_GENERATED: "NF gerada",
  NF_SENT: "NF enviada",
  NOTE_CREATED: "Nota criada",
  PLAN_CREATED: "Plano criado",
  PLAN_UPDATED: "Plano atualizado",
  PLAN_DEACTIVATED: "Plano desativado",
  ADMIN_USER_CREATED: "Admin criado",
  ADMIN_USER_UPDATED: "Admin atualizado",
  ADMIN_USER_DEACTIVATED: "Admin desativado",
  IMPERSONATION_STARTED: "Impersonação iniciada",
  IMPERSONATION_ENDED: "Impersonação encerrada",
};

function buildUrl(
  base: { action?: string; companyId?: string; dateFrom?: string; dateTo?: string },
  overrides: Record<string, string | undefined>
) {
  const p = { ...base, ...overrides };
  const qs = Object.entries(p)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&");
  return `/admin/configuracoes/logs${qs ? `?${qs}` : ""}`;
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string; companyId?: string; dateFrom?: string; dateTo?: string }>;
}) {
  await requireAdmin();

  // Auditoria é cross-cutting (sistema); os LOGS ficam globais. Só o picker de
  // empresa segue o produto ativo, para o dropdown não misturar produtos.
  const product = await getProductContext();
  const pf = buildDashboardFilters(product);

  const params = await searchParams;
  const actionFilter = params.action;
  const companyFilter = params.companyId;
  const dateFrom = params.dateFrom;
  const dateTo = params.dateTo;
  const page = parseInt(params.page || "1");
  const perPage = 50;

  // Construir where clause
  const where: Record<string, unknown> = {};
  if (actionFilter) where.action = actionFilter;
  if (companyFilter) where.companyId = companyFilter;
  if (dateFrom || dateTo) {
    where.createdAt = {} as Record<string, Date>;
    if (dateFrom) (where.createdAt as Record<string, Date>).gte = new Date(dateFrom);
    if (dateTo) (where.createdAt as Record<string, Date>).lte = new Date(dateTo + "T23:59:59Z");
  }

  const baseFilters = { action: actionFilter, companyId: companyFilter, dateFrom, dateTo };

  // Buscar dados
  const [logs, totalCount, actionCounts, companies] = await Promise.all([
    prisma.globalAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        company: { select: { id: true, name: true } },
        adminUser: { select: { id: true, name: true, email: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.globalAudit.count({ where }),
    prisma.globalAudit.groupBy({
      by: ["action"],
      _count: true,
    }),
    prisma.company.findMany({
      where: { AND: [pf.company, { globalAudits: { some: {} } }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 50,
    }),
  ]);

  const counts = actionCounts.reduce((acc, item) => {
    acc[item.action] = item._count;
    return acc;
  }, {} as Record<string, number>);

  const totalPages = Math.ceil(totalCount / perPage);

  const topActions = actionCounts
    .sort((a, b) => b._count - a._count)
    .slice(0, 10)
    .map((item) => item.action);

  return (
    <div className="p-6 text-foreground">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScrollText className="w-6 h-6 text-primary" />
          Logs de Auditoria
        </h1>
        <p className="text-sm text-muted-foreground">
          {totalCount.toLocaleString("pt-BR")} registro{totalCount !== 1 ? "s" : ""} de auditoria
        </p>
      </div>

      {/* Filtros */}
      <div className="space-y-4 mb-6">
        {/* Filtros interativos (client component) */}
        <LogsFilters
          companies={companies}
          companyId={companyFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          actionFilter={actionFilter}
        />

        {/* Filtros por ação (links server) */}
        <div className="flex flex-wrap gap-2">
          <p className="text-xs text-muted-foreground w-full mb-1">FILTRAR POR AÇÃO:</p>
          <Link
            href={buildUrl(baseFilters, { action: undefined, page: undefined })}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              !actionFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Todas ({totalCount})
          </Link>
          {topActions.map((action) => (
            <Link
              key={action}
              href={buildUrl(baseFilters, { action, page: undefined })}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                actionFilter === action ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {ACTION_LABELS[action] || action} ({counts[action] || 0})
            </Link>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {logs.length === 0 ? (
          <EmptyState icon={ScrollText} message="Nenhum log encontrado" />
        ) : (
          <ResponsiveTable minWidth={900}>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  {/* Data/Hora */}
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span className="text-xs">
                        {new Date(log.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </TableCell>
                  {/* Ação */}
                  <TableCell>
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </TableCell>
                  {/* Admin */}
                  <TableCell>
                    {log.adminUser ? (
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3 text-muted-foreground" />
                        <span className="text-foreground">{log.adminUser.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Sistema</span>
                    )}
                  </TableCell>
                  {/* Empresa */}
                  <TableCell>
                    {log.company ? (
                      <Link
                        href={`/admin/clientes/${log.company.id}`}
                        className="flex items-center gap-2 text-foreground hover:text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Building2 className="w-3 h-3" />
                        {log.company.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {/* Detalhes */}
                  <TableCell>
                    {log.metadata && typeof log.metadata === "object" ? (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ver detalhes</summary>
                        <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-w-md">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {page > 1 && (
            <Link
              href={buildUrl(baseFilters, { page: String(page - 1) })}
              className="px-4 py-2 bg-muted text-foreground rounded hover:bg-muted/80 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Anterior
            </Link>
          )}
          <span className="px-4 py-2 bg-card text-muted-foreground rounded text-sm">
            Página {page} de {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildUrl(baseFilters, { page: String(page + 1) })}
              className="px-4 py-2 bg-muted text-foreground rounded hover:bg-muted/80 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Próxima
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
