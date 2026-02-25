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

    const nsu = searchParams.get("nsu");
    const authCode = searchParams.get("authCode");
    const amount = searchParams.get("amount");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const cardBrand = searchParams.get("cardBrand");

    const where: any = {
      sale: { companyId },
      method: { in: ["CREDIT_CARD", "DEBIT_CARD"] },
      status: "RECEIVED",
    };

    if (nsu) where.nsu = { contains: nsu };
    if (authCode) where.authorizationCode = { contains: authCode };
    if (cardBrand) where.cardBrand = { contains: cardBrand, mode: "insensitive" };
    if (amount) {
      const amt = parseFloat(amount);
      const tolerance = amt * 0.02; // 2% tolerance
      where.amount = { gte: amt - tolerance, lte: amt + tolerance };
    }
    if (startDate || endDate) {
      where.receivedAt = {};
      if (startDate) where.receivedAt.gte = new Date(startDate);
      if (endDate) where.receivedAt.lte = new Date(endDate);
    }

    const payments = await prisma.salePayment.findMany({
      where,
      include: {
        sale: {
          select: {
            id: true,
            total: true,
            completedAt: true,
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: { receivedAt: "desc" },
      take: 50,
    });

    return successResponse(JSON.parse(JSON.stringify(payments)));
  } catch (error) {
    return handleApiError(error);
  }
}
