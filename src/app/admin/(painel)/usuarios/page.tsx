import { requireAdmin, getAccessibleCompanyIds } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ExternalLink, CheckCircle, XCircle, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ToggleUserButton } from "./toggle-user-button";

const ROLE_LABELS: Record<string, string> = {
  ADMIN:     "Admin",
  GERENTE:   "Gerente",
  VENDEDOR:  "Vendedor",
  CAIXA:     "Caixa",
  ATENDENTE: "Atendente",
};

// Escolha semântica (theme-aware): perfis administrativos usam primary/info,
// operacionais usam success/warning. Fallback neutro via tokens.
const ROLE_STYLES: Record<string, string> = {
  ADMIN:     "bg-primary/10 text-primary border-primary/20",
  GERENTE:   "bg-info/10 text-info border-info/20",
  VENDEDOR:  "bg-success/10 text-success border-success/20",
  CAIXA:     "bg-warning/10 text-warning border-warning/20",
  ATENDENTE: "bg-muted text-muted-foreground border-border",
};

const ROLE_FALLBACK = "bg-muted text-muted-foreground border-border";

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
  const admin = await requireAdmin();
  // Escopo: admin restrito só lista usuários de empresas do seu escopo
  // (null = irrestrito). Alinha à API /api/admin/company-users.
  const accessible = await getAccessibleCompanyIds(admin.id);
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
      accessible === null ? {} : { companyId: { in: accessible } },
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
      where: accessible === null ? undefined : { id: { in: accessible } },
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
    <div className="p-6">
      {/* Header */}
      <PageHeader
        title="Usuários"
        subtitle={`${total} usuário${total !== 1 ? "s" : ""} em ${companies.length} empresa${companies.length !== 1 ? "s" : ""}`}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 border border-success/25 text-success text-xs font-medium">
              <CheckCircle className="h-3.5 w-3.5" />
              {activeCount} ativos (página)
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/25 text-destructive text-xs font-medium">
              <XCircle className="h-3.5 w-3.5" />
              {inactiveCount} inativos (página)
            </div>
          </div>
        }
      />

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap gap-3 mb-5">
        <input
          name="search"
          defaultValue={search}
          placeholder="Buscar por nome ou email..."
          className="px-4 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring w-64"
        />

        <select
          name="companyId"
          defaultValue={companyId}
          className="px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
          className="px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Todos os perfis</option>
          {Object.entries(ROLE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={status}
          className="px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>

        <Button type="submit">Filtrar</Button>

        {(search || companyId || role || status) && (
          <Button asChild variant="secondary">
            <Link href="/admin/usuarios">Limpar</Link>
          </Button>
        )}
      </form>

      {/* Tabela */}
      {users.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Users}
            message="Nenhum usuário encontrado com os filtros aplicados"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ResponsiveTable minWidth={980}>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow
                  key={user.id}
                  className={!user.active ? "opacity-50" : undefined}
                >
                  {/* Usuário */}
                  <TableCell>
                    <p className="font-medium text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </TableCell>

                  {/* Empresa */}
                  <TableCell>
                    <Link
                      href={`/admin/clientes/${user.company.id}`}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      <span className="text-sm">
                        {user.company.tradeName ?? user.company.name}
                      </span>
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                    </Link>
                  </TableCell>

                  {/* Perfil */}
                  <TableCell>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                        ROLE_STYLES[user.role] ?? ROLE_FALLBACK
                      }`}
                    >
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    {user.active ? (
                      <span className="flex items-center gap-1.5 text-xs text-success">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Ativo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-destructive">
                        <XCircle className="h-3.5 w-3.5" />
                        Inativo
                      </span>
                    )}
                  </TableCell>

                  {/* Cadastro */}
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                  </TableCell>

                  {/* Ações */}
                  <TableCell>
                    <ToggleUserButton
                      userId={user.id}
                      active={user.active}
                      userName={user.name}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-xs text-muted-foreground">
            Exibindo {(page - 1) * limit + 1}–{Math.min(page * limit, total)} de {total}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref({ page: String(page - 1) })}
                className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  aria-current={p === page ? "page" : undefined}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    p === page
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  }`}
                >
                  {p}
                </Link>
              );
            })}
            {page < totalPages && (
              <Link
                href={buildHref({ page: String(page + 1) })}
                className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
