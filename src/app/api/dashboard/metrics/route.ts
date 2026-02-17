import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth-helpers";
import { addDays } from "date-fns";

export async function GET() {
  try {
    const companyId = await getCompanyId();
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
        createdAt: { gte: yesterday, lt: today },
        status: "COMPLETED",
      },
      _sum: { total: true },
    });

    // Vendas do mês atual
    const salesMonth = await prisma.sale.aggregate({
      where: {
        companyId,
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

    // Produtos com estoque baixo (usando $queryRaw pois Prisma não suporta comparar campos entre si)
    const lowStockResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Product"
      WHERE "companyId" = ${companyId}
        AND "stockControlled" = true
        AND "active" = true
        AND "stockMin" > 0
        AND "stockQty" <= "stockMin"
    `;
    const productsLowStock = Number(lowStockResult[0]?.count || 0);

    // Lista dos produtos com estoque baixo para exibir no card
    const productsLowStockList = await prisma.$queryRaw<Array<{ id: string; name: string; stockQty: number; stockMin: number }>>`
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

    // Ticket médio
    const avgTicket =
      salesMonth._count > 0
        ? Number(salesMonth._sum.total || 0) / salesMonth._count
        : 0;

    // Buscar meta do mês (de SystemRule ou valor padrão)
    const goalRule = await prisma.systemRule.findFirst({
      where: {
        key: "sales.monthly_goal",
        active: true,
      },
    });

    const goalMonth = goalRule?.value
      ? (typeof goalRule.value === 'number' ? goalRule.value : Number(goalRule.value))
      : 75400.20; // Valor padrão caso não exista regra

    // Contar Ordens de Serviço
    const osOpen = await prisma.serviceOrder.count({
      where: {
        companyId,
        status: {
          in: ["APPROVED", "IN_PROGRESS", "READY"],
        },
      },
    });

    const osPending = await prisma.serviceOrder.count({
      where: {
        companyId,
        status: "SENT_TO_LAB",
      },
    });

    const now = new Date();
    const in3Days = addDays(now, 3);

    // OS atrasadas: prazo vencido OU marcada como atrasada, não entregue/cancelada
    const osDelayed = await prisma.serviceOrder.count({
      where: {
        companyId,
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
        promisedDate: { gte: now, lte: in3Days },
        status: { notIn: ["DELIVERED", "CANCELED"] },
      },
    });

    // Lista das OS atrasadas para exibir no card
    const osDelayedList = await prisma.serviceOrder.findMany({
      where: {
        companyId,
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
