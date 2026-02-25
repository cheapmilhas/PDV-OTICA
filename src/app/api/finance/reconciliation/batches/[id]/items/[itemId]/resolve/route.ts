import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId, getUserId } from "@/lib/auth-helpers";
import { handleApiError, notFoundError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { resolveItem } from "@/services/reconciliation-resolution.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const userId = await getUserId();
    const { id: batchId, itemId } = await params;
    const body = await req.json();

    // Verificar acesso
    const batch = await prisma.reconciliationBatch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) throw notFoundError("Batch não encontrado");

    const { matchedSalePaymentId, resolutionType, resolutionNotes } = body;

    if (!resolutionType) {
      return handleApiError(new Error("resolutionType é obrigatório"));
    }

    await prisma.$transaction(async (tx) => {
      await resolveItem(
        tx as any,
        itemId,
        {
          matchedSalePaymentId,
          resolutionType,
          resolutionNotes,
        },
        userId
      );
    });

    const updated = await prisma.reconciliationItem.findUnique({
      where: { id: itemId },
    });

    return successResponse(JSON.parse(JSON.stringify(updated)));
  } catch (error) {
    return handleApiError(error);
  }
}
