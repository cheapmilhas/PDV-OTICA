import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { requireWriteAccess } from "@/lib/subscription";
import { z } from "zod";
import { AccountReceivableStatus } from "@prisma/client";
import { calculatePenalties } from "@/lib/penalty-utils";

/**
 * Schema de validação para recebimento com múltiplos pagamentos
 */
const receiveMultiplePaymentsSchema = z.object({
  accountId: z.string().min(1, "ID da conta é obrigatório"),
  payments: z.array(
    z.object({
      method: z.enum(["CASH", "PIX", "DEBIT_CARD", "CREDIT_CARD", "BANK_TRANSFER", "BANK_SLIP"]),
      amount: z.number().positive("Valor deve ser positivo"),
    })
  ).min(1, "Adicione pelo menos uma forma de pagamento"),
  receivedDate: z.string().datetime().optional(),
  discountAmount: z.number().min(0).optional().default(0),
  fineAmount: z.number().min(0).optional(),
  interestAmount: z.number().min(0).optional(),
});

/**
 * POST /api/accounts-receivable/receive-multiple
 * Recebe conta a receber com múltiplos métodos de pagamento
 *
 * Body:
 * {
 *   accountId: string,
 *   payments: [{ method: string, amount: number }],
 *   receivedDate?: string (ISO)
 * }
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const companyId = await getCompanyId();
    // F1/F2: receber AR é operação de escrita financeira — bloqueia inadimplente.
    await requireWriteAccess(companyId);
    await requirePermission("accounts_receivable.manage");
    const userId = session.user.id;

    const body = await request.json();
    const data = receiveMultiplePaymentsSchema.parse(body);

    // Verificar se a conta existe e pertence à empresa
    const existing = await prisma.accountReceivable.findFirst({
      where: {
        id: data.accountId,
        companyId,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: { message: "Conta a receber não encontrada" } },
        { status: 404 }
      );
    }

    if (existing.status === AccountReceivableStatus.RECEIVED) {
      return NextResponse.json(
        { error: { message: "Esta conta já foi recebida" } },
        { status: 409 }
      );
    }

    if (existing.status === AccountReceivableStatus.CANCELED) {
      return NextResponse.json(
        { error: { message: "Esta conta está cancelada" } },
        { status: 400 }
      );
    }

    // Calcular penalidades
    const penalties = calculatePenalties(existing, new Date());
    const originalAmount = Number(existing.amount);

    // Usar valores enviados pelo frontend ou calculados automaticamente
    const fineAmount = data.fineAmount ?? penalties.fine;
    const interestAmount = data.interestAmount ?? penalties.interest;
    const discountAmount = data.discountAmount ?? 0;

    // Total esperado = valor original + multa + juros - desconto
    const totalExpected = Math.round((originalAmount + fineAmount + interestAmount - discountAmount) * 100) / 100;

    // Calcular total recebido nesta operação
    const totalReceived = data.payments.reduce((sum, p) => sum + p.amount, 0);

    const receivedDate = data.receivedDate ? new Date(data.receivedDate) : new Date();

    // Usar transação para atualizar conta e criar movimentos no caixa
    const result = await prisma.$transaction(async (tx) => {
      // C3: trava a linha do AR (SELECT FOR UPDATE) e relê receivedAmount
      // DENTRO da transação. Antes a leitura era fora → duas chamadas parciais
      // concorrentes (ou duplo-clique no botão) liam o mesmo saldo e ambas
      // criavam CashMovement IN → ghost cash. Agora as parciais serializam.
      const locked = await tx.$queryRaw<{ receivedAmount: string | null; status: string; notes: string | null }[]>`
        SELECT "receivedAmount", "status", "notes" FROM "AccountReceivable"
        WHERE id = ${data.accountId} AND "companyId" = ${companyId}
        FOR UPDATE
      `;
      const lockedRow = locked[0];
      if (!lockedRow) {
        throw new AppError(ERROR_CODES.NOT_FOUND, "Conta a receber não encontrada", 404);
      }
      if (lockedRow.status === AccountReceivableStatus.RECEIVED) {
        throw new AppError(ERROR_CODES.DUPLICATE, "Esta conta já foi recebida", 409);
      }
      if (lockedRow.status === AccountReceivableStatus.CANCELED) {
        throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, "Esta conta está cancelada", 400);
      }

      // Acumular sobre o que já havia sido pago em parciais anteriores. Antes
      // receivedAmount era sobrescrito → cada parcial validava contra o total
      // cheio, permitindo pagar o valor inteiro N vezes.
      const alreadyReceived = Number(lockedRow.receivedAmount ?? 0);
      const remaining = Math.round((totalExpected - alreadyReceived) * 100) / 100;

      // Validar que não excede o saldo restante (com tolerância)
      if (totalReceived > remaining + 0.01) {
        throw new AppError(
          ERROR_CODES.BUSINESS_RULE_VIOLATION,
          `Valor recebido (R$ ${totalReceived.toFixed(2)}) excede o saldo restante (R$ ${remaining.toFixed(2)})`,
          400
        );
      }

      // Acumular o recebido e determinar se quita o esperado
      const cumulativeReceived = Math.round((alreadyReceived + totalReceived) * 100) / 100;
      const isFullPayment = cumulativeReceived >= totalExpected - 0.01;
      const newStatus = isFullPayment
        ? AccountReceivableStatus.RECEIVED
        : AccountReceivableStatus.PENDING;

      // Atualizar conta a receber
      const updated = await tx.accountReceivable.update({
        where: { id: data.accountId },
        data: {
          status: newStatus,
          receivedAmount: cumulativeReceived,
          receivedDate,
          receivedByUserId: userId,
          fineAmount,
          interestAmount,
          discountAmount,
          // Guardar info dos métodos de pagamento nas notas. Usa as notes
          // travadas (lockedRow), não o `existing` lido fora da tx, para não
          // sobrescrever a nota de uma parcial concorrente.
          notes: lockedRow.notes
            ? `${lockedRow.notes}\n\nPagamento recebido: ${data.payments.map(p => `${p.method}: R$ ${p.amount.toFixed(2)}`).join(", ")}`
            : `Pagamento recebido: ${data.payments.map(p => `${p.method}: R$ ${p.amount.toFixed(2)}`).join(", ")}`,
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              cpf: true,
              phone: true,
              email: true,
            },
          },
          sale: {
            select: {
              id: true,
              total: true,
              createdAt: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          receivedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Se tem filial, criar movimentos no caixa para cada forma de pagamento
      if (updated.branchId) {
        // Buscar caixa aberto da filial
        const openCashShift = await tx.cashShift.findFirst({
          where: {
            branchId: updated.branchId,
            status: "OPEN",
          },
          orderBy: { openedAt: "desc" },
        });

        if (openCashShift) {
          // Mapear forma de pagamento para PaymentMethod do Prisma
          const paymentMethodMap: Record<string, string> = {
            CASH: "CASH",
            PIX: "PIX",
            DEBIT_CARD: "DEBIT_CARD",
            CREDIT_CARD: "CREDIT_CARD",
            BANK_TRANSFER: "OTHER",
            BANK_SLIP: "BOLETO",
          };

          // Criar um movimento no caixa para cada forma de pagamento
          for (const payment of data.payments) {
            const mappedMethod = paymentMethodMap[payment.method] || "OTHER";

            await tx.cashMovement.create({
              data: {
                cashShiftId: openCashShift.id,
                branchId: updated.branchId,
                type: "SALE_PAYMENT",
                direction: "IN",
                method: mappedMethod as any,
                amount: payment.amount,
                originType: "AccountReceivable",
                originId: data.accountId,
                note: `Recebimento ${isFullPayment ? "total" : "parcial"}: ${existing.description}${updated.customer ? ` - ${updated.customer.name}` : ""} (${payment.method})`,
                createdByUserId: userId,
              },
            });
          }
        }
      }

      return { updated, isFullPayment, cumulativeReceived };
    }, { timeout: 30_000 });

    const { updated: account, isFullPayment, cumulativeReceived } = result;

    // Serializar Decimals para number
    const serializedAccount = {
      ...account,
      amount: Number(account.amount),
      receivedAmount: account.receivedAmount ? Number(account.receivedAmount) : null,
      finePercent: Number(account.finePercent ?? 0),
      fineAmount: Number(account.fineAmount ?? 0),
      interestPercent: Number(account.interestPercent ?? 0),
      interestAmount: Number(account.interestAmount ?? 0),
      discountAmount: Number(account.discountAmount ?? 0),
      sale: account.sale
        ? {
            ...account.sale,
            total: Number(account.sale.total),
          }
        : null,
    };

    return NextResponse.json({
      success: true,
      data: serializedAccount,
      message: isFullPayment
        ? "Conta recebida totalmente com sucesso!"
        : `Recebimento parcial registrado. Restante: R$ ${(totalExpected - cumulativeReceived).toFixed(2)}`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
