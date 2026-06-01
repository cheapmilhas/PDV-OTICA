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
 * M4: calcula a confiança de casar um item externo com um pagamento interno.
 * Retorna { confidence, internalAmount } ou null se não casa. Extraído do loop
 * para permitir matching por confiança GLOBAL (ver autoMatchBatch).
 */
function scorePair(
  item: { externalId: string | null; externalRef: string | null; externalAmount: any; externalDate: Date; cardBrand: string | null },
  payment: { amount: any; nsu: string | null; authorizationCode: string | null; cardBrand: string | null; receivedAt: Date | null; createdAt: Date },
): { confidence: number; internalAmount: number } | null {
  const paymentAmount = Number(payment.amount);
  const externalAmount = Number(item.externalAmount);
  const amountDiff = Math.abs(paymentAmount - externalAmount);
  const amountTolerance = paymentAmount * 0.01; // 1%
  const paymentDate = payment.receivedAt || payment.createdAt;
  const daysDiff = Math.abs(
    (item.externalDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const sameBrand =
    !!item.cardBrand &&
    !!payment.cardBrand &&
    item.cardBrand.toUpperCase() === payment.cardBrand.toUpperCase();

  // Estratégia 1: NSU exato (95%)
  if (item.externalId && payment.nsu && item.externalId === payment.nsu) {
    return { confidence: 95, internalAmount: paymentAmount };
  }
  // Estratégia 2: Auth code + valor ~1% (85%)
  if (
    item.externalRef &&
    payment.authorizationCode &&
    item.externalRef === payment.authorizationCode &&
    amountDiff <= amountTolerance
  ) {
    return { confidence: 85, internalAmount: paymentAmount };
  }
  // Estratégia 3: Valor + data ±2 dias + bandeira (70%)
  if (amountDiff <= amountTolerance && sameBrand && daysDiff <= 2) {
    return { confidence: 70, internalAmount: paymentAmount };
  }
  // Estratégia 4: Valor + data ±3 dias (50%)
  if (amountDiff <= amountTolerance && daysDiff <= 3) {
    return { confidence: 50, internalAmount: paymentAmount };
  }
  return null;
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
  // Buscar itens pendentes do batch (cap defensivo — ver MAX_PAYMENTS).
  const MAX_ITEMS = 5000;
  const items = await tx.reconciliationItem.findMany({
    where: { batchId, status: "PENDING" },
    take: MAX_ITEMS,
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

  // M4: cap defensivo — o matching gera candidatos item×payment; sem limite,
  // um batch grande (milhares de cada) estouraria memória (O(I×P)). 5000 cobre
  // qualquer fechamento real de ótica com folga; acima disso loga aviso.
  const MAX_PAYMENTS = 5000;
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
    orderBy: { receivedAt: "asc" },
    take: MAX_PAYMENTS,
  });
  if (payments.length === MAX_PAYMENTS) {
    console.warn(
      `[reconciliation] batch ${batchId}: atingiu o teto de ${MAX_PAYMENTS} pagamentos — possível truncamento do auto-match.`,
    );
  }

  let matched = 0;
  let suggested = 0;
  let unmatched = 0;

  // M4: matching por confiança GLOBAL, não guloso na ordem dos items. Antes, o
  // 1º item processado reservava um pagamento mesmo num match FRACO (50%),
  // bloqueando um match FORTE (95% NSU) de outro item com o mesmo pagamento.
  // Agora: gera TODOS os candidatos (item×payment com confiança), ordena por
  // confiança desc e atribui de cima p/ baixo — o match mais forte sempre vence.
  const candidates: Array<{
    itemId: string;
    paymentId: string;
    confidence: number;
    internalAmount: number;
  }> = [];

  for (const item of items) {
    for (const payment of payments) {
      const score = scorePair(item as any, payment as any);
      if (score) {
        candidates.push({
          itemId: item.id,
          paymentId: payment.id,
          confidence: score.confidence,
          internalAmount: score.internalAmount,
        });
      }
    }
  }

  // Mais forte primeiro; desempate estável por itemId/paymentId.
  candidates.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      a.itemId.localeCompare(b.itemId) ||
      a.paymentId.localeCompare(b.paymentId),
  );

  const usedPaymentIds = new Set<string>();
  const matchedItemIds = new Set<string>();
  const itemById = new Map(items.map((i) => [i.id, i]));

  for (const cand of candidates) {
    if (matchedItemIds.has(cand.itemId) || usedPaymentIds.has(cand.paymentId)) {
      continue; // item ou pagamento já atribuído a um match mais forte
    }
    matchedItemIds.add(cand.itemId);
    usedPaymentIds.add(cand.paymentId);

    const item = itemById.get(cand.itemId)!;
    const externalAmount = Number(item.externalAmount);
    const differenceAmount = externalAmount - cand.internalAmount;

    let status: ReconciliationItemStatus;
    if (cand.confidence >= 70) {
      status = "AUTO_MATCHED";
      matched++;
    } else {
      status = "SUGGESTED_MATCH";
      suggested++;
    }

    await tx.reconciliationItem.update({
      where: { id: cand.itemId },
      data: {
        status,
        matchedSalePaymentId: cand.paymentId,
        internalAmount: cand.internalAmount,
        differenceAmount: Math.round(differenceAmount * 100) / 100,
        matchConfidence: cand.confidence,
        resolutionType: cand.confidence >= 70 ? "EXACT_MATCH" : null,
        resolvedAt: cand.confidence >= 70 ? new Date() : null,
      },
    });
  }

  // Itens sem nenhum match → UNMATCHED.
  for (const item of items) {
    if (matchedItemIds.has(item.id)) continue;
    await tx.reconciliationItem.update({
      where: { id: item.id },
      data: { status: "UNMATCHED" },
    });
    unmatched++;
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
