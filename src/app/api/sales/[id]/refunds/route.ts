import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id: saleId } = await params;

    const refunds = await prisma.refund.findMany({
      where: { saleId, companyId },
      include: {
        items: {
          include: {
            saleItem: {
              select: {
                id: true,
                description: true,
                qty: true,
                unitPrice: true,
                product: { select: { name: true, sku: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(JSON.parse(JSON.stringify(refunds)));
  } catch (error) {
    return handleApiError(error);
  }
}
