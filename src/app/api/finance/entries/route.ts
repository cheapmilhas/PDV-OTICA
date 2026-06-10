import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse, createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import { generateManualExpenseEntry } from "@/services/finance-entry.service";
import { withPlanFeatureGuard } from "@/lib/with-plan-feature";
import { validateBranchOwnership } from "@/lib/validate-branch";

export const GET = withPlanFeatureGuard(async (req: Request) => {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const searchParams = (req as NextRequest).nextUrl.searchParams;

    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");
    const type = searchParams.get("type");
    const side = searchParams.get("side");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const accountId = searchParams.get("accountId");
    const branchId = searchParams.get("branchId");

    const { skip, take } = getPaginationParams(page, pageSize);

    // SEC-004: se filtrar por filial, garante que ela pertence à empresa
    // (403 explícito em vez de resultado vazio silencioso).
    if (branchId && branchId !== "ALL") {
      await validateBranchOwnership(branchId, companyId);
    }

    const where: any = { companyId };

    if (type) where.type = type;
    if (side) where.side = side;
    if (branchId) where.branchId = branchId;
    if (accountId) {
      where.OR = [
        { debitAccountId: accountId },
        { creditAccountId: accountId },
      ];
    }
    if (startDate || endDate) {
      where.entryDate = {};
      if (startDate) where.entryDate.gte = new Date(startDate);
      if (endDate) where.entryDate.lte = new Date(endDate);
    }

    const [entries, total] = await Promise.all([
      prisma.financeEntry.findMany({
        where,
        include: {
          debitAccount: { select: { code: true, name: true } },
          creditAccount: { select: { code: true, name: true } },
          financeAccount: { select: { name: true, type: true } },
        },
        orderBy: { entryDate: "desc" },
        skip,
        take,
      }),
      prisma.financeEntry.count({ where }),
    ]);

    const pagination = createPaginationMeta(page, pageSize, total);

    return paginatedResponse(
      entries.map((e) => ({ ...e, amount: Number(e.amount) })),
      pagination
    );
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withPlanFeatureGuard(async (req: Request) => {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const body = await req.json();

    const {
      description,
      amount,
      debitAccountCode,
      creditAccountCode,
      financeAccountType,
      branchId,
      entryDate,
    } = body;

    if (!description || !amount || !debitAccountCode || !creditAccountCode) {
      return handleApiError(
        new Error("description, amount, debitAccountCode e creditAccountCode são obrigatórios")
      );
    }

    // SEC-004: lançamento manual grava branchId vindo do body — valida posse
    // antes de escrever (evita lançar em filial de outra empresa).
    if (branchId) {
      await validateBranchOwnership(branchId, companyId);
    }

    const entryId = await prisma.$transaction(async (tx) => {
      return generateManualExpenseEntry(
        tx as any,
        {
          description,
          amount: Number(amount),
          debitAccountCode,
          creditAccountCode,
          financeAccountType,
          branchId,
          entryDate: entryDate ? new Date(entryDate) : undefined,
        },
        companyId
      );
    });

    const entry = await prisma.financeEntry.findUnique({
      where: { id: entryId },
      include: {
        debitAccount: { select: { code: true, name: true } },
        creditAccount: { select: { code: true, name: true } },
      },
    });

    return createdResponse(entry ? { ...entry, amount: Number(entry.amount) } : { id: entryId });
  } catch (error) {
    return handleApiError(error);
  }
});
