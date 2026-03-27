import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

/**
 * GET /api/admin/company-users
 * Lista todos os usuários de todas as empresas clientes.
 * Filtros: ?search=&companyId=&role=&status=active|inactive&page=1
 */
export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search     = searchParams.get("search") ?? "";
  const companyId  = searchParams.get("companyId") ?? "";
  const role       = searchParams.get("role") ?? "";
  const status     = searchParams.get("status") ?? "";   // "active" | "inactive"
  const page       = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit      = 50;

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

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
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
  ]);

  return NextResponse.json({
    data: users,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}
