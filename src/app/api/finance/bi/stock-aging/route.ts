import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const searchParams = req.nextUrl.searchParams;
    const branchId = searchParams.get("branchId");

    const lots = await prisma.inventoryLot.findMany({
      where: {
        companyId,
        qtyRemaining: { gt: 0 },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        product: {
          select: { id: true, name: true, sku: true, type: true, salePrice: true },
        },
        supplier: { select: { name: true } },
      },
      orderBy: { acquiredAt: "asc" },
    });

    const now = new Date();

    const aging = lots.map((lot) => {
      const days = Math.floor(
        (now.getTime() - lot.acquiredAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      let band: string;
      if (days <= 30) band = "0-30 dias";
      else if (days <= 60) band = "31-60 dias";
      else if (days <= 90) band = "61-90 dias";
      else if (days <= 180) band = "91-180 dias";
      else band = "180+ dias";

      return {
        lotId: lot.id,
        product: lot.product,
        supplier: lot.supplier?.name || null,
        qtyRemaining: lot.qtyRemaining,
        unitCost: Number(lot.unitCost),
        totalValue: Number(lot.unitCost) * lot.qtyRemaining,
        acquiredAt: lot.acquiredAt,
        ageDays: days,
        ageBand: band,
      };
    });

    // Resumo por banda
    const bands = new Map<string, { count: number; qty: number; value: number }>();
    for (const item of aging) {
      const current = bands.get(item.ageBand) || { count: 0, qty: 0, value: 0 };
      current.count++;
      current.qty += item.qtyRemaining;
      current.value += item.totalValue;
      bands.set(item.ageBand, current);
    }

    return successResponse({
      items: aging,
      summary: Object.fromEntries(bands),
      totalItems: aging.length,
      totalValue: aging.reduce((sum, a) => sum + a.totalValue, 0),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
