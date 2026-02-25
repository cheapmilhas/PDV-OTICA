import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError, notFoundError } from "@/lib/error-handler";
import { successResponse, deletedResponse } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const batch = await prisma.reconciliationBatch.findFirst({
      where: { id, companyId },
      include: {
        financeAccount: { select: { name: true, type: true } },
        _count: {
          select: { items: true },
        },
      },
    });

    if (!batch) throw notFoundError("Batch não encontrado");

    // Contar por status
    const statusCounts = await prisma.reconciliationItem.groupBy({
      by: ["status"],
      where: { batchId: id },
      _count: true,
    });

    return successResponse({
      ...JSON.parse(JSON.stringify(batch)),
      statusBreakdown: statusCounts.reduce((acc, s) => {
        acc[s.status] = s._count;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const batch = await prisma.reconciliationBatch.findFirst({
      where: { id, companyId },
    });

    if (!batch) throw notFoundError("Batch não encontrado");

    await prisma.reconciliationBatch.update({
      where: { id },
      data: { status: "CANCELED" },
    });

    return deletedResponse();
  } catch (error) {
    return handleApiError(error);
  }
}
