import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status");
    const branchId = searchParams.get("branchId");

    const where: Record<string, unknown> = { companyId };
    if (startDate && endDate) {
      where.expectedDate = {
        gte: new Date(startDate),
        lte: new Date(endDate + "T23:59:59"),
      };
    }
    if (status && status !== "all") where.status = status;
    if (branchId) where.branchId = branchId;

    const [receivables, totalGross, totalNet] = await Promise.all([
      prisma.cardReceivable.findMany({
        where,
        orderBy: { expectedDate: "asc" },
        include: {
          sale: { select: { id: true, createdAt: true, total: true } },
        },
      }),
      prisma.cardReceivable.aggregate({
        where,
        _sum: { grossAmount: true },
      }),
      prisma.cardReceivable.aggregate({
        where: { ...where, netAmount: { not: null } },
        _sum: { netAmount: true },
      }),
    ]);

    // Group by month
    const byMonth: Record<string, number> = {};
    for (const r of receivables) {
      const monthKey = r.expectedDate.toISOString().substring(0, 7);
      byMonth[monthKey] = (byMonth[monthKey] || 0) + Number(r.grossAmount);
    }

    // Group by brand
    const byBrand: Record<string, number> = {};
    for (const r of receivables) {
      const brand = r.cardBrand || "OTHER";
      byBrand[brand] = (byBrand[brand] || 0) + Number(r.grossAmount);
    }

    const data = receivables.map((r) => ({
      ...r,
      grossAmount: Number(r.grossAmount),
      netAmount: r.netAmount ? Number(r.netAmount) : null,
      feePercent: r.feePercent ? Number(r.feePercent) : null,
    }));

    return NextResponse.json({
      data,
      summary: {
        totalGross: Number(totalGross._sum.grossAmount || 0),
        totalNet: Number(totalNet._sum.netAmount || 0),
        byMonth,
        byBrand,
        count: receivables.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
