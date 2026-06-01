import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { logger } from "@/lib/logger";
import { requireWriteAccess } from "@/lib/subscription";
import { generateRenegotiationInterestEntry } from "@/services/finance-entry.service";

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

    // H15: registra o juro da renegociação (newAmount - saldo original) como
    // receita financeira no ledger. Antes a renegociação não gerava NENHUM
    // lançamento contábil → o ganho de juros sumia. Roda FORA da transação
    // principal (em tx própria): o lançamento contábil é secundário e não deve
    // derrubar a renegociação já persistida. Idempotente via upsert, então um
    // retry manual reproduz o mesmo resultado.
    try {
      await prisma.$transaction((tx) =>
        generateRenegotiationInterestEntry(
          tx,
          {
            accountReceivableId: original.id,
            // Base do juro = saldo EM ABERTO (amount − já recebido), não o valor
            // de face. Se houve recebimento parcial, comparar com amount cheio
            // subestimaria (ou zeraria) o juro real sobre o saldo renegociado.
            originalAmount:
              Number(original.amount) - Number(original.receivedAmount ?? 0),
            newAmount: input.newAmount,
            branchId: original.branchId,
            entryDate: now,
          },
          companyId,
        ),
      );
    } catch (entryErr) {
      log.error("Falha ao lançar juros de renegociação (não-fatal)", {
        originalId: original.id,
        err: entryErr instanceof Error ? entryErr.message : String(entryErr),
      });
    }

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
