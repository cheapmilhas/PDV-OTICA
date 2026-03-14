import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { addDays } from "date-fns";

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);

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

    if (branchId) {
      const lowStockResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM "branch_stocks" bs
        JOIN "Product" p ON p."id" = bs."product_id"
        WHERE p."companyId" = ${companyId}
          AND bs."branch_id" = ${branchId}
          AND p."stockControlled" = true
          AND p."active" = true
          AND bs."min_stock" > 0
          AND bs."quantity" <= bs."min_stock"
      `;
      productsLowStock = Number(lowStockResult[0]?.count || 0);

      productsLowStockList = await prisma.$queryRaw`
        SELECT p."id", p."name", bs."quantity" as "stockQty", bs."min_stock" as "stockMin"
        FROM "branch_stocks" bs
        JOIN "Product" p ON p."id" = bs."product_id"
        WHERE p."companyId" = ${companyId}
          AND bs."branch_id" = ${branchId}
          AND p."stockControlled" = true
          AND p."active" = true
          AND bs."min_stock" > 0
          AND bs."quantity" <= bs."min_stock"
        ORDER BY (bs."quantity" - bs."min_stock") ASC
        LIMIT 5
      `;
    } else {
      const lowStockResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM "Product"
        WHERE "companyId" = ${companyId}
          AND "stockControlled" = true
          AND "active" = true
          AND "stockMin" > 0
          AND "stockQty" <= "stockMin"
      `;
      productsLowStock = Number(lowStockResult[0]?.count || 0);

      productsLowStockList = await prisma.$queryRaw`
        SELECT id, name, "stockQty", "stockMin"
        FROM "Product"
        WHERE "companyId" = ${companyId}
          AND "stockControlled" = true
          AND "active" = true
          AND "stockMin" > 0
          AND "stockQty" <= "stockMin"
        ORDER BY ("stockQty" - "stockMin") ASC
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
