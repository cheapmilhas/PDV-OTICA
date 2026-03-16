import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { addDays } from "date-fns";
import { startOfLocalDay, startOfLocalMonth, endOfLocalMonth } from "@/lib/date-utils";

export async function GET(request: Request) {
  try {
    const companyId = await getCompanyId();
    const defaultBranchId = await getBranchId().catch(() => null);

    // Aceitar branchId via query param (do seletor de lojas)
    const { searchParams } = new URL(request.url);
    const qBranchId = searchParams.get("branchId");
    // Se branchId = "ALL" ou não informado, não filtra por branch
    const branchId = qBranchId && qBranchId !== "ALL" ? qBranchId : null;

    // Filtro condicional por branch (dados isolados)
    const branchFilter = branchId ? { branchId } : {};

    // Datas calculadas no fuso America/Sao_Paulo → UTC
    const today = startOfLocalDay(new Date());
    const yesterday = startOfLocalDay(addDays(new Date(), -1));
    const startOfMonth = startOfLocalMonth();
    const startOfLastMonth = startOfLocalMonth(addDays(startOfMonth, -1));
    const endOfLastMonth = endOfLocalMonth(addDays(startOfMonth, -1));

    // Vendas de hoje
    const salesToday = await prisma.sale.aggregate({
      where: {
        companyId,
        ...branchFilter,
        createdAt: { gte: today },
        status: "COMPLETED",
      },
      _sum: { total: true },
      _count: true,
    });

    // Vendas de ontem
    const salesYesterday = await prisma.sale.aggregate({
      where: {
        companyId,
        ...branchFilter,
        createdAt: { gte: yesterday, lt: today },
        status: "COMPLETED",
      },
      _sum: { total: true },
    });

    // Vendas do mês atual
    const salesMonth = await prisma.sale.aggregate({
      where: {
        companyId,
        ...branchFilter,
        createdAt: { gte: startOfMonth },
        status: "COMPLETED",
      },
      _sum: { total: true },
      _count: true,
    });

    // Vendas do mês anterior
    const salesLastMonth = await prisma.sale.aggregate({
      where: {
        companyId,
        ...branchFilter,
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        status: "COMPLETED",
      },
      _sum: { total: true },
    });

    // Total de clientes
    const customersTotal = await prisma.customer.count({
      where: { companyId, active: true },
    });

    // Clientes novos este mês
    const customersNew = await prisma.customer.count({
      where: {
        companyId,
        active: true,
        createdAt: { gte: startOfMonth },
      },
    });

    // Total de produtos
    const productsTotal = await prisma.product.count({
      where: { companyId, active: true },
    });

    // Produtos com estoque baixo
    // Se branch selecionada, usar BranchStock; senão, usar Product.stockQty (cache global)
    let productsLowStock: number;
    let productsLowStockList: Array<{ id: string; name: string; stockQty: number; stockMin: number }>;

    // Estoque baixo padronizado: usa stockMin do produto ou 5 como fallback
    const DEFAULT_MIN = 5;

    if (branchId) {
      // LEFT JOIN: inclui produtos com e sem branch_stock
      const lowStockResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM "Product" p
        LEFT JOIN "branch_stocks" bs ON bs."product_id" = p."id" AND bs."branch_id" = ${branchId}
        WHERE p."companyId" = ${companyId}
          AND p."stockControlled" = true
          AND p."active" = true
          AND COALESCE(bs."quantity", p."stockQty") <= COALESCE(NULLIF(COALESCE(bs."min_stock", p."stockMin"), 0), ${DEFAULT_MIN})
      `;
      productsLowStock = Number(lowStockResult[0]?.count || 0);

      productsLowStockList = await prisma.$queryRaw`
        SELECT p."id", p."name",
               COALESCE(bs."quantity", p."stockQty") as "stockQty",
               COALESCE(NULLIF(COALESCE(bs."min_stock", p."stockMin"), 0), ${DEFAULT_MIN}) as "stockMin"
        FROM "Product" p
        LEFT JOIN "branch_stocks" bs ON bs."product_id" = p."id" AND bs."branch_id" = ${branchId}
        WHERE p."companyId" = ${companyId}
          AND p."stockControlled" = true
          AND p."active" = true
          AND COALESCE(bs."quantity", p."stockQty") <= COALESCE(NULLIF(COALESCE(bs."min_stock", p."stockMin"), 0), ${DEFAULT_MIN})
        ORDER BY (COALESCE(bs."quantity", p."stockQty") - COALESCE(NULLIF(COALESCE(bs."min_stock", p."stockMin"), 0), ${DEFAULT_MIN})) ASC
        LIMIT 5
      `;
    } else {
      const lowStockResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM "Product"
        WHERE "companyId" = ${companyId}
          AND "stockControlled" = true
          AND "active" = true
          AND "stockQty" <= COALESCE(NULLIF("stockMin", 0), ${DEFAULT_MIN})
      `;
      productsLowStock = Number(lowStockResult[0]?.count || 0);

      productsLowStockList = await prisma.$queryRaw`
        SELECT id, name, "stockQty",
               COALESCE(NULLIF("stockMin", 0), ${DEFAULT_MIN}) as "stockMin"
        FROM "Product"
        WHERE "companyId" = ${companyId}
          AND "stockControlled" = true
          AND "active" = true
          AND "stockQty" <= COALESCE(NULLIF("stockMin", 0), ${DEFAULT_MIN})
        ORDER BY ("stockQty" - COALESCE(NULLIF("stockMin", 0), ${DEFAULT_MIN})) ASC
        LIMIT 5
      `;
    }

    // Ticket médio
    const avgTicket =
      salesMonth._count > 0
        ? Number(salesMonth._sum.total || 0) / salesMonth._count
        : 0;

    // Buscar meta do mês: primeiro tenta SalesGoal da filial (igual à página de Metas),
    // depois SystemRule, depois valor padrão
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const goalBranchId = branchId || defaultBranchId;

    const [salesGoal, goalRule] = await Promise.all([
      goalBranchId
        ? prisma.salesGoal.findFirst({
            where: { branchId: goalBranchId, year: currentYear, month: currentMonth },
          })
        : Promise.resolve(null),
      prisma.systemRule.findFirst({
        where: { key: "sales.monthly_goal", active: true },
      }),
    ]);

    const goalMonth = salesGoal?.branchGoal
      ? Number(salesGoal.branchGoal)
      : goalRule?.value
        ? (typeof goalRule.value === 'number' ? goalRule.value : Number(goalRule.value))
        : 0;

    // Contar Ordens de Serviço
    const osOpen = await prisma.serviceOrder.count({
      where: {
        companyId,
        ...branchFilter,
        status: {
          in: ["APPROVED", "IN_PROGRESS", "READY"],
        },
      },
    });

    const osPending = await prisma.serviceOrder.count({
      where: {
        companyId,
        ...branchFilter,
        status: "SENT_TO_LAB",
      },
    });

    const now = new Date();
    const in3Days = addDays(now, 3);

    // OS atrasadas: prazo vencido OU marcada como atrasada, não entregue/cancelada
    const osDelayed = await prisma.serviceOrder.count({
      where: {
        companyId,
        ...branchFilter,
        status: { notIn: ["DELIVERED", "CANCELED"] },
        OR: [
          { promisedDate: { lt: now } },
          { isDelayed: true },
        ],
      },
    });

    // OS com prazo próximo: vence nos próximos 3 dias
    const osNearDeadline = await prisma.serviceOrder.count({
      where: {
        companyId,
        ...branchFilter,
        promisedDate: { gte: now, lte: in3Days },
        status: { notIn: ["DELIVERED", "CANCELED"] },
      },
    });

    // Lista das OS atrasadas para exibir no card
    const osDelayedList = await prisma.serviceOrder.findMany({
      where: {
        companyId,
        ...branchFilter,
        status: { notIn: ["DELIVERED", "CANCELED"] },
        OR: [
          { promisedDate: { lt: now } },
          { isDelayed: true },
        ],
      },
      select: {
        id: true,
        number: true,
        promisedDate: true,
        customer: { select: { name: true } },
      },
      orderBy: { promisedDate: "asc" },
      take: 5,
    });

    // Breakdown por branch (quando admin vê todas as lojas)
    let salesTodayByBranch: Array<{ branchId: string; branchName: string; total: number; count: number }> = [];
    if (!branchId) {
      const activeBranches = await prisma.branch.findMany({
        where: { companyId, active: true },
        select: { id: true, name: true },
      });
      const byBranch = await prisma.sale.groupBy({
        by: ["branchId"],
        where: { companyId, createdAt: { gte: today }, status: "COMPLETED" },
        _sum: { total: true },
        _count: true,
      });
      salesTodayByBranch = byBranch.map((sb) => ({
        branchId: sb.branchId,
        branchName: activeBranches.find((b) => b.id === sb.branchId)?.name || "—",
        total: Number(sb._sum.total || 0),
        count: sb._count,
      }));
    }

    const metrics = {
      salesToday: Number(salesToday._sum.total || 0),
      salesYesterday: Number(salesYesterday._sum.total || 0),
      salesMonth: Number(salesMonth._sum.total || 0),
      salesLastMonth: Number(salesLastMonth._sum.total || 0),
      salesMonthAccumulated: Number(salesMonth._sum.total || 0),
      customersTotal,
      customersNew,
      productsTotal,
      productsLowStock,
      productsLowStockList,
      salesCount: salesToday._count,
      avgTicket: Number(avgTicket),
      goalMonth,
      osOpen,
      osPending,
      osDelayed,
      osNearDeadline,
      osDelayedList,
      salesTodayByBranch,
    };

    return NextResponse.json({ metrics });
  } catch (error) {
    console.error("Erro ao buscar métricas:", error);
    return NextResponse.json(
      { error: "Erro ao buscar métricas" },
      { status: 500 }
    );
  }
}
