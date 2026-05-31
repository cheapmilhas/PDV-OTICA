import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { paginatedResponse, createdResponse } from "@/lib/api-response";
import { z } from "zod";
import { AccountReceivableStatus } from "@prisma/client";
import { validateBranchOwnership } from "@/lib/validate-branch";
import { calculatePenalties } from "@/lib/penalty-utils";
import { reverseAccountReceivableCash } from "@/services/cash.service";

/**
 * Schema de validação para query params (GET)
 */
const accountsReceivableQuerySchema = z.object({
  status: z
    .enum(["PENDING", "RECEIVED", "OVERDUE", "CANCELED", "RENEGOTIATED", "ALL"])
    .optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  customerId: z.string().optional(),
  saleId: z.string().optional(),
});

/**
 * Schema de validação para criação de conta a receber (POST)
 */
const createAccountReceivableSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z.number().positive("Valor deve ser positivo"),
  dueDate: z.string().datetime(),
  customerId: z.string().optional(),
  saleId: z.string().optional(),
  branchId: z.string().optional(),
  installmentNumber: z.number().int().min(1).optional().default(1),
  totalInstallments: z.number().int().min(1).optional().default(1),
  notes: z.string().optional(),
});

/**
 * Schema de validação para atualização de status (PATCH)
 */
const updateAccountReceivableSchema = z.object({
  id: z.string().min(1, "ID é obrigatório"),
  status: z.nativeEnum(AccountReceivableStatus),
  receivedAmount: z.number().positive().optional(),
  receivedDate: z.string().datetime().optional(),
  paymentMethod: z.enum(["CASH", "PIX", "DEBIT_CARD", "CREDIT_CARD", "BANK_TRANSFER", "BANK_SLIP"]).optional(),
  discountAmount: z.number().min(0).optional(),
  fineAmount: z.number().min(0).optional(),
  interestAmount: z.number().min(0).optional(),
});

/**
 * Schema de validação para estorno (reversal)
 */
const reversalSchema = z.object({
  id: z.string().min(1, "ID é obrigatório"),
  action: z.literal("reverse"),
});

/**
 * Schema de validação para cancelamento (DELETE)
 */
const deleteAccountReceivableSchema = z.object({
  id: z.string().min(1, "ID é obrigatório"),
});

