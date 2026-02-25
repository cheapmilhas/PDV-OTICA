import { PrismaClient, ProductType, PaymentMethod } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

// ============================================================
// HELPERS
// ============================================================

async function getChartAccountByCode(
  tx: TransactionClient,
  companyId: string,
  code: string
) {
  const account = await tx.chartOfAccounts.findUnique({
    where: { companyId_code: { companyId, code } },
  });
  if (!account) {
    throw new Error(`Conta contábil não encontrada: ${code} (companyId: ${companyId})`);
  }
  return account;
}

async function getFinanceAccountByType(
  tx: TransactionClient,
  companyId: string,
  type: string
) {
  const account = await tx.financeAccount.findFirst({
    where: { companyId, type: type as any, active: true },
  });
  return account;
}

/**
 * Mapeia ProductType para código da conta CMV
 */
function getCMVAccountCode(productType?: ProductType | null): string {
  if (!productType) return "4.1.04";

  switch (productType) {
    case "FRAME":
    case "SUNGLASSES":
      return "4.1.01"; // CMV - Armações
    case "LENS_SERVICE":
    case "OPHTHALMIC_LENS":
      return "4.1.02"; // CMV - Lentes
    case "ACCESSORY":
    case "CONTACT_LENS":
    case "CLEANING_KIT":
    case "CASE":
    case "OPTICAL_ACCESSORY":
    case "LENS_SOLUTION":
      return "4.1.03"; // CMV - Acessórios
    default:
      return "4.1.04"; // CMV - Outros
  }
}

/**
 * Mapeia PaymentMethod para código da conta contábil de débito
 */
function getPaymentDebitAccountCode(method: PaymentMethod): string {
  switch (method) {
    case "CASH":
      return "1.1.01"; // Caixa
    case "PIX":
      return "1.1.02"; // Bancos
    case "DEBIT_CARD":
    case "CREDIT_CARD":
      return "1.1.05"; // Adquirente Cartão
    default:
      return "1.1.02"; // Bancos (fallback)
  }
}

/**
 * Mapeia PaymentMethod para tipo de FinanceAccount
 */
function getFinanceAccountType(method: PaymentMethod): string {
  switch (method) {
    case "CASH":
      return "CASH";
    case "PIX":
      return "PIX";
    case "DEBIT_CARD":
    case "CREDIT_CARD":
      return "CARD_ACQUIRER";
    default:
      return "BANK";
  }
}

// ============================================================
// FIFO
// ============================================================

interface FIFOConsumption {
  inventoryLotId: string;
  qtyConsumed: number;
  unitCost: number;
  totalCost: number;
}

interface FIFOResult {
  totalCost: number;
  consumptions: FIFOConsumption[];
}

/**
 * Consome estoque FIFO para um item de venda.
 * Se não existem lotes, faz fallback para costPrice do SaleItem.
 */
export async function consumeInventoryFIFO(
  tx: TransactionClient,
  companyId: string,
  productId: string,
  qty: number,
  saleItemId: string,
  branchId?: string
): Promise<FIFOResult> {
  const lots = await tx.inventoryLot.findMany({
    where: {
      companyId,
      productId,
      qtyRemaining: { gt: 0 },
      ...(branchId ? { branchId } : {}),
    },
    orderBy: { acquiredAt: "asc" },
  });

  const consumptions: FIFOConsumption[] = [];
  let remaining = qty;
  let totalCost = 0;

  for (const lot of lots) {
    if (remaining <= 0) break;

    const consume = Math.min(remaining, lot.qtyRemaining);
    const unitCost = Number(lot.unitCost);
    const lineCost = consume * unitCost;

    // Atualizar lote
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: { qtyRemaining: lot.qtyRemaining - consume },
    });

    // Criar registro de consumo
    await tx.saleItemLot.create({
      data: {
        saleItemId,
        inventoryLotId: lot.id,
        qtyConsumed: consume,
        unitCost: unitCost,
        totalCost: lineCost,
      },
    });

    consumptions.push({
      inventoryLotId: lot.id,
      qtyConsumed: consume,
      unitCost,
      totalCost: lineCost,
    });

    totalCost += lineCost;
    remaining -= consume;
  }

  return { totalCost, consumptions };
}

// ============================================================
// LANÇAMENTOS DE VENDA
// ============================================================

/**
 * Gera lançamentos financeiros (ledger) para uma venda completada.
 * Deve ser chamado dentro de uma transaction, após a venda ser COMPLETED.
 */
