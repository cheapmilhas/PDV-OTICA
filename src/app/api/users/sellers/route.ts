import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const sellers = await prisma.user.findMany({
      where: {
        companyId,
        active: true,
        role: { in: ["VENDEDOR", "GERENTE", "ADMIN"] },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: sellers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
