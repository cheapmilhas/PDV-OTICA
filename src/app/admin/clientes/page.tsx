import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";
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

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; health?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const search = params.search ?? "";
  const statusFilter = params.status ?? "";
  const healthFilter = params.health ?? "";

  const companies = await prisma.company.findMany({
    where: {
      AND: [
        search
          ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { cnpj: { contains: search } }, { email: { contains: search, mode: "insensitive" } }] }
          : {},
        statusFilter
          ? { subscriptions: { some: { status: statusFilter as any } } }
          : {},
        healthFilter
          ? { healthCategory: healthFilter as any }
          : {},
      ],
    },
    include: {
      subscriptions: { take: 1, orderBy: { createdAt: "desc" }, include: { plan: true } },
      _count: { select: { users: true, sales: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const statusCounts = await prisma.subscription.groupBy({ by: ["status"], _count: true });
  const counts = statusCounts.reduce((acc, item) => ({ ...acc, [item.status]: item._count }), {} as Record<string, number>);

  const filterOptions = [
    { label: "Todos", value: "" },
    { label: `Ativos (${counts.ACTIVE ?? 0})`, value: "ACTIVE" },
    { label: `Trial (${counts.TRIAL ?? 0})`, value: "TRIAL" },
    { label: `Inadimplentes (${counts.PAST_DUE ?? 0})`, value: "PAST_DUE" },
    { label: `Suspensos (${counts.SUSPENDED ?? 0})`, value: "SUSPENDED" },
    { label: `Cancelados (${counts.CANCELED ?? 0})`, value: "CANCELED" },
  ];

  return (
    <div className="p-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Empresas</h1>
          <p className="text-sm text-gray-400 mt-0.5">{companies.length} empresa{companies.length !== 1 ? "s" : ""} encontrada{companies.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Filtros */}
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
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {filterOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
          Filtrar
        </button>
        {(search || statusFilter) && (
          <Link href="/admin/clientes" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors">
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
                {["Empresa", "CNPJ", "Plano", "Status", "Health", "Usuários", "Vendas", "Cadastro", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
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
                return (
                  <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/admin/clientes/${c.id}`} className="font-medium text-white hover:text-indigo-300">{c.name}</Link>
                      {c.email && <p className="text-xs text-gray-500 truncate max-w-[180px]">{c.email}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-400 font-mono text-xs">{c.cnpj ?? "—"}</td>
                    <td className="px-5 py-3 text-gray-300">{sub?.plan?.name ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
                        {STATUS_LABELS[status] ?? status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {c.healthScore && c.healthCategory ? (
                        <HealthBadge score={c.healthScore} category={c.healthCategory} size="sm" showLabel={false} />
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-center">{c._count.users}</td>
                    <td className="px-5 py-3 text-gray-400 text-center">{c._count.sales}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{new Date(c.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td className="px-5 py-3">
                      <Link href={`/admin/clientes/${c.id}`} className="p-1.5 text-gray-500 hover:text-white rounded transition-colors inline-flex">
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
