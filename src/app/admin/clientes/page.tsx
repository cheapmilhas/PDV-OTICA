import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Building2, ExternalLink, UserPlus, Tag as TagIcon } from "lucide-react";
import { HealthBadge } from "@/components/health-badge";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo", TRIAL: "Trial", PAST_DUE: "Inadimplente",
  SUSPENDED: "Suspenso", CANCELED: "Cancelado", TRIAL_EXPIRED: "Trial Expirado",
  NO_SUBSCRIPTION: "Sem assinatura",
};
const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-900/50 text-green-400 border border-green-800",
  TRIAL: "bg-blue-900/50 text-blue-400 border border-blue-800",
  PAST_DUE: "bg-red-900/50 text-red-400 border border-red-800",
  SUSPENDED: "bg-red-900/50 text-red-400 border border-red-800",
  CANCELED: "bg-gray-800 text-gray-400 border border-gray-700",
  TRIAL_EXPIRED: "bg-orange-900/50 text-orange-400 border border-orange-800",
  NO_SUBSCRIPTION: "bg-gray-800 text-gray-400 border border-gray-700",
};
const ONBOARDING_LABELS: Record<string, string> = {
  PENDING_INVITE: "Convite pendente",
  INVITE_SENT: "Convite enviado",
  ACTIVE: "Ativo",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Completo",
  STALLED: "Parado",
};
const ONBOARDING_STYLES: Record<string, string> = {
  PENDING_INVITE: "text-gray-500",
  INVITE_SENT: "text-blue-400",
  ACTIVE: "text-green-400",
  IN_PROGRESS: "text-yellow-400",
  COMPLETED: "text-green-400",
  STALLED: "text-red-400",
};

