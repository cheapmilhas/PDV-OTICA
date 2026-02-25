import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError, notFoundError, businessRuleError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { autoMatchBatch } from "@/services/reconciliation-match.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id: batchId } = await params;

    const batch = await prisma.reconciliationBatch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) throw notFoundError("Batch não encontrado");
    if (batch.status === "DRAFT") {
      throw businessRuleError("Importe o CSV antes de executar o auto-match");
    }

    const result = await prisma.$transaction(async (tx) => {
      return autoMatchBatch(tx as any, batchId, companyId);
    });

    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