export async function generateSaleEntries(
  tx: TransactionClient,
  saleId: string,
  companyId: string
): Promise<void> {
  const sale = await tx.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: {
      items: {
        include: { product: { select: { type: true } } },
      },
      payments: true,
    },
  });

  const branchId = sale.branchId;
  const saleTotal = Number(sale.total);
  const discountTotal = Number(sale.discountTotal);

  // 1. RECEITA DE VENDA — Débito: Contas a Receber, Crédito: Receita de Vendas
  const contasAReceber = await getChartAccountByCode(tx, companyId, "1.1.03");
  const receitaVendas = await getChartAccountByCode(tx, companyId, "3.1.01");

  await tx.financeEntry.upsert({
    where: {
      companyId_sourceType_sourceId_type_side: {
        companyId,
        sourceType: "Sale",
        sourceId: saleId,
        type: "SALE_REVENUE",
        side: "DEBIT",
      },
    },
    update: { amount: saleTotal },
    create: {
      companyId,
      branchId,
      type: "SALE_REVENUE",
      side: "DEBIT",
      amount: saleTotal,
      debitAccountId: contasAReceber.id,
      creditAccountId: receitaVendas.id,
      sourceType: "Sale",
      sourceId: saleId,
      description: `Venda #${saleId.substring(0, 8)}`,
      entryDate: sale.completedAt ?? sale.createdAt,
      cashDate: null, // Receita é competência — caixa vem no pagamento
    },
  });

  // 2. DESCONTO (se houver)
  if (discountTotal > 0) {
    const descontos = await getChartAccountByCode(tx, companyId, "3.2.02");

    await tx.financeEntry.upsert({
      where: {
        companyId_sourceType_sourceId_type_side: {
          companyId,
          sourceType: "Sale",
          sourceId: saleId,
          type: "SALE_REVENUE",
          side: "CREDIT",
        },
      },
      update: { amount: discountTotal },
      create: {
        companyId,
        branchId,
        type: "SALE_REVENUE",
        side: "CREDIT",
        amount: discountTotal,
        debitAccountId: descontos.id,
        creditAccountId: contasAReceber.id,
        sourceType: "Sale",
        sourceId: saleId,
        description: `Desconto venda #${saleId.substring(0, 8)}`,
        entryDate: sale.completedAt ?? sale.createdAt,
        cashDate: null, // Desconto é competência
      },
    });
  }

  // 3. CMV por item (FIFO ou fallback costPrice)
  const estoque = await getChartAccountByCode(tx, companyId, "1.1.04");

  for (const item of sale.items) {
    if (!item.productId || !item.stockControlled) continue;

    const costPrice = Number(item.costPrice);
    let itemCost = costPrice * item.qty;

    // Tentar FIFO
    try {
      const fifoResult = await consumeInventoryFIFO(
        tx,
        companyId,
        item.productId,
        item.qty,
        item.id,
        branchId
      );
      if (fifoResult.totalCost > 0) {
        itemCost = fifoResult.totalCost;
      }
    } catch {
      // FIFO falhou, usar costPrice como fallback
    }

    if (itemCost <= 0) continue;

    const cmvCode = getCMVAccountCode(item.product?.type);
    const cmvAccount = await getChartAccountByCode(tx, companyId, cmvCode);

    await tx.financeEntry.upsert({
      where: {
        companyId_sourceType_sourceId_type_side: {
          companyId,
          sourceType: "SaleItem",
          sourceId: item.id,
          type: "COGS",
          side: "DEBIT",
        },
      },
      update: { amount: itemCost },
      create: {
        companyId,
        branchId,
        type: "COGS",
        side: "DEBIT",
        amount: itemCost,
        debitAccountId: cmvAccount.id,
        creditAccountId: estoque.id,
        sourceType: "SaleItem",
        sourceId: item.id,
        description: `CMV - ${item.description || item.productId}`,
        entryDate: sale.completedAt ?? sale.createdAt,
        cashDate: null, // CMV é competência pura
      },
    });
  }

  // 4. PAGAMENTOS RECEBIDOS
  for (const payment of sale.payments) {
    if (payment.status !== "RECEIVED") continue;

    const paymentAmount = Number(payment.amount);
    const debitCode = getPaymentDebitAccountCode(payment.method);
    const debitAccount = await getChartAccountByCode(tx, companyId, debitCode);
    const faType = getFinanceAccountType(payment.method);
    const financeAccount = await getFinanceAccountByType(tx, companyId, faType);

    await tx.financeEntry.upsert({
      where: {
        companyId_sourceType_sourceId_type_side: {
          companyId,
          sourceType: "SalePayment",
          sourceId: payment.id,
          type: "PAYMENT_RECEIVED",
          side: "DEBIT",
        },
      },
      update: { amount: paymentAmount },
      create: {
        companyId,
        branchId,
        type: "PAYMENT_RECEIVED",
        side: "DEBIT",
        amount: paymentAmount,
        debitAccountId: debitAccount.id,
        creditAccountId: contasAReceber.id,
        financeAccountId: financeAccount?.id,
        sourceType: "SalePayment",
        sourceId: payment.id,
        description: `Pagamento ${payment.method} - Venda #${saleId.substring(0, 8)}`,
        entryDate: payment.receivedAt ?? sale.completedAt ?? sale.createdAt,
        cashDate: payment.receivedAt ?? sale.completedAt ?? new Date(),
      },
    });

    // Atualizar saldo da conta financeira
    if (financeAccount) {
      await tx.financeAccount.update({
        where: { id: financeAccount.id },
        data: { balance: { increment: paymentAmount } },
      });
    }

    // 5. TAXA DE CARTÃO (se aplicável)
    const feeAmount = payment.feeAmount ? Number(payment.feeAmount) : 0;
    if (feeAmount > 0) {
      const taxaCartao = await getChartAccountByCode(tx, companyId, "5.1.01");
      const adquirente = await getChartAccountByCode(tx, companyId, "1.1.05");

      await tx.financeEntry.upsert({
        where: {
          companyId_sourceType_sourceId_type_side: {
            companyId,
            sourceType: "SalePayment",
            sourceId: payment.id,
            type: "CARD_FEE",
            side: "DEBIT",
          },
        },
        update: { amount: feeAmount },
        create: {
          companyId,
          branchId,
          type: "CARD_FEE",
          side: "DEBIT",
          amount: feeAmount,
          debitAccountId: taxaCartao.id,
          creditAccountId: adquirente.id,
          financeAccountId: financeAccount?.id,
          sourceType: "SalePayment",
          sourceId: payment.id,
          description: `Taxa cartão ${payment.cardBrand || payment.method} - Venda #${saleId.substring(0, 8)}`,
          entryDate: payment.receivedAt ?? sale.completedAt ?? sale.createdAt,
          cashDate: payment.settlementDate ?? payment.receivedAt ?? new Date(),
        },
      });
    }
  }
}