// Filtros pré-definidos rápidos
const QUICK_FILTERS = [
  { label: "Todos", status: "", health: "", onboarding: "" },
  { label: "Trials expirando", status: "TRIAL", health: "", onboarding: "" },
  { label: "Inadimplentes", status: "PAST_DUE", health: "", onboarding: "" },
  { label: "Health Crítico", status: "", health: "CRITICAL", onboarding: "" },
  { label: "Onboarding parado", status: "", health: "", onboarding: "STALLED" },
];

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    health?: string;
    onboarding?: string;
    segment?: string;
    tag?: string;
    quick?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const search = params.search ?? "";
  const statusFilter = params.status ?? "";
  const healthFilter = params.health ?? "";
  const onboardingFilter = params.onboarding ?? "";
  const segmentFilter = params.segment ?? "";
  const tagFilter = params.tag ?? "";

  // Buscar todas as tags para o filtro
  const allTags = await prisma.tag.findMany({ orderBy: { name: "asc" } });

  const companies = await prisma.company.findMany({
    where: {
      AND: [
        search
          ? { OR: [
              { name: { contains: search, mode: "insensitive" } },
              { cnpj: { contains: search } },
              { email: { contains: search, mode: "insensitive" } },
            ]}
          : {},
        statusFilter
          ? { subscriptions: { some: { status: statusFilter as any } } }
          : {},
        healthFilter
          ? { healthCategory: healthFilter as any }
          : {},
        onboardingFilter
          ? { onboardingStatus: onboardingFilter as any }
          : {},
        segmentFilter
          ? { segment: segmentFilter as any }
          : {},
        tagFilter
          ? { companyTags: { some: { tagId: tagFilter } } }
          : {},
      ],
    },
    include: {
      subscriptions: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: { plan: true },
      },
      onboardingChecklist: {
        include: { steps: { where: { isRequired: true } } },
      },
      companyTags: { include: { tag: true }, take: 3 },
      _count: { select: { users: true, sales: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Contagens para filtros de status
  const statusCounts = await prisma.subscription.groupBy({ by: ["status"], _count: true });
  const counts = statusCounts.reduce(
    (acc, item) => ({ ...acc, [item.status]: item._count }),
    {} as Record<string, number>
  );

  return (
    <div className="p-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Empresas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {companies.length} empresa{companies.length !== 1 ? "s" : ""} encontrada{companies.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/admin/clientes/novo"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Nova Empresa
        </Link>
      </div>

      {/* Filtros rápidos */}
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_FILTERS.map((qf) => {
          const isActive =
            statusFilter === qf.status &&
            healthFilter === qf.health &&
            onboardingFilter === qf.onboarding;
          const href =
            qf.label === "Todos"
              ? "/admin/clientes"
              : `/admin/clientes?status=${qf.status}&health=${qf.health}&onboarding=${qf.onboarding}`;
          return (
            <Link
              key={qf.label}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                isActive
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
              }`}
            >
              {qf.label}
            </Link>
          );
        })}
      </div>

      {/* Filtros avançados */}
      <form method="GET" className="flex flex-wrap gap-3 mb-5">
        <input
          name="search"
          defaultValue={search}
          placeholder="Buscar por nome, CNPJ ou email..."
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-72"
        />
        <select
          name="status"
          defaultValue={statusFilter}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativos ({counts.ACTIVE ?? 0})</option>
          <option value="TRIAL">Trial ({counts.TRIAL ?? 0})</option>
          <option value="PAST_DUE">Inadimplentes ({counts.PAST_DUE ?? 0})</option>
          <option value="SUSPENDED">Suspensos ({counts.SUSPENDED ?? 0})</option>
          <option value="CANCELED">Cancelados ({counts.CANCELED ?? 0})</option>
        </select>
        <select
          name="health"
          defaultValue={healthFilter}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todos os health</option>
          <option value="CRITICAL">Crítico</option>
          <option value="AT_RISK">Em Risco</option>
          <option value="HEALTHY">Saudável</option>
          <option value="THRIVING">Excelente</option>
        </select>
        <select
          name="onboarding"
          defaultValue={onboardingFilter}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todos os onboardings</option>
          <option value="PENDING_INVITE">Convite pendente</option>
          <option value="IN_PROGRESS">Em andamento</option>
          <option value="COMPLETED">Completo</option>
          <option value="STALLED">Parado</option>
        </select>
        <select
          name="segment"
          defaultValue={segmentFilter}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todos os segmentos</option>
          <option value="MICRO">Micro</option>
          <option value="PEQUENA">Pequena</option>
          <option value="MEDIA">Média</option>
          <option value="GRANDE">Grande</option>
        </select>
        {allTags.length > 0 && (
          <select
            name="tag"
            defaultValue={tagFilter}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todas as tags</option>
            {allTags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Filtrar
        </button>
        {(search || statusFilter || healthFilter || onboardingFilter || segmentFilter || tagFilter) && (
          <Link
            href="/admin/clientes"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Limpar
          </Link>
        )}
      </form>

      {/* Tabela */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["Empresa", "Plano / MRR", "Status", "Health", "Onboarding", "Tags", "Usuários", "Cadastro", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <Building2 className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                    <p className="text-gray-600">Nenhuma empresa encontrada</p>
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
                  <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    {/* Empresa */}
                    <td className="px-4 py-3">
                      <Link href={`/admin/clientes/${c.id}`} className="font-medium text-white hover:text-indigo-300">
                        {c.name}
                      </Link>
                      {c.cnpj && <p className="text-xs text-gray-600 font-mono">{c.cnpj}</p>}
                    </td>

                    {/* Plano / MRR */}
                    <td className="px-4 py-3">
                      <p className="text-gray-300 text-xs">{sub?.plan?.name ?? "—"}</p>
                      {mrr !== null && (
                        <p className="text-xs text-gray-500">
                          R$ {(mrr / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês
                        </p>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
                        {STATUS_LABELS[status] ?? status}
                      </span>
                    </td>

                    {/* Health */}
                    <td className="px-4 py-3">
                      {c.healthScore && c.healthCategory ? (
                        <HealthBadge score={c.healthScore} category={c.healthCategory} size="sm" showLabel={false} />
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>

                    {/* Onboarding */}
                    <td className="px-4 py-3">
                      {progressPct !== null ? (
                        <div className="w-20">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs ${ONBOARDING_STYLES[c.onboardingStatus] ?? "text-gray-400"}`}>
                              {progressPct}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                progressPct === 100 ? "bg-green-500" :
                                progressPct >= 50 ? "bg-yellow-500" : "bg-red-500"
                              }`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className={`text-xs ${ONBOARDING_STYLES[c.onboardingStatus] ?? "text-gray-600"}`}>
                          {ONBOARDING_LABELS[c.onboardingStatus] ?? "—"}
                        </span>
                      )}
                    </td>

                    {/* Tags */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.companyTags.length === 0 ? (
                          <span className="text-xs text-gray-700">—</span>
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
                    <td className="px-4 py-3 text-gray-400 text-center text-xs">{c._count.users}</td>

                    {/* Cadastro */}
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                    </td>

                    {/* Ação */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/clientes/${c.id}`}
                        className="p-1.5 text-gray-500 hover:text-white rounded transition-colors inline-flex"
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
    </div>
  );
}
