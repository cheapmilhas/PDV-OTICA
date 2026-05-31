import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { logger } from "@/lib/logger";
import { requireWriteAccess } from "@/lib/subscription";

const log = logger.child({ route: "accounts-receivable/renegotiate" });

const renegotiateSchema = z.object({
  newDueDate: z.string().min(1),
  newAmount: z.number().positive(),
  installments: z.number().int().min(1).max(60).default(1),
  notes: z.string().optional(),
});

/**
 * POST /api/accounts-receivable/[id]/renegotiate
 *
 * Marca a conta original como RENEGOTIATED e cria N novas parcelas
 * com nova data de vencimento e valor renegociado. As novas ARs ficam
 * vinculadas ao mesmo Sale.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    // F1/F2: renegociar muta o ledger de dívida — bloqueia inadimplente.
    await requireWriteAccess(companyId);
    const { id } = await params;
    const body = await request.json();
    const input = renegotiateSchema.parse(body);

    const original = await prisma.accountReceivable.findFirst({
      where: { id, companyId },
    });
    if (!original) {
      return NextResponse.json({ error: { message: "Conta não encontrada" } }, { status: 404 });
    }

    if (original.status === "RECEIVED") {
      return NextResponse.json(
        { error: { message: "Conta já recebida, nada a renegociar" } },
        { status: 400 },
      );
    }
    if (original.status === "RENEGOTIATED") {
      return NextResponse.json(
        { error: { message: "Conta já foi renegociada" } },
        { status: 409 },
      );
    }

    const baseDueDate = new Date(input.newDueDate);
    const installmentValue =
      Math.round((input.newAmount / input.installments) * 100) / 100;
    const lastInstallmentAdjust =
      Math.round((input.newAmount - installmentValue * (input.installments - 1)) * 100) / 100;

    const now = new Date();
    const created = await prisma.$transaction(async (tx) => {
      // Q7.3 P2-9: rastreabilidade explícita via renegotiatedAt — antes
      // só notes marcava, fácil perder em edição.
      await tx.accountReceivable.update({
        where: { id: original.id },
        data: {
          status: "RENEGOTIATED",
          renegotiatedAt: now,
          notes: input.notes
            ? `${original.notes ?? ""}\n[Renegociada] ${input.notes}`.trim()
            : `${original.notes ?? ""}\n[Renegociada]`.trim(),
        },
      });

      const newARs = [];
      for (let i = 0; i < input.installments; i++) {
        const due = new Date(baseDueDate);
        due.setMonth(due.getMonth() + i);
        const amount =
          i === input.installments - 1 ? lastInstallmentAdjust : installmentValue;

        const ar = await tx.accountReceivable.create({
          data: {
            companyId,
            branchId: original.branchId,
            customerId: original.customerId,
            saleId: original.saleId,
            description: `${original.description} (Renegociação)`,
            installmentNumber: i + 1,
            totalInstallments: input.installments,
            amount,
            dueDate: due,
            status: "PENDING",
            finePercent: original.finePercent,
            interestPercent: original.interestPercent,
            graceDays: original.graceDays,
            createdByUserId: session.user.id,
            // Q7.3 P2-9: FK soft + valor original preservados na NOVA AR
            renegotiatedFromId: original.id,
            originalAmount: original.amount,
            notes: `Renegociação de ${original.id}`,
          },
        });
        newARs.push(ar);
      }

      return newARs;
    }, { timeout: 30_000 });

    log.info("Conta renegociada", {
      originalId: original.id,
      newCount: created.length,
      userId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: { newReceivables: created.map((ar) => ar.id) },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
