import { PrismaClient, ReconciliationItemStatus } from "@prisma/client";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

interface MatchResult {
  matched: number;
  unmatched: number;
  suggested: number;
}

/**
 * Motor de auto-match para conciliação de cartão.
 * 4 estratégias em cascata com confiança decrescente.
 */
export async function autoMatchBatch(
  tx: TransactionClient,
  batchId: string,
  companyId: string
): Promise<MatchResult> {
  // Buscar itens pendentes do batch
  const items = await tx.reconciliationItem.findMany({
    where: { batchId, status: "PENDING" },
  });

  // Buscar todos SalePayments de cartão do período (com margem)
  const batch = await tx.reconciliationBatch.findUniqueOrThrow({
    where: { id: batchId },
  });

  const periodStart = batch.periodStart
    ? new Date(batch.periodStart.getTime() - 7 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const periodEnd = batch.periodEnd
    ? new Date(batch.periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000)
    : new Date();

  const payments = await tx.salePayment.findMany({
    where: {
      sale: { companyId },
      method: { in: ["CREDIT_CARD", "DEBIT_CARD"] },
      status: "RECEIVED",
      receivedAt: { gte: periodStart, lte: periodEnd },
    },
    include: {
      sale: { select: { companyId: true, branchId: true, completedAt: true } },
    },
  });

  const usedPaymentIds = new Set<string>();
  let matched = 0;
  let suggested = 0;
  let unmatched = 0;

  for (const item of items) {
    let bestMatch: {
      paymentId: string;
      confidence: number;
      internalAmount: number;
    } | null = null;

    for (const payment of payments) {
      if (usedPaymentIds.has(payment.id)) continue;

      const paymentAmount = Number(payment.amount);
      const externalAmount = Number(item.externalAmount);
      const amountDiff = Math.abs(paymentAmount - externalAmount);
      const amountTolerance = paymentAmount * 0.01; // 1%

      // Estratégia 1: NSU exato (95%)
      if (
        item.externalId &&
        payment.nsu &&
        item.externalId === payment.nsu
      ) {
        bestMatch = {
          paymentId: payment.id,
          confidence: 95,
          internalAmount: paymentAmount,
        };
        break; // Match exato, não precisa continuar
      }

      // Estratégia 2: Auth code + valor ~1% (85%)
      if (
        item.externalRef &&
        payment.authorizationCode &&
        item.externalRef === payment.authorizationCode &&
        amountDiff <= amountTolerance
      ) {
        if (!bestMatch || bestMatch.confidence < 85) {
          bestMatch = {
            paymentId: payment.id,
            confidence: 85,
            internalAmount: paymentAmount,
          };
        }
        continue;
      }

      // Estratégia 3: Valor + data ±2 dias + bandeira (70%)
      if (
        amountDiff <= amountTolerance &&
        item.cardBrand &&
        payment.cardBrand &&
        item.cardBrand.toUpperCase() === payment.cardBrand.toUpperCase()
      ) {
        const paymentDate = payment.receivedAt || payment.createdAt;
        const daysDiff = Math.abs(
          (item.externalDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff <= 2) {
          if (!bestMatch || bestMatch.confidence < 70) {
            bestMatch = {
              paymentId: payment.id,
              confidence: 70,
              internalAmount: paymentAmount,
            };
          }
          continue;
        }
      }

      // Estratégia 4: Valor + data ±3 dias (50%)
      if (amountDiff <= amountTolerance) {
        const paymentDate = payment.receivedAt || payment.createdAt;
        const daysDiff = Math.abs(
          (item.externalDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff <= 3) {
          if (!bestMatch || bestMatch.confidence < 50) {
            bestMatch = {
              paymentId: payment.id,
              confidence: 50,
              internalAmount: paymentAmount,
            };
          }
        }
      }
    }

    if (bestMatch) {
      usedPaymentIds.add(bestMatch.paymentId);

      const externalAmount = Number(item.externalAmount);
      const differenceAmount = externalAmount - bestMatch.internalAmount;

      let status: ReconciliationItemStatus;
      if (bestMatch.confidence >= 70) {
        status = "AUTO_MATCHED";
        matched++;
      } else {
        status = "SUGGESTED_MATCH";
        suggested++;
      }

      await tx.reconciliationItem.update({
        where: { id: item.id },
        data: {
          status,
          matchedSalePaymentId: bestMatch.paymentId,
          internalAmount: bestMatch.internalAmount,
          differenceAmount: Math.round(differenceAmount * 100) / 100,
          matchConfidence: bestMatch.confidence,
          resolutionType: bestMatch.confidence >= 70 ? "EXACT_MATCH" : null,
          resolvedAt: bestMatch.confidence >= 70 ? new Date() : null,
        },
      });
    } else {
      await tx.reconciliationItem.update({
        where: { id: item.id },
        data: { status: "UNMATCHED" },
      });
      unmatched++;
    }
  }

  // Atualizar contadores do batch
  await tx.reconciliationBatch.update({
    where: { id: batchId },
    data: {
      matchedCount: matched + suggested,
      unmatchedCount: unmatched,
      status: "MATCHED",
    },
  });

  return { matched, unmatched, suggested };
}
