import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, getAccessibleCompanyIds } from "@/lib/admin-session";

/**
 * GET /api/admin/clientes
 * Lista empresas clientes para uso em selects e dropdowns.
 * Filtros: ?search=&status=&pageSize=50&page=1
 */
export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Escopo de listagem: null = sem restrição (SUPER_ADMIN/scopeAll); senão filtra por id in ids.
  const accessibleIds = await getAccessibleCompanyIds(admin.id);

  const { searchParams } = new URL(request.url);
  const search   = searchParams.get("search") ?? "";
  const status   = searchParams.get("status") ?? "";
  const page     = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? "50")));

  const where = {
    AND: [
      search
        ? {
            OR: [
              { name:  { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { cnpj:  { contains: search } },
            ],
          }
        : {},
      status
        ? { subscriptions: { some: { status: status as any } } }
        : {},
      accessibleIds !== null ? { id: { in: accessibleIds } } : {},
    ],
  };

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      select: {
        id:        true,
        name:      true,
        tradeName: true,
        cnpj:      true,
        email:     true,
        networkId: true,
        subscriptions: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { status: true },
        },
      },
      orderBy: { name: "asc" },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.company.count({ where }),
  ]);

  return NextResponse.json({
    data: companies,
    meta: { total, page, pageSize, pages: Math.ceil(total / pageSize) },
  });
}
