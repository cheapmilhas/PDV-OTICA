import { PrismaClient, ReconciliationResolutionType } from "@prisma/client";
import { notFoundError } from "@/lib/error-handler";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

interface ResolveItemData {
  matchedSalePaymentId?: string;
  resolutionType: ReconciliationResolutionType;
  resolutionNotes?: string;
}

/**
 * Resolve um item de conciliação manualmente.
 *
 * `batchId` é obrigatório e o item DEVE pertencer a ele: a rota já validou que
 * o batch é da empresa do usuário, então amarrar item→batch fecha o IDOR
 * pai-vs-filho (antes um itemId de outra empresa era resolvido, pois o
 * companyId era derivado do próprio item). Espelha o padrão da rota PATCH irmã
 * (`where: { id: itemId, batchId }`).
 */
export async function resolveItem(
  tx: TransactionClient,
  batchId: string,
  itemId: string,
  data: ResolveItemData,
  userId: string
): Promise<void> {
  const item = await tx.reconciliationItem.findFirst({
    where: { id: itemId, batchId },
    include: { batch: { select: { companyId: true } } },
  });

  if (!item) {
    throw notFoundError("Item de conciliação não encontrado neste batch");
  }

  const companyId = item.batch.companyId;
  let internalAmount: number | null = null;
  let differenceAmount: number | null = null;

  if (data.matchedSalePaymentId) {
    const payment = await tx.salePayment.findFirstOrThrow({
      where: {
        id: data.matchedSalePaymentId,
        sale: { companyId },
      },
    });
    internalAmount = Number(payment.amount);
    differenceAmount = Number(item.externalAmount) - internalAmount;
  }

  await tx.reconciliationItem.update({
    where: { id: itemId },
    data: {
      status: "RESOLVED",
      matchedSalePaymentId: data.matchedSalePaymentId || item.matchedSalePaymentId,
      internalAmount,
      differenceAmount: differenceAmount !== null ? Math.round(differenceAmount * 100) / 100 : null,
      matchConfidence: 100,
      resolutionType: data.resolutionType,
      resolutionNotes: data.resolutionNotes,
      resolvedAt: new Date(),
      resolvedByUserId: userId,
    },
  });
}

/**
 * Fecha um batch de conciliação.
 * Verifica que todos os itens estão resolvidos ou ignorados.
 */
export async function closeBatch(
  tx: TransactionClient,
  batchId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const batch = await tx.reconciliationBatch.findUniqueOrThrow({
    where: { id: batchId },
  });

  // Verificar se há itens em status não-final
  const pendingCount = await tx.reconciliationItem.count({
    where: {
      batchId,
      status: { in: ["PENDING", "UNMATCHED", "SUGGESTED_MATCH", "DIVERGENT", "DISPUTED"] },
    },
  });

  if (pendingCount > 0) {
    return {
      success: false,
      message: `Ainda existem ${pendingCount} item(ns) não resolvido(s). Resolva ou ignore-os antes de fechar.`,
    };
  }

  // Contar divergentes
  const divergentCount = await tx.reconciliationItem.count({
    where: {
      batchId,
      status: { in: ["AUTO_MATCHED", "MANUAL_MATCHED", "RESOLVED"] },
      differenceAmount: { not: 0 },
    },
  });

  const ignoredCount = await tx.reconciliationItem.count({
    where: { batchId, status: "IGNORED" },
  });

  const matchedCount = await tx.reconciliationItem.count({
    where: {
      batchId,
      status: { in: ["AUTO_MATCHED", "MANUAL_MATCHED", "RESOLVED"] },
    },
  });

  await tx.reconciliationBatch.update({
    where: { id: batchId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      matchedCount,
      unmatchedCount: 0,
      divergentCount,
      ignoredCount,
    },
  });

  return {
    success: true,
    message: `Batch fechado: ${matchedCount} conciliados, ${divergentCount} divergentes, ${ignoredCount} ignorados.`,
  };
}
