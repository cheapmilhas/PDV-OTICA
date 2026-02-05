import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
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
        createdAt: { gte: today },
        status: "COMPLETED",
      },
      _sum: { total: true },
      _count: true,
    });

    // Vendas de ontem
    const salesYesterday = await prisma.sale.aggregate({
      where: {
        createdAt: { gte: yesterday, lt: today },
        status: "COMPLETED",
      },
      _sum: { total: true },
    });

    // Vendas do mês atual
    const salesMonth = await prisma.sale.aggregate({
      where: {
        createdAt: { gte: startOfMonth },
        status: "COMPLETED",
      },
      _sum: { total: true },
      _count: true,
    });

    // Vendas do mês anterior
    const salesLastMonth = await prisma.sale.aggregate({
      where: {
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        status: "COMPLETED",
      },
      _sum: { total: true },
    });

    // Total de clientes
    const customersTotal = await prisma.customer.count({
      where: { active: true },
    });

    // Clientes novos este mês
    const customersNew = await prisma.customer.count({
      where: {
        active: true,
        createdAt: { gte: startOfMonth },
      },
    });

    // Total de produtos
    const productsTotal = await prisma.product.count({
      where: { active: true },
    });

    // Produtos com estoque baixo
    const productsLowStock = await prisma.product.count({
      where: {
        active: true,
        stockControlled: true,
        stockQty: { lte: prisma.product.fields.stockMin },
      },
    });

    // Ticket médio
    const avgTicket =
      salesMonth._count > 0
        ? (salesMonth._sum.total || 0) / salesMonth._count
        : 0;

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
      salesCount: salesToday._count,
      avgTicket: Number(avgTicket),
      goalMonth: 75400.20, // TODO: Buscar meta do banco
      osOpen: 0, // TODO: Implementar contagem de OS
      osPending: 0,
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
