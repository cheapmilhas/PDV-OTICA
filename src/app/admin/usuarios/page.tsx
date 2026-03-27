import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Users, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { ToggleUserButton } from "./toggle-user-button";

const ROLE_LABELS: Record<string, string> = {
  ADMIN:     "Admin",
  GERENTE:   "Gerente",
  VENDEDOR:  "Vendedor",
  CAIXA:     "Caixa",
  ATENDENTE: "Atendente",
};

const ROLE_STYLES: Record<string, string> = {
  ADMIN:     "bg-indigo-900/50 text-indigo-300 border-indigo-800",
  GERENTE:   "bg-purple-900/50 text-purple-300 border-purple-800",
  VENDEDOR:  "bg-blue-900/50 text-blue-300 border-blue-800",
  CAIXA:     "bg-yellow-900/50 text-yellow-300 border-yellow-800",
  ATENDENTE: "bg-gray-800 text-gray-400 border-gray-700",
};

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    companyId?: string;
    role?: string;
    status?: string;
    page?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const search    = params.search    ?? "";
  const companyId = params.companyId ?? "";
  const role      = params.role      ?? "";
  const status    = params.status    ?? "";
  const page      = Math.max(1, Number(params.page ?? "1"));
  const limit     = 50;

  // ── Filtros ────────────────────────────────────────────────────────────────
  const where = {
    AND: [
      search
        ? {
            OR: [
              { name:  { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {},
      companyId ? { companyId } : {},
      role      ? { role: role as any } : {},
      status === "active"   ? { active: true }  : {},
      status === "inactive" ? { active: false } : {},
    ],
  };

  const [users, total, companies] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id:        true,
        name:      true,
        email:     true,
        role:      true,
        active:    true,
        createdAt: true,
        companyId: true,
        company: {
          select: { id: true, name: true, tradeName: true },
        },
      },
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.user.count({ where }),
    prisma.company.findMany({
      select: { id: true, tradeName: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);
  const activeCount   = users.filter((u) => u.active).length;
  const inactiveCount = users.filter((u) => !u.active).length;

  function buildHref(overrides: Record<string, string>) {
    const p = new URLSearchParams({
      ...(search    ? { search }    : {}),
      ...(companyId ? { companyId } : {}),
      ...(role      ? { role }      : {}),
      ...(status    ? { status }    : {}),
      ...(page > 1  ? { page: String(page) } : {}),
      ...overrides,
    });
    const qs = p.toString();
    return `/admin/usuarios${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="p-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-gray-400" />
            Usuários
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {total} usuário{total !== 1 ? "s" : ""} em {companies.length} empresa{companies.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Contadores rápidos */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-900/30 border border-green-800 text-green-400 text-xs font-medium">
            <CheckCircle className="h-3.5 w-3.5" />
            {activeCount} ativos (página)
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-xs font-medium">
            <XCircle className="h-3.5 w-3.5" />
            {inactiveCount} inativos (página)
          </div>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap gap-3 mb-5">
        <input
          name="search"
          defaultValue={search}
          placeholder="Buscar por nome ou email..."
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 w-64"
        />

        <select
          name="companyId"
          defaultValue={companyId}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todas as empresas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.tradeName ?? c.name}
            </option>
          ))}
        </select>

        <select
          name="role"
          defaultValue={role}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todos os perfis</option>
          {Object.entries(ROLE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={status}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>

        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Filtrar
        </button>

        {(search || companyId || role || status) && (
          <Link
            href="/admin/usuarios"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm rounded-lg transition-colors"
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
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Usuário</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Empresa</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Perfil</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Cadastro</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-600">
                    Nenhum usuário encontrado com os filtros aplicados
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors ${
                      !user.active ? "opacity-50" : ""
                    }`}
                  >
                    {/* Usuário */}
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-white">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </td>

                    {/* Empresa */}
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/clientes/${user.company.id}`}
                        className="flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors group"
                      >
                        <span className="text-sm">
                          {user.company.tradeName ?? user.company.name}
                        </span>
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </Link>
                    </td>

                    {/* Perfil */}
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                          ROLE_STYLES[user.role] ?? "bg-gray-800 text-gray-400 border-gray-700"
                        }`}
                      >
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      {user.active ? (
                        <span className="flex items-center gap-1.5 text-xs text-green-400">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Ativo
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-red-400">
                          <XCircle className="h-3.5 w-3.5" />
                          Inativo
                        </span>
                      )}
                    </td>

                    {/* Cadastro */}
                    <td className="px-5 py-3.5 text-xs text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                    </td>

                    {/* Ações */}
                    <td className="px-5 py-3.5">
                      <ToggleUserButton
                        userId={user.id}
                        active={user.active}
                        userName={user.name}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-xs text-gray-500">
            Exibindo {(page - 1) * limit + 1}–{Math.min(page * limit, total)} de {total}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref({ page: String(page - 1) })}
                className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
              >
                ← Anterior
              </Link>
            )}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return (
                <Link
                  key={p}
                  href={buildHref({ page: String(p) })}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    p === page
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                  }`}
                >
                  {p}
                </Link>
              );
            })}
            {page < totalPages && (
              <Link
                href={buildHref({ page: String(page + 1) })}
                className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
              >
                Próxima →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
