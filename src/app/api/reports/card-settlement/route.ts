import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { searchParams } = new URL(req.url);

    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : new Date();
    const status = searchParams.get("status"); // PENDING, SETTLED, ALL

    const startOfDay = new Date(startDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);

    const where: Record<string, unknown> = {
      sale: { companyId },
      method: { in: ["CREDIT_CARD", "DEBIT_CARD", "PIX"] },
      settlementDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };

    if (status && status !== "ALL") {
      where.settlementStatus = status;
    }

    const payments = await prisma.salePayment.findMany({
      where,
      include: {
        sale: {
          select: {
            id: true,
            createdAt: true,
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: { settlementDate: "asc" },
    });

    // Agrupar por data de liquidação
    const byDate = payments.reduce(
      (acc, p) => {
        const dateKey = p.settlementDate
          ? p.settlementDate.toISOString().split("T")[0]
          : "sem-data";
        if (!acc[dateKey]) {
          acc[dateKey] = {
            date: dateKey,
            payments: [],
            totalGross: 0,
            totalFee: 0,
            totalNet: 0,
          };
        }
        acc[dateKey].payments.push({
          ...p,
          amount: Number(p.amount),
          feeAmount: Number(p.feeAmount || 0),
          netAmount: Number(p.netAmount || p.amount),
        });
        acc[dateKey].totalGross += Number(p.amount);
        acc[dateKey].totalFee += Number(p.feeAmount || 0);
        acc[dateKey].totalNet += Number(p.netAmount || p.amount);
        return acc;
      },
      {} as Record<string, { date: string; payments: unknown[]; totalGross: number; totalFee: number; totalNet: number }>
    );

    const byBrand: Record<string, number> = {};
    payments.forEach((p) => {
      const brand = p.cardBrand || "OUTROS";
      byBrand[brand] = (byBrand[brand] || 0) + Number(p.amount);
    });

    const summary = {
      totalGross: payments.reduce((sum, p) => sum + Number(p.amount), 0),
      totalFee: payments.reduce((sum, p) => sum + Number(p.feeAmount || 0), 0),
      totalNet: payments.reduce((sum, p) => sum + Number(p.netAmount || p.amount), 0),
      totalPayments: payments.length,
      byBrand,
    };

    return NextResponse.json({
      data: Object.values(byDate),
      summary,
      period: { startDate, endDate },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
