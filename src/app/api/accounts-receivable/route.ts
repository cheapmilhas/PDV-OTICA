import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse } from "@/lib/api-response";
import { z } from "zod";
import { AccountReceivableStatus } from "@prisma/client";

/**
 * Schema de validação para query params (GET)
 */
const accountsReceivableQuerySchema = z.object({
  status: z
    .enum(["PENDING", "RECEIVED", "OVERDUE", "CANCELED", "ALL"])
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

    // Construir filtros
    const where: any = {
      companyId,
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

    // Serializar Decimals para number
    const serializedData = data.map((account) => ({
      ...account,
      amount: Number(account.amount),
      receivedAmount: account.receivedAmount
        ? Number(account.receivedAmount)
        : null,
      sale: account.sale
        ? {
            ...account.sale,
            total: Number(account.sale.total),
          }
        : null,
    }));

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
      // paymentMethod não é salvo no AccountReceivable, apenas usado para criar CashMovement
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
