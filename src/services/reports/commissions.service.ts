import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface CommissionsReportFilters {
  startDate: Date;
  endDate: Date;
  userId?: string;
  status?: string;
}

export interface SellerCommissionData {
  userId: string;
  userName: string;
  totalSales: number;
  totalRevenue: number;
  totalCommission: number;
  averageCommissionPercent: number;
  pendingCommission: number;
  approvedCommission: number;
  paidCommission: number;
  salesCount: number;
}

export interface CommissionsReport {
  summary: {
    totalSellers: number;
    totalCommission: number;
    pendingCommission: number;
    approvedCommission: number;
    paidCommission: number;
    totalSales: number;
    totalRevenue: number;
  };
  sellers: SellerCommissionData[];
  statusBreakdown: Array<{
    status: string;
    count: number;
    amount: number;
  }>;
  commissions: Array<{
    id: string;
    saleId: string;
    saleDate: Date;
    userName: string;
    customerName: string | null;
    baseAmount: number;
    percentage: number;
    commissionAmount: number;
    status: string;
  }>;
}

export class CommissionsService {
  async generateReport(
    companyId: string,
    filters: CommissionsReportFilters
  ): Promise<CommissionsReport> {
    // Build where clause for sales
    const saleWhere: Prisma.SaleWhereInput = {
      companyId,
      status: "COMPLETED",
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    };

    if (filters.userId) {
      saleWhere.sellerUserId = filters.userId;
    }

    // Build where clause for commissions
    const commissionWhere: Prisma.CommissionWhereInput = {
      companyId,
      sale: {
        ...saleWhere,
      },
    };

    if (filters.status) {
      commissionWhere.status = filters.status as any;
    }

    // Fetch commissions with relations
    const commissions = await prisma.commission.findMany({
      where: commissionWhere,
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        sale: {
          select: {
            id: true,
            createdAt: true,
            customer: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { sale: { createdAt: "desc" } },
    });

    // Group by seller
    const sellerMap = new Map<
      string,
      {
        userName: string;
        totalSales: number;
        totalRevenue: number;
        totalCommission: number;
        totalPercentage: number;
        pendingCommission: number;
        approvedCommission: number;
        paidCommission: number;
        salesCount: number;
      }
    >();

    commissions.forEach((commission) => {
      const userId = commission.userId;
      const current = sellerMap.get(userId) || {
        userName: commission.user.name,
        totalSales: 0,
        totalRevenue: 0,
        totalCommission: 0,
        totalPercentage: 0,
        pendingCommission: 0,
        approvedCommission: 0,
        paidCommission: 0,
        salesCount: 0,
      };

      const commissionAmount = Number(commission.commissionAmount);

      sellerMap.set(userId, {
        ...current,
        totalSales: current.totalSales + 1,
        totalRevenue: current.totalRevenue + Number(commission.baseAmount),
        totalCommission: current.totalCommission + commissionAmount,
        totalPercentage:
          current.totalPercentage + Number(commission.percentage),
        pendingCommission:
          commission.status === "PENDING"
            ? current.pendingCommission + commissionAmount
            : current.pendingCommission,
        approvedCommission:
          commission.status === "APPROVED"
            ? current.approvedCommission + commissionAmount
            : current.approvedCommission,
        paidCommission:
          commission.status === "PAID"
            ? current.paidCommission + commissionAmount
            : current.paidCommission,
        salesCount: current.salesCount + 1,
      });
    });

    // Convert to array
    const sellers: SellerCommissionData[] = Array.from(
      sellerMap.entries()
    ).map(([userId, data]) => ({
      userId,
      userName: data.userName,
      totalSales: data.totalSales,
      totalRevenue: data.totalRevenue,
      totalCommission: data.totalCommission,
      averageCommissionPercent:
        data.salesCount > 0 ? data.totalPercentage / data.salesCount : 0,
      pendingCommission: data.pendingCommission,
      approvedCommission: data.approvedCommission,
      paidCommission: data.paidCommission,
      salesCount: data.salesCount,
    }));

    // Sort by total commission descending
    sellers.sort((a, b) => b.totalCommission - a.totalCommission);

    // Calculate summary
    const totalCommission = commissions.reduce(
      (sum, c) => sum + Number(c.commissionAmount),
      0
    );
    const pendingCommission = commissions
      .filter((c) => c.status === "PENDING")
      .reduce((sum, c) => sum + Number(c.commissionAmount), 0);
    const approvedCommission = commissions
      .filter((c) => c.status === "APPROVED")
      .reduce((sum, c) => sum + Number(c.commissionAmount), 0);
    const paidCommission = commissions
      .filter((c) => c.status === "PAID")
      .reduce((sum, c) => sum + Number(c.commissionAmount), 0);
    const totalRevenue = commissions.reduce(
      (sum, c) => sum + Number(c.baseAmount),
      0
    );

    const summary = {
      totalSellers: sellers.length,
      totalCommission,
      pendingCommission,
      approvedCommission,
      paidCommission,
      totalSales: commissions.length,
      totalRevenue,
    };

    // Status breakdown
    const statusMap = new Map<string, { count: number; amount: number }>();
    commissions.forEach((commission) => {
      const status = commission.status;
      const current = statusMap.get(status) || { count: 0, amount: 0 };
      statusMap.set(status, {
        count: current.count + 1,
        amount: current.amount + Number(commission.commissionAmount),
      });
    });

    const statusBreakdown = Array.from(statusMap.entries()).map(
      ([status, data]) => ({
        status,
        count: data.count,
        amount: data.amount,
      })
    );

    // Commission details list
    const commissionsList = commissions.map((commission) => ({
      id: commission.id,
      saleId: commission.saleId,
      saleDate: commission.sale.createdAt,
      userName: commission.user.name,
      customerName: commission.sale.customer?.name || null,
      baseAmount: Number(commission.baseAmount),
      percentage: Number(commission.percentage),
      commissionAmount: Number(commission.commissionAmount),
      status: commission.status,
    }));

    return {
      summary,
      sellers,
      statusBreakdown,
      commissions: commissionsList,
    };
  }
}
