import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { calculatePenalties } from "@/lib/penalty-utils";

/**
 * GET /api/accounts-receivable/[id]/penalties
 * Calcula multa e juros em tempo real para uma parcela
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const receivable = await prisma.accountReceivable.findFirst({
      where: { id, companyId },
    });

    if (!receivable) {
      return NextResponse.json(
        { error: "Conta a receber não encontrada" },
        { status: 404 }
      );
    }

    const penalties = calculatePenalties(receivable, new Date());

    return NextResponse.json({
      amount: Number(receivable.amount),
      finePercent: Number(receivable.finePercent ?? 0),
      interestPercent: Number(receivable.interestPercent ?? 0),
      graceDays: receivable.graceDays ?? 0,
      daysLate: penalties.daysLate,
      fine: penalties.fine,
      interest: penalties.interest,
      totalWithPenalties: penalties.totalWithPenalties,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
