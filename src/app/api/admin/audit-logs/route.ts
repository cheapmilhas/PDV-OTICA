import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { Prisma } from "@prisma/client";

/**
 * GET /api/admin/audit-logs
 * Lista logs de auditoria com filtros
 *
 * Query params:
 * - action: string (filtrar por ação)
 * - companyId: string (filtrar por empresa)
 * - adminId: string (filtrar por admin)
 * - dateFrom: string ISO (data início)
 * - dateTo: string ISO (data fim)
 * - page: number (default: 1)
 * - pageSize: number (default: 50)
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const companyId = searchParams.get("companyId");
  const adminId = searchParams.get("adminId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50"), 100);

  const where: Prisma.GlobalAuditWhereInput = {};

  if (action) where.action = action;
  if (companyId) where.companyId = companyId;
  if (adminId) where.actorId = adminId;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  const [logs, totalCount] = await Promise.all([
    prisma.globalAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        company: { select: { id: true, name: true } },
        adminUser: { select: { id: true, name: true, email: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.globalAudit.count({ where }),
  ]);

  return NextResponse.json({
    data: logs,
    pagination: {
      page,
      pageSize,
      total: totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  });
}
