import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/dashboard/onboarding-status
 *
 * Retorna o status das etapas do checklist de onboarding.
 * Cacheado por 60s para evitar 4 queries por refresh do dashboard.
 */
export const revalidate = 60;

export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const [productCount, saleCount, osCount, userCount] = await Promise.all([
      prisma.product.count({ where: { companyId, deletedAt: null } as any }),
      prisma.sale.count({ where: { companyId, status: { notIn: ["CANCELED", "REFUNDED"] } } }),
      prisma.serviceOrder.count({ where: { companyId } }),
      prisma.user.count({ where: { companyId } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        hasProduct: productCount > 0,
        hasSale: saleCount > 0,
        hasServiceOrder: osCount > 0,
        hasMultipleUsers: userCount > 1,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
