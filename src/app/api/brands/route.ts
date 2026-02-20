import { NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/brands
 * Lista marcas ativas da empresa
 */
export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const brands = await prisma.brand.findMany({
      where: {
        companyId,
        active: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      data: brands,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