/**
 * GET /api/accounts-receivable
 * Lista contas a receber com paginação, busca e filtros
 *
 * Query params:
 * - status: "PENDING" | "RECEIVED" | "OVERDUE" | "CANCELED" | "ALL" (default: "ALL")
 * - page: number (default: 1)
 * - pageSize: number (default: 20, max: 100)
 * - search: string (busca em descrição e nome do cliente)
 * - startDate: string (filtro por data de vencimento inicial)
 * - endDate: string (filtro por data de vencimento final)
 * - customerId: string (filtro por cliente)
 * - saleId: string (filtro por venda)
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const query = accountsReceivableQuerySchema.parse(
      Object.fromEntries(searchParams)
    );

    // Branch filter
    const qBranchId = searchParams.get("branchId");
    const branchFilter = qBranchId && qBranchId !== "ALL" ? { branchId: qBranchId } : {};

    // Construir filtros
    const where: any = {
      companyId,
      ...branchFilter,
    };

    // Filtro de status
    if (query.status && query.status !== "ALL") {
      where.status = query.status;
    }

    // Filtro de busca (descrição ou cliente)
    if (query.search) {
      where.OR = [
        { description: { contains: query.search, mode: "insensitive" } },
        {
          customer: {
            name: { contains: query.search, mode: "insensitive" },
          },
        },
      ];
    }

    // Filtro de data de vencimento
    if (query.startDate || query.endDate) {
      where.dueDate = {};
      if (query.startDate) {
        where.dueDate.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.dueDate.lte = new Date(query.endDate);
      }
    }

    // Filtro por cliente
    if (query.customerId) {
      where.customerId = query.customerId;
    }

    // Filtro por venda
    if (query.saleId) {
      where.saleId = query.saleId;
    }

    // Calcular paginação
    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;

    // Buscar contas a receber
    const [data, total] = await Promise.all([
      prisma.accountReceivable.findMany({
        where,
        skip,
        take,
        orderBy: { dueDate: "asc" },
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
      }),
      prisma.accountReceivable.count({ where }),
    ]);

    // Serializar Decimals para number e calcular penalidades em tempo real
    const now = new Date();
    const serializedData = data.map((account) => {
      const penalties = (account.status === "PENDING" || account.status === "OVERDUE")
        ? calculatePenalties(account, now)
        : { fine: 0, interest: 0, daysLate: 0, totalWithPenalties: Number(account.amount) };

      return {
        ...account,
        amount: Number(account.amount),
        receivedAmount: account.receivedAmount
          ? Number(account.receivedAmount)
          : null,
        finePercent: Number(account.finePercent ?? 0),
        fineAmount: Number(account.fineAmount ?? 0),
        interestPercent: Number(account.interestPercent ?? 0),
        interestAmount: Number(account.interestAmount ?? 0),
        discountAmount: Number(account.discountAmount ?? 0),
        graceDays: account.graceDays ?? 0,
        // Penalidades calculadas em tempo real
        calculatedFine: penalties.fine,
        calculatedInterest: penalties.interest,
        calculatedTotal: penalties.totalWithPenalties,
        daysLate: penalties.daysLate,
        sale: account.sale
          ? {
              ...account.sale,
              total: Number(account.sale.total),
            }
          : null,
      };
    });

    const totalPages = Math.ceil(total / query.pageSize);
    return paginatedResponse(serializedData, {
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevious: query.page > 1,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/accounts-receivable
 * Cria nova conta a receber
 *
 * Body:
 * {
 *   description: string,
 *   amount: number,
 *   dueDate: string (ISO),
 *   customerId?: string,
 *   saleId?: string,
 *   branchId?: string,
 *   installmentNumber?: number,
 *   totalInstallments?: number,
 *   notes?: string
 * }
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const companyId = await getCompanyId();
    const userId = session.user.id;

    const body = await request.json();
    const data = createAccountReceivableSchema.parse(body);

    // Validação de segurança: branchId deve pertencer à empresa do usuário
    if (data.branchId) {
      await validateBranchOwnership(data.branchId, companyId);
    }

    // Criar conta a receber
    const accountReceivable = await prisma.accountReceivable.create({
      data: {
        companyId,
        description: data.description,
        amount: data.amount,
        dueDate: new Date(data.dueDate),
        customerId: data.customerId,
        saleId: data.saleId,
        branchId: data.branchId,
        installmentNumber: data.installmentNumber,
        totalInstallments: data.totalInstallments,
        notes: data.notes,
        status: AccountReceivableStatus.PENDING,
        createdByUserId: userId,
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
      },
    });

    // Serializar Decimals para number
    const serializedAccount = {
      ...accountReceivable,
      amount: Number(accountReceivable.amount),
      receivedAmount: accountReceivable.receivedAmount
        ? Number(accountReceivable.receivedAmount)
        : null,
      sale: accountReceivable.sale
        ? {
            ...accountReceivable.sale,
            total: Number(accountReceivable.sale.total),
          }
        : null,
    };

    return createdResponse(serializedAccount);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/accounts-receivable
 * Atualiza status de conta a receber (marcar como recebida)
 *
 * Body:
 * {
 *   id: string,
 *   status: AccountReceivableStatus,
 *   receivedAmount?: number,
 *   receivedDate?: string (ISO)
 * }
 */
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const companyId = await getCompanyId();
    await requirePermission("accounts_receivable.manage");
    const userId = session.user.id;

    const body = await request.json();

    // Verificar se é uma ação de estorno
    if (body.action === "reverse") {
      const reversal = reversalSchema.parse(body);

      const existing = await prisma.accountReceivable.findFirst({
        where: { id: reversal.id, companyId },
      });

      if (!existing) {
        return NextResponse.json(
          { error: "Conta a receber não encontrada" },
          { status: 404 }
        );
      }

      if (existing.status !== AccountReceivableStatus.RECEIVED) {
        return NextResponse.json(
          { error: { message: "Apenas contas recebidas podem ser estornadas" } },
          { status: 400 }
        );
      }

      // C2: bloqueia duplo estorno (mesmo guard do POST /reverse-payment).
      // Sem isto, ciclos receber→estornar→receber→estornar podiam estornar
      // o caixa de novo. O helper já é idempotente, mas o guard corta cedo.
      if (existing.reversedAt) {
        return NextResponse.json(
          { error: { message: "Pagamento já foi estornado anteriormente" } },
          { status: 409 }
        );
      }

      // Q7.1 P0-5: estorno atômico — AR.status + CashMovement reverso na
      // mesma transação. Antes só mudava status; o R$ continuava no shift
      // gerando ghost cash no fechamento de caixa.
      const reversed = await prisma.$transaction(async (tx) => {
        // Trava a linha e relê reversedAt dentro da tx — fecha a janela de
        // duplo estorno concorrente (idem POST /reverse-payment).
        const locked = await tx.$queryRaw<{ reversedAt: Date | null }[]>`
          SELECT "reversedAt" FROM "AccountReceivable"
          WHERE id = ${reversal.id} AND "companyId" = ${companyId}
          FOR UPDATE
        `;
        if (locked[0]?.reversedAt) {
          throw new AppError(ERROR_CODES.DUPLICATE, "Pagamento já foi estornado anteriormente", 409);
        }

        // Estorno idempotente do caixa (IN - OUT líquido por shift OPEN).
        // Cobre AR com múltiplos IN (recebimento parcial); o findFirst antigo
        // só revertia o último movimento.
        await reverseAccountReceivableCash(tx, {
          accountReceivableId: reversal.id,
          description: existing.description,
          userId,
        });

        // Reverter status do AR.
        return tx.accountReceivable.update({
          where: { id: reversal.id },
          data: {
            status: AccountReceivableStatus.PENDING,
            receivedDate: null,
            receivedAmount: null,
            receivedByUserId: null,
            fineAmount: 0,
            interestAmount: 0,
            discountAmount: 0,
            reversedAt: new Date(),
            reversedBy: userId,
          },
          include: {
            customer: { select: { id: true, name: true, cpf: true, phone: true, email: true } },
            sale: { select: { id: true, total: true, createdAt: true } },
            branch: { select: { id: true, name: true, code: true } },
            createdBy: { select: { id: true, name: true } },
            receivedBy: { select: { id: true, name: true } },
          },
        });
      }, { timeout: 30_000 });

      return NextResponse.json({
        ...reversed,
        amount: Number(reversed.amount),
        receivedAmount: null,
        finePercent: Number(reversed.finePercent ?? 0),
        fineAmount: 0,
        interestPercent: Number(reversed.interestPercent ?? 0),
        interestAmount: 0,
        discountAmount: 0,
        sale: reversed.sale ? { ...reversed.sale, total: Number(reversed.sale.total) } : null,
      });
    }

    const data = updateAccountReceivableSchema.parse(body);

    // Verificar se a conta existe e pertence à empresa
    const existing = await prisma.accountReceivable.findFirst({
      where: {
        id: data.id,
        companyId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Conta a receber não encontrada" },
        { status: 404 }
      );
    }

    // C1: guard de idempotência — duplo clique em "marcar recebida" criava
    // um segundo CashMovement IN (ghost cash). Bloqueia qualquer tentativa de
    // re-processar pagamento numa conta já RECEIVED (o paymentMethod abaixo é
    // o que dispara o CashMovement IN, na linha ~565).
    if (
      existing.status === AccountReceivableStatus.RECEIVED &&
      (data.status === AccountReceivableStatus.RECEIVED || data.paymentMethod)
    ) {
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

    // Preparar dados de atualização
    const updateData: any = {
      status: data.status,
    };

    // Se estiver marcando como RECEBIDA, adicionar campos de recebimento
    if (data.status === AccountReceivableStatus.RECEIVED) {
      updateData.receivedAmount = data.receivedAmount || existing.amount;
      updateData.receivedDate = data.receivedDate
        ? new Date(data.receivedDate)
        : new Date();
      updateData.receivedByUserId = userId;
      // Persistir penalidades e desconto
      if (data.fineAmount !== undefined) updateData.fineAmount = data.fineAmount;
      if (data.interestAmount !== undefined) updateData.interestAmount = data.interestAmount;
      if (data.discountAmount !== undefined) updateData.discountAmount = data.discountAmount;
    }

    // Usar transação para atualizar conta e criar movimento no caixa
    const accountReceivable = await prisma.$transaction(async (tx) => {
      // Atualizar conta a receber
      const updated = await tx.accountReceivable.update({
        where: { id: data.id },
        data: updateData,
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

      // Se foi marcado como RECEBIDA e tem forma de pagamento, criar movimento no caixa
      if (data.status === AccountReceivableStatus.RECEIVED && data.paymentMethod && updated.branchId) {
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

          const mappedMethod = paymentMethodMap[data.paymentMethod] || "OTHER";

          // Criar movimento de entrada no caixa
          await tx.cashMovement.create({
            data: {
              cashShiftId: openCashShift.id,
              branchId: updated.branchId,
              type: "SALE_PAYMENT", // Recebimento de conta a receber
              direction: "IN",
              method: mappedMethod as any,
              amount: updateData.receivedAmount || Number(existing.amount),
              originType: "AccountReceivable",
              originId: data.id,
              note: `Recebimento: ${existing.description}${updated.customer ? ` - ${updated.customer.name}` : ""}`,
              createdByUserId: userId,
            },
          });
        }
      }

      return updated;
    }, { timeout: 30_000 });

    // Serializar Decimals para number
    const serializedAccount = {
      ...accountReceivable,
      amount: Number(accountReceivable.amount),
      receivedAmount: accountReceivable.receivedAmount
        ? Number(accountReceivable.receivedAmount)
        : null,
      finePercent: Number(accountReceivable.finePercent ?? 0),
      fineAmount: Number(accountReceivable.fineAmount ?? 0),
      interestPercent: Number(accountReceivable.interestPercent ?? 0),
      interestAmount: Number(accountReceivable.interestAmount ?? 0),
      discountAmount: Number(accountReceivable.discountAmount ?? 0),
      sale: accountReceivable.sale
        ? {
            ...accountReceivable.sale,
            total: Number(accountReceivable.sale.total),
          }
        : null,
    };

    return NextResponse.json(serializedAccount);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/accounts-receivable
 * Cancela conta a receber (muda status para CANCELED)
 *
 * Body:
 * {
 *   id: string
 * }
 */
export async function DELETE(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("accounts_receivable.manage");

    const body = await request.json();
    const data = deleteAccountReceivableSchema.parse(body);

    // Verificar se a conta existe e pertence à empresa
    const existing = await prisma.accountReceivable.findFirst({
      where: {
        id: data.id,
        companyId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Conta a receber não encontrada" },
        { status: 404 }
      );
    }

    // Atualizar status para CANCELED
    await prisma.accountReceivable.update({
      where: { id: data.id },
      data: {
        status: AccountReceivableStatus.CANCELED,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
