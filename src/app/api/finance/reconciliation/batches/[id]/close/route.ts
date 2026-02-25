import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId, getUserId } from "@/lib/auth-helpers";
import { handleApiError, notFoundError, businessRuleError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { closeBatch } from "@/services/reconciliation-resolution.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const userId = await getUserId();
    const { id: batchId } = await params;

    const batch = await prisma.reconciliationBatch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) throw notFoundError("Batch não encontrado");

    const result = await prisma.$transaction(async (tx) => {
      return closeBatch(tx as any, batchId, userId);
    });

    if (!result.success) {
      throw businessRuleError(result.message);
    }

    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
