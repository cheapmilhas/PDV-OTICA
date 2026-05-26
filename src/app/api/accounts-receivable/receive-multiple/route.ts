import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
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
        { status: 400 }
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

    // Calcular total recebido
    const totalReceived = data.payments.reduce((sum, p) => sum + p.amount, 0);

    // Validar que não excede o total esperado (com tolerância)
    if (totalReceived > totalExpected + 0.01) {
      return NextResponse.json(
        { error: { message: `Valor recebido (R$ ${totalReceived.toFixed(2)}) excede o total esperado (R$ ${totalExpected.toFixed(2)})` } },
        { status: 400 }
      );
    }

    // Determinar se é pagamento total (comparar com o total esperado)
    const isFullPayment = Math.abs(totalReceived - totalExpected) < 0.01;
    const newStatus = isFullPayment
      ? AccountReceivableStatus.RECEIVED
      : AccountReceivableStatus.PENDING;

    const receivedDate = data.receivedDate ? new Date(data.receivedDate) : new Date();

    // Usar transação para atualizar conta e criar movimentos no caixa
    const result = await prisma.$transaction(async (tx) => {
      // Atualizar conta a receber
      const updated = await tx.accountReceivable.update({
        where: { id: data.accountId },
        data: {
          status: newStatus,
          receivedAmount: totalReceived,
          receivedDate,
          receivedByUserId: userId,
          fineAmount,
          interestAmount,
          discountAmount,
          // Guardar informação sobre múltiplos métodos de pagamento nas notas
          notes: existing.notes
            ? `${existing.notes}\n\nPagamento recebido: ${data.payments.map(p => `${p.method}: R$ ${p.amount.toFixed(2)}`).join(", ")}`
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

      return updated;
    }, { timeout: 30_000 });

    // Serializar Decimals para number
    const serializedAccount = {
      ...result,
      amount: Number(result.amount),
      receivedAmount: result.receivedAmount ? Number(result.receivedAmount) : null,
      finePercent: Number(result.finePercent ?? 0),
      fineAmount: Number(result.fineAmount ?? 0),
      interestPercent: Number(result.interestPercent ?? 0),
      interestAmount: Number(result.interestAmount ?? 0),
      discountAmount: Number(result.discountAmount ?? 0),
      sale: result.sale
        ? {
            ...result.sale,
            total: Number(result.sale.total),
          }
        : null,
    };

    return NextResponse.json({
      success: true,
      data: serializedAccount,
      message: isFullPayment
        ? "Conta recebida totalmente com sucesso!"
        : `Recebimento parcial registrado. Restante: R$ ${(totalExpected - totalReceived).toFixed(2)}`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
