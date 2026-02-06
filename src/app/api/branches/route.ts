import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/branches
 * Lista filiais da empresa
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const branches = await prisma.branch.findMany({
      where: {
        companyId,
        active: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        city: true,
        state: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      data: branches,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
