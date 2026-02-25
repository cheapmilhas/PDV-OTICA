import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse, createdResponse, paginatedResponse, createPaginationMeta, getPaginationParams } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const searchParams = req.nextUrl.searchParams;

    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const status = searchParams.get("status");
    const source = searchParams.get("source");

    const { skip, take } = getPaginationParams(page, pageSize);

    const where: any = {
      companyId,
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
    };

    const [batches, total] = await Promise.all([
      prisma.reconciliationBatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.reconciliationBatch.count({ where }),
    ]);

    const pagination = createPaginationMeta(page, pageSize, total);
    return paginatedResponse(JSON.parse(JSON.stringify(batches)), pagination);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const body = await req.json();

    const { source, acquirerName, branchId, financeAccountId, description, periodStart, periodEnd } = body;

    if (!source) {
      return handleApiError(new Error("source é obrigatório"));
    }

    const batch = await prisma.reconciliationBatch.create({
      data: {
        companyId,
        branchId: branchId || undefined,
        financeAccountId: financeAccountId || undefined,
        source,
        acquirerName: acquirerName || undefined,
        description: description || undefined,
        periodStart: periodStart ? new Date(periodStart) : undefined,
        periodEnd: periodEnd ? new Date(periodEnd) : undefined,
      },
    });

    return createdResponse(JSON.parse(JSON.stringify(batch)));
  } catch (error) {
    return handleApiError(error);
  }
}
