import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError, notFoundError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id: batchId, itemId } = await params;
    const body = await req.json();

    // Verificar acesso
    const batch = await prisma.reconciliationBatch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) throw notFoundError("Batch não encontrado");

    const item = await prisma.reconciliationItem.findFirst({
      where: { id: itemId, batchId },
    });
    if (!item) throw notFoundError("Item não encontrado");

    const { matchedSalePaymentId, status } = body;

    const updateData: any = {};

    if (matchedSalePaymentId) {
      const payment = await prisma.salePayment.findUnique({
        where: { id: matchedSalePaymentId },
      });
      if (payment) {
        updateData.matchedSalePaymentId = matchedSalePaymentId;
        updateData.internalAmount = Number(payment.amount);
        updateData.differenceAmount = Number(item.externalAmount) - Number(payment.amount);
        updateData.matchConfidence = 100;
        updateData.status = "MANUAL_MATCHED";
      }
    }

    if (status === "IGNORED") {
      updateData.status = "IGNORED";
      updateData.resolvedAt = new Date();
    }

    const updated = await prisma.reconciliationItem.update({
      where: { id: itemId },
      data: updateData,
    });

    return successResponse(JSON.parse(JSON.stringify(updated)));
  } catch (error) {
    return handleApiError(error);
  }
}
