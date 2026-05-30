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

    // Buscar movimentação de cashback gerada por esta venda.
    // SEGURANÇA: filtrar via sale.companyId — sem isso, leak de dado financeiro entre tenants.
    const cashbackMovement = await prisma.cashbackMovement.findFirst({
      where: {
        saleId: id,
        type: "CREDIT",
        sale: { companyId },
      },
      select: {
        id: true,
        amount: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Prisma retorna Decimal em `amount`, que não serializa para number puro
    // no JSON (vira string) — o que quebra `.toFixed()` no frontend.
    // Normalizamos para number aqui.
    const data = cashbackMovement
      ? { ...cashbackMovement, amount: Number(cashbackMovement.amount) }
      : null;

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
