import { prisma } from "@/lib/prisma";
import { format, eachDayOfInterval } from "date-fns";
import { Prisma } from "@prisma/client";

export interface SalesConsolidatedFilters {
  startDate: Date;
  endDate: Date;
  branchId?: string;
  sellerUserId?: string;
  paymentMethod?: string;
  status?: string;
}

export interface SalesConsolidatedReport {
  summary: {
    totalSales: number;
    totalRevenue: number;
    averageTicket: number;
    totalItems: number;
    canceledSales: number;
    canceledRevenue: number;
  };
  paymentMethods: Array<{
    method: string;
    count: number;
    total: number;
    percentage: number;
  }>;
  dailySales: Array<{
    date: string;
    sales: number;
    revenue: number;
  }>;
  topSellers: Array<{
    userId: string;
    userName: string;
    sales: number;
    revenue: number;
  }>;
  sales: Array<{
    id: string;
    date: Date;
    customerName: string | null;
    sellerName: string;
    total: number;
    status: string;
    paymentMethods: string[];
  }>;
}

export class SalesConsolidatedService {
  async generateReport(
    companyId: string,
    filters: SalesConsolidatedFilters
  ): Promise<SalesConsolidatedReport> {
    // Build where clause
    const where: Prisma.SaleWhereInput = {
      companyId,
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    };

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }

    if (filters.sellerUserId) {
      where.sellerUserId = filters.sellerUserId;
    }

    if (filters.status) {
      where.status = filters.status as any;
    }

    // Fetch sales with relations
    const sales = await prisma.sale.findMany({
      where,
      include: {
        customer: {
          select: { name: true },
        },
        sellerUser: {
          select: { name: true },
        },
        payments: {
          select: {
            method: true,
            amount: true,
            status: true,
          },
        },
        items: {
          select: {
            qty: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter by payment method if specified
    let filteredSales = sales;
    if (filters.paymentMethod) {
      filteredSales = sales.filter((sale) =>
        sale.payments.some((p) => p.method === filters.paymentMethod)
      );
    }

    // Calculate summary
    const completedSales = filteredSales.filter(
      (s) => s.status === "COMPLETED"
    );
    const canceledSales = filteredSales.filter((s) => s.status === "CANCELED");

    const totalRevenue = completedSales.reduce(
      (sum, sale) => sum + Number(sale.total),
      0
    );
    const canceledRevenue = canceledSales.reduce(
      (sum, sale) => sum + Number(sale.total),
      0
    );
    const totalItems = completedSales.reduce(
      (sum, sale) => sum + sale.items.reduce((s, item) => s + item.qty, 0),
      0
    );

    const summary = {
      totalSales: completedSales.length,
      totalRevenue,
      averageTicket: completedSales.length > 0 ? totalRevenue / completedSales.length : 0,
      totalItems,
      canceledSales: canceledSales.length,
      canceledRevenue,
    };

    // Payment methods breakdown
    const paymentMethodsMap = new Map<string, { count: number; total: number }>();

    completedSales.forEach((sale) => {
      sale.payments.forEach((payment) => {
        if (payment.status === "RECEIVED") {
          const current = paymentMethodsMap.get(payment.method) || {
            count: 0,
            total: 0,
          };
          paymentMethodsMap.set(payment.method, {
            count: current.count + 1,
            total: current.total + Number(payment.amount),
          });
        }
      });
    });

    const paymentMethods = Array.from(paymentMethodsMap.entries()).map(
      ([method, data]) => ({
        method,
        count: data.count,
        total: data.total,
        percentage: (data.total / totalRevenue) * 100,
      })
    );

    // Daily sales
    const daysInterval = eachDayOfInterval({
      start: filters.startDate,
      end: filters.endDate,
    });

    const dailySalesMap = new Map<string, { sales: number; revenue: number }>();

    completedSales.forEach((sale) => {
      const dateKey = format(sale.createdAt, "yyyy-MM-dd");
      const current = dailySalesMap.get(dateKey) || { sales: 0, revenue: 0 };
      dailySalesMap.set(dateKey, {
        sales: current.sales + 1,
        revenue: current.revenue + Number(sale.total),
      });
    });

    const dailySales = daysInterval.map((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const data = dailySalesMap.get(dateKey) || { sales: 0, revenue: 0 };
      return {
        date: dateKey,
        sales: data.sales,
        revenue: data.revenue,
      };
    });

    // Top sellers
    const sellerMap = new Map<
      string,
      { userName: string; sales: number; revenue: number }
    >();

    completedSales.forEach((sale) => {
      const current = sellerMap.get(sale.sellerUserId) || {
        userName: sale.sellerUser.name,
        sales: 0,
        revenue: 0,
      };
      sellerMap.set(sale.sellerUserId, {
        userName: current.userName,
        sales: current.sales + 1,
        revenue: current.revenue + Number(sale.total),
      });
    });

    const topSellers = Array.from(sellerMap.entries())
      .map(([userId, data]) => ({
        userId,
        ...data,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Format sales list
    const salesList = filteredSales.map((sale) => ({
      id: sale.id,
      date: sale.createdAt,
      customerName: sale.customer?.name || null,
      sellerName: sale.sellerUser.name,
      total: Number(sale.total),
      status: sale.status,
      paymentMethods: [
        ...new Set(sale.payments.map((p) => p.method)),
      ],
    }));

    return {
      summary,
      paymentMethods,
      dailySales,
      topSellers,
      sales: salesList,
    };
  }
}
