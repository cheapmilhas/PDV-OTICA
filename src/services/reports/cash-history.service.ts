import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface CashHistoryFilters {
  startDate: Date;
  endDate: Date;
  branchId?: string;
  status?: string;
}

export interface CashShiftData {
  id: string;
  branchName: string;
  openedBy: string;
  closedBy: string | null;
  openedAt: Date;
  closedAt: Date | null;
  status: string;
  openingFloat: number;
  closingDeclared: number | null;
  closingExpected: number | null;
  difference: number | null;
  totalMovements: number;
  totalIn: number;
  totalOut: number;
}

export interface CashHistoryReport {
  summary: {
    totalShifts: number;
    openShifts: number;
    closedShifts: number;
    totalDifference: number;
    averageDifference: number;
    shiftsWithDifference: number;
  };
  shifts: CashShiftData[];
  differenceBreakdown: Array<{
    range: string;
    count: number;
  }>;
  branchBreakdown: Array<{
    branchId: string;
    branchName: string;
    shiftCount: number;
    totalDifference: number;
  }>;
}

export class CashHistoryService {
  async generateReport(
    companyId: string,
    filters: CashHistoryFilters
  ): Promise<CashHistoryReport> {
    // Build where clause
    const where: Prisma.CashShiftWhereInput = {
      companyId,
      openedAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    };

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }

    if (filters.status) {
      where.status = filters.status as any;
    }

    // Fetch cash shifts with relations
    const shifts = await prisma.cashShift.findMany({
      where,
      include: {
        branch: {
          select: { name: true },
        },
        openedByUser: {
          select: { name: true },
        },
        closedByUser: {
          select: { name: true },
        },
        movements: {
          select: {
            amount: true,
            direction: true,
          },
        },
      },
      orderBy: { openedAt: "desc" },
    });

    // Process shifts
    const shiftsData: CashShiftData[] = shifts.map((shift) => {
      const totalIn = shift.movements
        .filter((m) => m.direction === "IN")
        .reduce((sum, m) => sum + Number(m.amount), 0);

      const totalOut = shift.movements
        .filter((m) => m.direction === "OUT")
        .reduce((sum, m) => sum + Number(m.amount), 0);

      return {
        id: shift.id,
        branchName: shift.branch.name,
        openedBy: shift.openedByUser.name,
        closedBy: shift.closedByUser?.name || null,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        status: shift.status,
        openingFloat: Number(shift.openingFloatAmount),
        closingDeclared: shift.closingDeclaredCash
          ? Number(shift.closingDeclaredCash)
          : null,
        closingExpected: shift.closingExpectedCash
          ? Number(shift.closingExpectedCash)
          : null,
        difference: shift.differenceCash ? Number(shift.differenceCash) : null,
        totalMovements: shift.movements.length,
        totalIn,
        totalOut,
      };
    });

    // Calculate summary
    const closedShifts = shiftsData.filter((s) => s.status === "CLOSED");
    const openShifts = shiftsData.filter((s) => s.status === "OPEN");

    const totalDifference = closedShifts.reduce(
      (sum, s) => sum + (s.difference || 0),
      0
    );

    const shiftsWithDifference = closedShifts.filter(
      (s) => s.difference !== null && s.difference !== 0
    ).length;

    const averageDifference =
      closedShifts.length > 0 ? totalDifference / closedShifts.length : 0;

    const summary = {
      totalShifts: shiftsData.length,
      openShifts: openShifts.length,
      closedShifts: closedShifts.length,
      totalDifference,
      averageDifference,
      shiftsWithDifference,
    };

    // Difference breakdown
    const differenceRanges = [
      { range: "Sem diferença", min: -0.01, max: 0.01 },
      { range: "Pequena (-R$50 a R$50)", min: -50, max: 50 },
      { range: "Média (-R$200 a R$200)", min: -200, max: 200 },
      { range: "Grande (> R$200 ou < -R$200)", min: -Infinity, max: Infinity },
    ];

    const differenceBreakdown = differenceRanges.map((rangeConfig) => {
      let count = 0;
      closedShifts.forEach((shift) => {
        const diff = shift.difference || 0;
        if (rangeConfig.range === "Sem diferença") {
          if (Math.abs(diff) <= 0.01) count++;
        } else if (rangeConfig.range === "Pequena (-R$50 a R$50)") {
          if (Math.abs(diff) > 0.01 && Math.abs(diff) <= 50) count++;
        } else if (rangeConfig.range === "Média (-R$200 a R$200)") {
          if (Math.abs(diff) > 50 && Math.abs(diff) <= 200) count++;
        } else if (rangeConfig.range === "Grande (> R$200 ou < -R$200)") {
          if (Math.abs(diff) > 200) count++;
        }
      });

      return {
        range: rangeConfig.range,
        count,
      };
    });

    // Branch breakdown
    const branchMap = new Map<
      string,
      { branchName: string; shiftCount: number; totalDifference: number }
    >();

    shiftsData.forEach((shift) => {
      const key = shift.branchName;
      const current = branchMap.get(key) || {
        branchName: key,
        shiftCount: 0,
        totalDifference: 0,
      };

      branchMap.set(key, {
        ...current,
        shiftCount: current.shiftCount + 1,
        totalDifference: current.totalDifference + (shift.difference || 0),
      });
    });

    const branchBreakdown = Array.from(branchMap.entries())
      .map(([branchName, data]) => ({
        branchId: branchName,
        ...data,
      }))
      .sort((a, b) => b.shiftCount - a.shiftCount);

    return {
      summary,
      shifts: shiftsData,
      differenceBreakdown,
      branchBreakdown,
    };
  }
}
