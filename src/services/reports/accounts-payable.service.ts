import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { addMonths, startOfMonth, endOfMonth, differenceInDays } from "date-fns";

export interface AccountsPayableFilters {
  supplierId?: string;
  overdue?: boolean;
  startDate?: Date;
  endDate?: Date;
}

export interface PayableData {
  id: string;
  supplierName: string | null;
  supplierId: string | null;
  description: string | null;
  dueDate: Date;
  amount: number;
  status: string;
  daysOverdue: number;
  agingCategory: string;
}

export interface AccountsPayableReport {
  summary: {
    totalPayable: number;
    overdue: number;
    toPay: number;
    averageTicket: number;
    totalSuppliers: number;
    overdueSuppliers: number;
    totalPayments: number;
    overduePayments: number;
  };
  payables: PayableData[];
  supplierBreakdown: Array<{
    supplierId: string;
    supplierName: string;
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

export class AccountsPayableService {
  async generateReport(
    companyId: string,
    filters: AccountsPayableFilters
  ): Promise<AccountsPayableReport> {
    // Build where clause for AccountPayable
    const where: Prisma.AccountPayableWhereInput = {
      companyId,
      status: "PENDING",
    };

    if (filters.supplierId) {
      where.supplierId = filters.supplierId;
    }

    if (filters.startDate && filters.endDate) {
      where.dueDate = {
        gte: filters.startDate,
        lte: filters.endDate,
      };
    }

    // Fetch pending payments with relations
    const payables = await prisma.accountPayable.findMany({
      where,
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Process payables
    const payablesData: PayableData[] = payables.map((payable) => {
      const dueDate = new Date(payable.dueDate);
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
        id: payable.id,
        supplierName: payable.supplier?.name || null,
        supplierId: payable.supplierId,
        description: payable.description,
        dueDate: payable.dueDate,
        amount: Number(payable.amount),
        status: payable.status,
        daysOverdue: isOverdue ? daysOverdue : 0,
        agingCategory,
      };
    });

    // Apply overdue filter if specified
    let filteredPayables = payablesData;
    if (filters.overdue) {
      filteredPayables = payablesData.filter((r) => r.daysOverdue > 0);
    }

    // Calculate summary
    const totalPayable = filteredPayables.reduce(
      (sum, r) => sum + r.amount,
      0
    );

    const overdue = filteredPayables
      .filter((r) => r.daysOverdue > 0)
      .reduce((sum, r) => sum + r.amount, 0);

    const toPay = filteredPayables
      .filter((r) => r.daysOverdue === 0)
      .reduce((sum, r) => sum + r.amount, 0);

    const averageTicket =
      filteredPayables.length > 0
        ? totalPayable / filteredPayables.length
        : 0;

    // Count unique suppliers
    const supplierSet = new Set(
      filteredPayables.filter((r) => r.supplierId).map((r) => r.supplierId)
    );
    const totalSuppliers = supplierSet.size;

    const overdueSupplierSet = new Set(
      filteredPayables
        .filter((r) => r.supplierId && r.daysOverdue > 0)
        .map((r) => r.supplierId)
    );
    const overdueSuppliers = overdueSupplierSet.size;

    const overduePayments = filteredPayables.filter(
      (r) => r.daysOverdue > 0
    ).length;

    const summary = {
      totalPayable,
      overdue,
      toPay,
      averageTicket,
      totalSuppliers,
      overdueSuppliers,
      totalPayments: filteredPayables.length,
      overduePayments,
    };

    // Supplier breakdown
    const supplierMap = new Map<
      string,
      { supplierName: string; totalAmount: number; overdueAmount: number; paymentCount: number }
    >();

    filteredPayables.forEach((payable) => {
      if (!payable.supplierId || !payable.supplierName) return;

      const key = payable.supplierId;
      const current = supplierMap.get(key) || {
        supplierName: payable.supplierName,
        totalAmount: 0,
        overdueAmount: 0,
        paymentCount: 0,
      };

      supplierMap.set(key, {
        ...current,
        totalAmount: current.totalAmount + payable.amount,
        overdueAmount:
          current.overdueAmount +
          (payable.daysOverdue > 0 ? payable.amount : 0),
        paymentCount: current.paymentCount + 1,
      });
    });

    const supplierBreakdown = Array.from(supplierMap.entries())
      .map(([supplierId, data]) => ({
        supplierId,
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
      const items = filteredPayables.filter(
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

      const monthItems = filteredPayables.filter((r) => {
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
      payables: filteredPayables,
      supplierBreakdown,
      agingBreakdown,
      monthBreakdown,
    };
  }
}
