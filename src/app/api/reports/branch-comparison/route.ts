import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { withPlanFeatureGuard } from "@/lib/with-plan-feature";
import { startOfLocalMonth, startOfLocalDay, endOfLocalDay } from "@/lib/date-utils";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";

/**
 * GET /api/reports/branch-comparison
 * Retorna métricas comparativas entre filiais
 */
export const GET = withPlanFeatureGuard(async (request: Request) => {
  try {
    // SEC-003: relatório exige permissão.
    await requirePermission(Permission.REPORTS_SALES);
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // M2: limites no fuso local (America/Sao_Paulo), não UTC do servidor.
    const now = new Date();
    const start = startDate ? startOfLocalDay(startDate) : startOfLocalMonth(now);
    const end = endDate ? endOfLocalDay(endDate) : now;

    const branches = await prisma.branch.findMany({
      where: { companyId, active: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    const dateFilter = { gte: start, lte: end };

    const results = await Promise.all(
      branches.map(async (branch) => {
        const [
          salesAgg,
          osTotal,
          osDelivered,
          newCustomers,
          stockValueResult,
        ] = await Promise.all([
          prisma.sale.aggregate({
            where: { companyId, branchId: branch.id, createdAt: dateFilter, status: "COMPLETED" },
            _sum: { total: true },
            _count: true,
          }),
          prisma.serviceOrder.count({
            where: { companyId, branchId: branch.id, createdAt: dateFilter },
          }),
          prisma.serviceOrder.count({
            where: { companyId, branchId: branch.id, status: "DELIVERED", deliveredAt: dateFilter },
          }),
          prisma.customer.count({
            where: { companyId, originBranchId: branch.id, createdAt: dateFilter },
          }),
          prisma.$queryRaw<Array<{ value: number }>>`
            SELECT COALESCE(SUM(bs."quantity" * p."costPrice"), 0)::float as value
            FROM "branch_stocks" bs
            JOIN "Product" p ON p."id" = bs."product_id"
            WHERE bs."branch_id" = ${branch.id} AND p."companyId" = ${companyId}
          `,
        ]);

        const salesCount = salesAgg._count;
        const salesTotal = Number(salesAgg._sum.total || 0);

        return {
          branchId: branch.id,
          branchName: branch.name,
          salesCount,
          salesTotal,
          avgTicket: salesCount > 0 ? salesTotal / salesCount : 0,
          osTotal,
          osDelivered,
          newCustomers,
          stockValue: Number(stockValueResult[0]?.value || 0),
        };
      })
    );

    // Totais
    const totals = {
      salesCount: results.reduce((s, r) => s + r.salesCount, 0),
      salesTotal: results.reduce((s, r) => s + r.salesTotal, 0),
      avgTicket: 0,
      osTotal: results.reduce((s, r) => s + r.osTotal, 0),
      osDelivered: results.reduce((s, r) => s + r.osDelivered, 0),
      newCustomers: results.reduce((s, r) => s + r.newCustomers, 0),
      stockValue: results.reduce((s, r) => s + r.stockValue, 0),
    };
    totals.avgTicket = totals.salesCount > 0 ? totals.salesTotal / totals.salesCount : 0;

    return NextResponse.json({
      success: true,
      data: { branches: results, totals, period: { start, end } },
    });
  } catch (error) {
    return handleApiError(error);
  }
});
