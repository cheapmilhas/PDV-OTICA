import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "accounts-receivable/reverse-payment" });

const reverseSchema = z.object({
  reason: z.string().min(5, "Motivo deve ter ao menos 5 caracteres"),
});

/**
 * POST /api/accounts-receivable/[id]/reverse-payment
 *
 * Reverte um recebimento já marcado como RECEIVED, retornando a conta
 * para status PENDING. Limpa receivedDate/receivedAmount/receivedByUserId
 * e grava reversedAt/reversedBy para auditoria.
 *
 * Não desfaz FinanceEntry — deixe esse passo manual (ou implementar em S6
 * quando refatorar finance-entry side-effects).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;
    const body = await request.json();
    const { reason } = reverseSchema.parse(body);

    const ar = await prisma.accountReceivable.findFirst({
      where: { id, companyId },
    });
    if (!ar) {
      return NextResponse.json({ error: { message: "Conta não encontrada" } }, { status: 404 });
    }

    if (ar.status !== "RECEIVED") {
      return NextResponse.json(
        { error: { message: "Apenas contas RECEIVED podem ser estornadas" } },
        { status: 400 },
      );
    }

    if (ar.reversedAt) {
      return NextResponse.json(
        { error: { message: "Pagamento já foi estornado anteriormente" } },
        { status: 409 },
      );
    }

    await prisma.accountReceivable.update({
      where: { id: ar.id },
      data: {
        status: "PENDING",
        receivedDate: null,
        receivedAmount: null,
        receivedByUserId: null,
        reversedAt: new Date(),
        reversedBy: session.user.id,
        notes: `${ar.notes ?? ""}\n[Estorno ${new Date().toISOString()}] ${reason}`.trim(),
      },
    });

    log.warn("Pagamento estornado", {
      arId: ar.id,
      reason,
      userId: session.user.id,
      previousAmount: ar.receivedAmount?.toString(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
