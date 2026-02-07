import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse } from "@/lib/api-response";
import { z } from "zod";
import { AccountPayableStatus, AccountCategory } from "@prisma/client";

/**
 * Schema de validação para query params (GET)
 */
const accountsPayableQuerySchema = z.object({
  status: z.enum(["PENDING", "PAID", "OVERDUE", "CANCELED", "ALL"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  supplierId: z.string().optional(),
  category: z.nativeEnum(AccountCategory).optional(),
});

/**
 * Schema de validação para criação de conta a pagar (POST)
 */
const createAccountPayableSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  category: z.nativeEnum(AccountCategory),
  amount: z.number().positive("Valor deve ser positivo"),
  dueDate: z.string().datetime(),
  supplierId: z.string().optional(),
  branchId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Schema de validação para atualização de status (PATCH)
 */
const updateAccountPayableSchema = z.object({
  id: z.string().min(1, "ID é obrigatório"),
  status: z.nativeEnum(AccountPayableStatus),
  paidAmount: z.number().positive().optional(),
  paidDate: z.string().datetime().optional(),
});

/**
 * Schema de validação para cancelamento (DELETE)
 */
const deleteAccountPayableSchema = z.object({
  id: z.string().min(1, "ID é obrigatório"),
});

/**
 * GET /api/accounts-payable
 * Lista contas a pagar com paginação, busca e filtros
 *
 * Query params:
 * - status: "PENDING" | "PAID" | "OVERDUE" | "CANCELED" | "ALL" (default: "ALL")
 * - page: number (default: 1)
 * - pageSize: number (default: 20, max: 100)
 * - search: string (busca em descrição e número da nota)
 * - startDate: string (filtro por data de vencimento inicial)
 * - endDate: string (filtro por data de vencimento final)
 * - supplierId: string (filtro por fornecedor)
 * - category: AccountCategory (filtro por categoria)
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const query = accountsPayableQuerySchema.parse(
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

    // Filtro de busca (descrição ou número da nota)
    if (query.search) {
      where.OR = [
        { description: { contains: query.search, mode: "insensitive" } },
        { invoiceNumber: { contains: query.search, mode: "insensitive" } },
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

    // Filtro por fornecedor
    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }

    // Filtro por categoria
    if (query.category) {
      where.category = query.category;
    }

    // Calcular paginação
    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;

    // Buscar contas a pagar
    const [data, total] = await Promise.all([
      prisma.accountPayable.findMany({
        where,
        skip,
        take,
        orderBy: { dueDate: "asc" },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              tradeName: true,
              cnpj: true,
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
          paidBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.accountPayable.count({ where }),
    ]);

    // Serializar Decimals para number
    const serializedData = data.map((account) => ({
      ...account,
      amount: Number(account.amount),
      paidAmount: account.paidAmount ? Number(account.paidAmount) : null,
    }));

    return paginatedResponse(serializedData, {
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/accounts-payable
 * Cria nova conta a pagar
 *
 * Body:
 * {
 *   description: string,
 *   category: AccountCategory,
 *   amount: number,
 *   dueDate: string (ISO),
 *   supplierId?: string,
 *   branchId?: string,
 *   invoiceNumber?: string,
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
    const data = createAccountPayableSchema.parse(body);

    // Criar conta a pagar
    const accountPayable = await prisma.accountPayable.create({
      data: {
        companyId,
        description: data.description,
        category: data.category,
        amount: data.amount,
        dueDate: new Date(data.dueDate),
        supplierId: data.supplierId,
        branchId: data.branchId,
        invoiceNumber: data.invoiceNumber,
        notes: data.notes,
        status: AccountPayableStatus.PENDING,
        createdByUserId: userId,
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            tradeName: true,
            cnpj: true,
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
      ...accountPayable,
      amount: Number(accountPayable.amount),
      paidAmount: accountPayable.paidAmount
        ? Number(accountPayable.paidAmount)
        : null,
    };

    return createdResponse(serializedAccount);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/accounts-payable
 * Atualiza status de conta a pagar (marcar como paga)
 *
 * Body:
 * {
 *   id: string,
 *   status: AccountPayableStatus,
 *   paidAmount?: number,
 *   paidDate?: string (ISO)
 * }
 */
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const companyId = await getCompanyId();
    const userId = session.user.id;

    const body = await request.json();
    const data = updateAccountPayableSchema.parse(body);

    // Verificar se a conta existe e pertence à empresa
    const existing = await prisma.accountPayable.findFirst({
      where: {
        id: data.id,
        companyId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Conta a pagar não encontrada" },
        { status: 404 }
      );
    }

    // Preparar dados de atualização
    const updateData: any = {
      status: data.status,
    };

    // Se estiver marcando como PAGA, adicionar campos de pagamento
    if (data.status === AccountPayableStatus.PAID) {
      updateData.paidAmount = data.paidAmount || existing.amount;
      updateData.paidDate = data.paidDate
        ? new Date(data.paidDate)
        : new Date();
      updateData.paidByUserId = userId;
    }

    // Atualizar conta a pagar
    const accountPayable = await prisma.accountPayable.update({
      where: { id: data.id },
      data: updateData,
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            tradeName: true,
            cnpj: true,
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
        paidBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Serializar Decimals para number
    const serializedAccount = {
      ...accountPayable,
      amount: Number(accountPayable.amount),
      paidAmount: accountPayable.paidAmount
        ? Number(accountPayable.paidAmount)
        : null,
    };

    return NextResponse.json(serializedAccount);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/accounts-payable
 * Cancela conta a pagar (muda status para CANCELED)
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

    const body = await request.json();
    const data = deleteAccountPayableSchema.parse(body);

    // Verificar se a conta existe e pertence à empresa
    const existing = await prisma.accountPayable.findFirst({
      where: {
        id: data.id,
        companyId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Conta a pagar não encontrada" },
        { status: 404 }
      );
    }

    // Atualizar status para CANCELED
    await prisma.accountPayable.update({
      where: { id: data.id },
      data: {
        status: AccountPayableStatus.CANCELED,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
