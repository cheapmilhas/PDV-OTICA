import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { addMonths, startOfMonth, endOfMonth, differenceInDays } from "date-fns";

export interface AccountsReceivableFilters {
  customerId?: string;
  overdue?: boolean;
  startDate?: Date;
  endDate?: Date;
}

export interface ReceivableData {
  id: string;
  saleId: string;
  saleDate: Date;
  customerName: string | null;
  customerId: string | null;
  dueDate: Date;
  amount: number;
  paymentMethod: string;
  status: string;
  daysOverdue: number;
  agingCategory: string;
}

export interface AccountsReceivableReport {
  summary: {
    totalReceivable: number;
    overdue: number;
    toReceive: number;
    averageTicket: number;
    totalCustomers: number;
    overdueCustomers: number;
    totalPayments: number;
    overduePayments: number;
  };
  receivables: ReceivableData[];
  customerBreakdown: Array<{
    customerId: string;
    customerName: string;
    totalAmount: number;
    overdueAmount: number;
    paymentCount: number;
  }>;
  agingBreakdown: Array<{
    category: string;
    count: number;
    amount: number;
  }>;
  monthBreakdown: Array<{
    month: string;
    count: number;
    amount: number;
  }>;
}

export class AccountsReceivableService {
  async generateReport(
    companyId: string,
    filters: AccountsReceivableFilters
  ): Promise<AccountsReceivableReport> {
    // Build where clause for SalePayments
    const where: Prisma.SalePaymentWhereInput = {
      sale: {
        companyId,
        status: {
          not: "CANCELED",
        },
      },
      status: "PENDING",
    };

    if (filters.customerId) {
      where.sale = {
        ...where.sale,
        customerId: filters.customerId,
      };
    }

    if (filters.startDate && filters.endDate) {
      where.dueDate = {
        gte: filters.startDate,
        lte: filters.endDate,
      };
    }

    // Fetch pending payments with relations
    const payments = await prisma.salePayment.findMany({
      where,
      include: {
        sale: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        paymentMethod: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Process receivables
    const receivablesData: ReceivableData[] = payments.map((payment) => {
      const dueDate = new Date(payment.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      const daysOverdue = differenceInDays(today, dueDate);
      const isOverdue = daysOverdue > 0;

      let agingCategory = "A Vencer";
      if (isOverdue) {
        if (daysOverdue <= 30) {
          agingCategory = "0-30 dias";
        } else if (daysOverdue <= 60) {
          agingCategory = "31-60 dias";
        } else if (daysOverdue <= 90) {
          agingCategory = "61-90 dias";
        } else {
          agingCategory = "> 90 dias";
        }
      }

      return {
        id: payment.id,
        saleId: payment.saleId,
        saleDate: payment.sale.createdAt,
        customerName: payment.sale.customer?.name || null,
        customerId: payment.sale.customerId,
        dueDate: payment.dueDate,
        amount: Number(payment.amount),
        paymentMethod: payment.paymentMethod?.name || "N/A",
        status: payment.status,
        daysOverdue: isOverdue ? daysOverdue : 0,
        agingCategory,
      };
    });

    // Apply overdue filter if specified
    let filteredReceivables = receivablesData;
    if (filters.overdue) {
      filteredReceivables = receivablesData.filter((r) => r.daysOverdue > 0);
    }

    // Calculate summary
    const totalReceivable = filteredReceivables.reduce(
      (sum, r) => sum + r.amount,
      0
    );

    const overdue = filteredReceivables
      .filter((r) => r.daysOverdue > 0)
      .reduce((sum, r) => sum + r.amount, 0);

    const toReceive = filteredReceivables
      .filter((r) => r.daysOverdue === 0)
      .reduce((sum, r) => sum + r.amount, 0);

    const averageTicket =
      filteredReceivables.length > 0
        ? totalReceivable / filteredReceivables.length
        : 0;

    // Count unique customers
    const customerSet = new Set(
      filteredReceivables.filter((r) => r.customerId).map((r) => r.customerId)
    );
    const totalCustomers = customerSet.size;

    const overdueCustomerSet = new Set(
      filteredReceivables
        .filter((r) => r.customerId && r.daysOverdue > 0)
        .map((r) => r.customerId)
    );
    const overdueCustomers = overdueCustomerSet.size;

    const overduePayments = filteredReceivables.filter(
      (r) => r.daysOverdue > 0
    ).length;

    const summary = {
      totalReceivable,
      overdue,
      toReceive,
      averageTicket,
      totalCustomers,
      overdueCustomers,
      totalPayments: filteredReceivables.length,
      overduePayments,
    };

    // Customer breakdown
    const customerMap = new Map<
      string,
      { customerName: string; totalAmount: number; overdueAmount: number; paymentCount: number }
    >();

    filteredReceivables.forEach((receivable) => {
      if (!receivable.customerId || !receivable.customerName) return;

      const key = receivable.customerId;
      const current = customerMap.get(key) || {
        customerName: receivable.customerName,
        totalAmount: 0,
        overdueAmount: 0,
        paymentCount: 0,
      };

      customerMap.set(key, {
        ...current,
        totalAmount: current.totalAmount + receivable.amount,
        overdueAmount:
          current.overdueAmount +
          (receivable.daysOverdue > 0 ? receivable.amount : 0),
        paymentCount: current.paymentCount + 1,
      });
    });

    const customerBreakdown = Array.from(customerMap.entries())
      .map(([customerId, data]) => ({
        customerId,
        ...data,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // Aging breakdown
    const agingCategories = [
      "A Vencer",
      "0-30 dias",
      "31-60 dias",
      "61-90 dias",
      "> 90 dias",
    ];

    const agingBreakdown = agingCategories.map((category) => {
      const items = filteredReceivables.filter(
        (r) => r.agingCategory === category
      );
      return {
        category,
        count: items.length,
        amount: items.reduce((sum, r) => sum + r.amount, 0),
      };
    });

    // Month breakdown - next 6 months
    const monthBreakdown: Array<{
      month: string;
      count: number;
      amount: number;
    }> = [];

    for (let i = 0; i < 6; i++) {
      const monthStart = startOfMonth(addMonths(today, i));
      const monthEnd = endOfMonth(addMonths(today, i));

      const monthItems = filteredReceivables.filter((r) => {
        const dueDate = new Date(r.dueDate);
        return dueDate >= monthStart && dueDate <= monthEnd;
      });

      monthBreakdown.push({
        month: monthStart.toLocaleDateString("pt-BR", {
          month: "short",
          year: "numeric",
        }),
        count: monthItems.length,
        amount: monthItems.reduce((sum, r) => sum + r.amount, 0),
      });
    }

    return {
      summary,
      receivables: filteredReceivables,
      customerBreakdown,
      agingBreakdown,
      monthBreakdown,
    };
  }
}
