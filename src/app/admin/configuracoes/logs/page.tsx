import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ScrollText, User, Building2, Calendar } from "lucide-react";
import { LogsFilters } from "./logs-filters";

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
      where: { globalAudits: { some: {} } },
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
    <div className="p-6 text-white">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScrollText className="w-6 h-6 text-indigo-400" />
          Logs de Auditoria
        </h1>
        <p className="text-sm text-gray-400">
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
          <p className="text-xs text-gray-500 w-full mb-1">FILTRAR POR AÇÃO:</p>
          <Link
            href={buildUrl(baseFilters, { action: undefined, page: undefined })}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              !actionFilter ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Todas ({totalCount})
          </Link>
          {topActions.map((action) => (
            <Link
              key={action}
              href={buildUrl(baseFilters, { action, page: undefined })}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                actionFilter === action ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {ACTION_LABELS[action] || action} ({counts[action] || 0})
            </Link>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Data/Hora</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Ação</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Admin</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Empresa</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <ScrollText className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-600">Nenhum log encontrado</p>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Calendar className="w-3 h-3" />
                      <span className="text-xs">
                        {new Date(log.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-indigo-900/50 text-indigo-400">
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {log.adminUser ? (
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3 text-gray-500" />
                        <span className="text-gray-300">{log.adminUser.name}</span>
                      </div>
                    ) : (
                      <span className="text-gray-500">Sistema</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {log.company ? (
                      <Link
                        href={`/admin/clientes/${log.company.id}`}
                        className="flex items-center gap-2 text-white hover:text-indigo-300"
                      >
                        <Building2 className="w-3 h-3" />
                        {log.company.name}
                      </Link>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {log.metadata && typeof log.metadata === "object" ? (
                      <details className="text-xs text-gray-400">
                        <summary className="cursor-pointer hover:text-white">Ver detalhes</summary>
                        <pre className="mt-2 p-2 bg-gray-800 rounded text-xs overflow-auto max-w-md">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {page > 1 && (
            <Link
              href={buildUrl(baseFilters, { page: String(page - 1) })}
              className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 text-sm"
            >
              Anterior
            </Link>
          )}
          <span className="px-4 py-2 bg-gray-900 text-gray-400 rounded text-sm">
            Página {page} de {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildUrl(baseFilters, { page: String(page + 1) })}
              className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 text-sm"
            >
              Próxima
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
