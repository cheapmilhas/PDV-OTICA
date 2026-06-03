import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { logger } from "@/lib/logger";
import { reverseAccountReceivableCash } from "@/services/cash.service";
import { generateARReversalEntry } from "@/services/finance-entry.service";

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
 * C2: estorna também o caixa de forma atômica — busca o CashMovement IN
 * original deste AR e cria um REFUND OUT compensatório se o shift ainda
 * está OPEN. Antes só mudava o status, deixando o R$ no caixa (ghost cash).
 * Mesma lógica do ramo PATCH action=reverse de ../route.ts.
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

    await prisma.$transaction(async (tx) => {
      // Trava a linha e relê reversedAt/notes DENTRO da tx para fechar a janela
      // de duplo estorno concorrente (o helper já é idempotente no caixa, mas
      // isto evita duplo registro de auditoria / perda de notes).
      const locked = await tx.$queryRaw<{ reversedAt: Date | null; notes: string | null }[]>`
        SELECT "reversedAt", "notes" FROM "AccountReceivable"
        WHERE id = ${ar.id} AND "companyId" = ${companyId}
        FOR UPDATE
      `;
      if (locked[0]?.reversedAt) {
        throw new AppError(ERROR_CODES.DUPLICATE, "Pagamento já foi estornado anteriormente", 409);
      }

      // Estorno idempotente do caixa (IN - OUT líquido por shift OPEN).
      await reverseAccountReceivableCash(tx, {
        accountReceivableId: ar.id,
        description: ar.description,
        userId: session.user.id,
      });

      // Q8.2.1: lançamento contábil do estorno (Débito Devoluções / Crédito
      // Contas a Receber). Idempotente; ledger fica correto mesmo que o DRE
      // ainda não o leia (dívida H15). Usa o valor recebido antes de zerá-lo.
      await generateARReversalEntry(
        tx,
        {
          accountReceivableId: ar.id,
          amount: Number(ar.receivedAmount ?? ar.amount),
          branchId: ar.branchId,
        },
        companyId,
      );

      // Reverter status do AR.
      await tx.accountReceivable.update({
        where: { id: ar.id },
        data: {
          status: "PENDING",
          receivedDate: null,
          receivedAmount: null,
          receivedByUserId: null,
          reversedAt: new Date(),
          reversedBy: session.user.id,
          notes: `${locked[0]?.notes ?? ""}\n[Estorno ${new Date().toISOString()}] ${reason}`.trim(),
        },
      });
    }, { timeout: 30_000 });

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
