import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    // Buscar movimentação de cashback gerada por esta venda
    const cashbackMovement = await prisma.cashbackMovement.findFirst({
      where: {
        saleId: id,
        type: "CREDIT",
      },
      select: {
        id: true,
        amount: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: cashbackMovement,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
