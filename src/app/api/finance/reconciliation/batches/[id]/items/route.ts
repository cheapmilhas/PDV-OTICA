import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createPaginationMeta, getPaginationParams } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id: batchId } = await params;
    const searchParams = req.nextUrl.searchParams;

    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");
    const status = searchParams.get("status");

    const { skip, take } = getPaginationParams(page, pageSize);

    // Verificar acesso ao batch
    const batch = await prisma.reconciliationBatch.findFirst({
      where: { id: batchId, companyId },
      select: { id: true },
    });
    if (!batch) {
      return handleApiError(new Error("Batch não encontrado"));
    }

    const where: any = {
      batchId,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.reconciliationItem.findMany({
        where,
        include: {
          matchedSalePayment: {
            select: {
              id: true,
              method: true,
              amount: true,
              cardBrand: true,
              nsu: true,
              authorizationCode: true,
              receivedAt: true,
              sale: { select: { id: true } },
            },
          },
        },
        orderBy: { externalDate: "desc" },
        skip,
        take,
      }),
      prisma.reconciliationItem.count({ where }),
    ]);

    const pagination = createPaginationMeta(page, pageSize, total);
    return paginatedResponse(JSON.parse(JSON.stringify(items)), pagination);
  } catch (error) {
    return handleApiError(error);
  }
}