// ============================================================
// LANÇAMENTOS DE DEVOLUÇÃO
// ============================================================

/**
 * Gera lançamentos financeiros para uma devolução.
 * Reverte: receita, CMV, e pagamento.
 */
export async function generateRefundEntries(
  tx: TransactionClient,
  refundId: string,
  companyId: string
): Promise<void> {
  const refund = await tx.refund.findUniqueOrThrow({
    where: { id: refundId },
    include: {
      items: {
        include: {
          saleItem: { include: { product: { select: { type: true } } } },
        },
      },
      sale: true,
    },
  });

  const branchId = refund.branchId;
  const totalRefund = Number(refund.totalRefund);

  // 1. Reverter receita — Débito: Devoluções/Estornos, Crédito: Contas a Receber
  const devolucoes = await getChartAccountByCode(tx, companyId, "3.2.01");
  const contasAReceber = await getChartAccountByCode(tx, companyId, "1.1.03");

  await tx.financeEntry.upsert({
    where: {
      companyId_sourceType_sourceId_type_side: {
        companyId,
        sourceType: "Refund",
        sourceId: refundId,
        type: "REFUND",
        side: "DEBIT",
      },
    },
    update: { amount: totalRefund },
    create: {
      companyId,
      branchId,
      type: "REFUND",
      side: "DEBIT",
      amount: totalRefund,
      debitAccountId: devolucoes.id,
      creditAccountId: contasAReceber.id,
      sourceType: "Refund",
      sourceId: refundId,
      description: `Devolução #${refundId.substring(0, 8)} - Venda #${refund.saleId.substring(0, 8)}`,
      entryDate: refund.completedAt ?? new Date(),
      cashDate: refund.completedAt ?? new Date(),
    },
  });

  // 2. Reverter CMV — Débito: Estoque, Crédito: CMV
  const estoque = await getChartAccountByCode(tx, companyId, "1.1.04");
  const totalCost = Number(refund.totalCost);

  if (totalCost > 0) {
    for (const item of refund.items) {
      const costAmount = Number(item.costAmount);
      if (costAmount <= 0) continue;

      const cmvCode = getCMVAccountCode(item.saleItem.product?.type);
      const cmvAccount = await getChartAccountByCode(tx, companyId, cmvCode);

      await tx.financeEntry.upsert({
        where: {
          companyId_sourceType_sourceId_type_side: {
            companyId,
            sourceType: "RefundItem",
            sourceId: item.id,
            type: "COGS",
            side: "CREDIT",
          },
        },
        update: { amount: costAmount },
        create: {
          companyId,
          branchId,
          type: "COGS",
          side: "CREDIT",
          amount: costAmount,
          debitAccountId: estoque.id,
          creditAccountId: cmvAccount.id,
          sourceType: "RefundItem",
          sourceId: item.id,
          description: `Reversão CMV - Devolução #${refundId.substring(0, 8)}`,
          entryDate: refund.completedAt ?? new Date(),
          cashDate: null, // Reversão CMV é competência
        },
      });
    }
  }

  // 3. Reverter pagamento — depende do método de devolução
  if (refund.refundMethod) {
    const rm = refund.refundMethod;
    const mappedMethod: PaymentMethod =
      rm === "CASH" ? "CASH" : rm === "CREDIT" ? "CREDIT_CARD" : rm === "PIX" ? "PIX" : "OTHER";
    const debitCode = getPaymentDebitAccountCode(mappedMethod);
    const contaDebito = await getChartAccountByCode(tx, companyId, debitCode);
    const faType = getFinanceAccountType(mappedMethod);
    const financeAccount = await getFinanceAccountByType(tx, companyId, faType);

    await tx.financeEntry.upsert({
      where: {
        companyId_sourceType_sourceId_type_side: {
          companyId,
          sourceType: "Refund",
          sourceId: refundId,
          type: "PAYMENT_RECEIVED",
          side: "CREDIT",
        },
      },
      update: { amount: totalRefund },
      create: {
        companyId,
        branchId,
        type: "PAYMENT_RECEIVED",
        side: "CREDIT",
        amount: totalRefund,
        debitAccountId: contasAReceber.id,
        creditAccountId: contaDebito.id,
        financeAccountId: financeAccount?.id,
        sourceType: "Refund",
        sourceId: refundId,
        description: `Reembolso ${refund.refundMethod} - Devolução #${refundId.substring(0, 8)}`,
        entryDate: refund.completedAt ?? new Date(),
        cashDate: refund.completedAt ?? new Date(),
      },
    });

    // Decrementar saldo da conta financeira
    if (financeAccount) {
      await tx.financeAccount.update({
        where: { id: financeAccount.id },
        data: { balance: { decrement: totalRefund } },
      });
    }
  }
}

