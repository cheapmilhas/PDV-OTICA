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
    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;

    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const { skip, take } = getPaginationParams(page, pageSize);

    const where: any = {
      companyId,
      financeAccountId: id,
    };

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
}