// ============================================================
// LANÇAMENTO MANUAL DE DESPESA
// ============================================================

interface ManualExpenseData {
  description: string;
  amount: number;
  debitAccountCode: string; // ex: "5.1.03" (Aluguel)
  creditAccountCode: string; // ex: "1.1.01" (Caixa) ou "1.1.02" (Bancos)
  financeAccountType?: string; // "CASH", "BANK", "PIX"
  branchId?: string;
  entryDate?: Date;
  cashDate?: Date;
  sourceType?: string;
  sourceId?: string;
}

/**
 * Cria um lançamento manual de despesa.
 */
export async function generateManualExpenseEntry(
  tx: TransactionClient,
  data: ManualExpenseData,
  companyId: string
): Promise<string> {
  const debitAccount = await getChartAccountByCode(tx, companyId, data.debitAccountCode);
  const creditAccount = await getChartAccountByCode(tx, companyId, data.creditAccountCode);

  let financeAccountId: string | undefined;
  if (data.financeAccountType) {
    const fa = await getFinanceAccountByType(tx, companyId, data.financeAccountType);
    financeAccountId = fa?.id;

    // Decrementar saldo
    if (fa) {
      await tx.financeAccount.update({
        where: { id: fa.id },
        data: { balance: { decrement: data.amount } },
      });
    }
  }

  const entry = await tx.financeEntry.create({
    data: {
      companyId,
      branchId: data.branchId,
      type: "EXPENSE",
      side: "DEBIT",
      amount: data.amount,
      debitAccountId: debitAccount.id,
      creditAccountId: creditAccount.id,
      financeAccountId,
      sourceType: data.sourceType ?? "Manual",
      sourceId: data.sourceId ?? `manual-${Date.now()}`,
      description: data.description,
      entryDate: data.entryDate ?? new Date(),
      cashDate: data.cashDate ?? data.entryDate ?? new Date(),
    },
  });

  return entry.id;
}
