import { PrismaClient, ProductType, PaymentMethod, AccountCategory } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { getPaymentLabel } from "@/lib/payment-labels";

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
      return "1.1.01"; // Caixa (dinheiro físico)
    case "PIX":
      return "1.1.02"; // Bancos (recebido na hora)
    case "DEBIT_CARD":
    case "CREDIT_CARD":
      return "1.1.05"; // Adquirente Cartão
    case "STORE_CREDIT":
    case "BALANCE_DUE":
    case "BOLETO":
    case "CHEQUE":
      return "1.1.03"; // Contas a Receber (crediário/saldo/boleto/cheque — dinheiro ainda não recebido)
    default:
      return "1.1.02"; // Bancos (fallback)
  }
}

/**
 * Mapeia PaymentMethod para tipo de FinanceAccount
 */
/**
 * Mapeia PaymentMethod para tipo de FinanceAccount.
 * Retorna null para STORE_CREDIT — crediário não entra em conta financeira.
 */
function getFinanceAccountType(method: PaymentMethod): string | null {
  switch (method) {
    case "CASH":
      return "CASH";
    case "PIX":
      return "PIX";
    case "DEBIT_CARD":
    case "CREDIT_CARD":
      return "CARD_ACQUIRER";
    case "STORE_CREDIT":
    case "BALANCE_DUE":
    case "BOLETO":
    case "CHEQUE":
      return null; // Crediário/Saldo/Boleto/Cheque não entra em conta financeira — será recebido depois
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
  // Idempotência: se este item de venda já teve consumo FIFO registrado, NÃO
  // reconsumir. generateSaleEntries roda dentro da tx da venda e, se um passo
  // posterior falhar (ex.: conta contábil ausente), o erro é engolido em
  // applyFinanceEntriesInTx e o cron retry-finance-entries reprocessa numa tx
  // nova — sem este guard, o retry decrementaria InventoryLot.qtyRemaining de
  // novo a cada tentativa, gerando estoque fantasma e CMV inflado.
  //
  // Robustez (revisão adversarial): NÃO fazemos early-return cego por
  // existing.length>0. Se o consumo já registrado cobre a quantidade pedida,
  // devolvemos o que existe (idempotente). Se cobre PARCIALMENTE (registro
  // incompleto de uma tentativa anterior, ou estoque que só tinha parte),
  // consumimos APENAS o saldo faltante — sem duplicar o que já foi debitado nem
  // travar num consumo incompleto. O `SaleItemLot` tem @@unique(saleItemId,
  // inventoryLotId), então re-consumir de um lote já usado faz upsert (não
  // duplica linha).
  const existing = await tx.saleItemLot.findMany({
    where: { saleItemId },
  });
  const alreadyConsumedQty = existing.reduce((sum, l) => sum + l.qtyConsumed, 0);
  const alreadyCost = existing.reduce((sum, l) => sum + Number(l.totalCost), 0);
  const existingConsumptions: FIFOConsumption[] = existing.map((l) => ({
    inventoryLotId: l.inventoryLotId,
    qtyConsumed: l.qtyConsumed,
    unitCost: Number(l.unitCost),
    totalCost: Number(l.totalCost),
  }));

  // Já cobre (ou excede) o pedido → idempotente, devolve o registrado.
  if (alreadyConsumedQty >= qty) {
    return { totalCost: alreadyCost, consumptions: existingConsumptions };
  }

  const lotsUsed = new Set(existing.map((l) => l.inventoryLotId));
  const lots = await tx.inventoryLot.findMany({
    where: {
      companyId,
      productId,
      qtyRemaining: { gt: 0 },
      ...(branchId ? { branchId } : {}),
    },
    orderBy: { acquiredAt: "asc" },
  });

  const consumptions: FIFOConsumption[] = [...existingConsumptions];
  // Só falta o saldo não coberto pelo consumo já registrado.
  let remaining = qty - alreadyConsumedQty;
  let totalCost = alreadyCost;

  for (const lot of lots) {
    if (remaining <= 0) break;
    // Lote já registrado neste item numa tentativa anterior: pular (o consumo
    // dele já está contabilizado em alreadyConsumedQty/alreadyCost). Sem isto,
    // um lote parcialmente consumido antes seria consumido de novo.
    if (lotsUsed.has(lot.id)) continue;

    const consume = Math.min(remaining, lot.qtyRemaining);
    const unitCost = Number(lot.unitCost);
    const lineCost = consume * unitCost;

    // Atualizar lote
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: { qtyRemaining: lot.qtyRemaining - consume },
    });

    // Registrar consumo. upsert (não create) por segurança contra corrida com
    // um registro parcial anterior do mesmo (saleItemId, inventoryLotId).
    await tx.saleItemLot.upsert({
      where: { saleItemId_inventoryLotId: { saleItemId, inventoryLotId: lot.id } },
      update: { qtyConsumed: consume, unitCost, totalCost: lineCost },
      create: {
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
  // Cache para evitar queries repetidas de contas contábeis
  const chartAccountCache = new Map<string, Awaited<ReturnType<typeof getChartAccountByCode>>>();
  const getCachedChartAccount = async (code: string) => {
    const cached = chartAccountCache.get(code);
    if (cached) return cached;
    const account = await getChartAccountByCode(tx, companyId, code);
    chartAccountCache.set(code, account);
    return account;
  };

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
  const contasAReceber = await getCachedChartAccount("1.1.03");
  const receitaVendas = await getCachedChartAccount("3.1.01");

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
    const descontos = await getCachedChartAccount("3.2.02");

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
  const estoque = await getCachedChartAccount("1.1.04");

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
    const cmvAccount = await getCachedChartAccount(cmvCode);

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
    const debitAccount = await getCachedChartAccount(debitCode);
    const faType = getFinanceAccountType(payment.method);
    const financeAccount = faType ? await getFinanceAccountByType(tx, companyId, faType) : null;

    // Q7.1 P0-6: cashDate de CREDIT_CARD reflete D+settlementDays (default 30),
    // não D+0 como antes. Cash flow estava projetando cartão como dinheiro
    // imediato e distorcendo previsão de fluxo.
    // settlementDate da própria SalePayment vence — vem do feeService.
    const baseCashDate = payment.receivedAt ?? sale.completedAt ?? new Date();
    let cashDate: Date | null;
    if (
      payment.method === "STORE_CREDIT" ||
      payment.method === "BALANCE_DUE" ||
      payment.method === "BOLETO" ||
      payment.method === "CHEQUE"
    ) {
      cashDate = null; // a prazo (crediário/saldo/boleto/cheque) não entra no caixa
    } else if (payment.method === "CREDIT_CARD") {
      if (payment.settlementDate) {
        cashDate = payment.settlementDate;
      } else {
        const d = new Date(baseCashDate);
        d.setDate(d.getDate() + 30); // default settlement adquirente
        cashDate = d;
      }
    } else {
      cashDate = baseCashDate; // CASH/PIX/DEBIT_CARD = D+0
    }

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
        description: `Pagamento ${getPaymentLabel(payment.method)} - Venda #${saleId.substring(0, 8)}`,
        entryDate: payment.receivedAt ?? sale.completedAt ?? sale.createdAt,
        cashDate,
      },
    });

    // Q7.1 P0-7: balance de CARD_ACQUIRER NÃO incrementa na venda — só no
    // settlement (job de reconciliação ou webhook adquirente). Antes ficava
    // double-count: venda inflava balance + recebimento futuro inflava de novo.
    if (financeAccount && faType !== "CARD_ACQUIRER") {
      await tx.financeAccount.update({
        where: { id: financeAccount.id },
        data: { balance: { increment: paymentAmount } },
      });
    }

    // 5. TAXA DE CARTÃO (se aplicável)
    const feeAmount = payment.feeAmount ? Number(payment.feeAmount) : 0;
    if (feeAmount > 0) {
      const taxaCartao = await getCachedChartAccount("5.1.01");
      const adquirente = await getCachedChartAccount("1.1.05");

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
          description: `Taxa cartão ${payment.cardBrand || getPaymentLabel(payment.method)} - Venda #${saleId.substring(0, 8)}`,
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

  // 3. Reverter pagamento — depende do método de devolução.
  //
  // CR-2 (revisão adversarial): o REEMBOLSO em caixa é o dinheiro que
  // efetivamente ENTROU do bolso do cliente = totalRefund − cashbackUsed. O
  // cashback usado nunca foi caixa (é saldo de fidelidade, já devolvido ao
  // cliente por reverseCashbackForSaleInTx no cancel). Reembolsar/decrementar o
  // saldo pelo totalRefund BRUTO drenava a conta financeira em cashbackUsed a
  // mais a cada devolução de venda que usou cashback.
  const cashbackUsed = Math.max(0, Number(refund.sale?.cashbackUsed ?? 0));
  const cashRefund = Math.round((totalRefund - cashbackUsed) * 100) / 100;

  if (refund.refundMethod && cashRefund > 0) {
    const rm = refund.refundMethod;
    const mappedMethod: PaymentMethod =
      rm === "CASH" ? "CASH" : rm === "CREDIT" ? "CREDIT_CARD" : rm === "PIX" ? "PIX" : "OTHER";
    const debitCode = getPaymentDebitAccountCode(mappedMethod);
    const contaDebito = await getChartAccountByCode(tx, companyId, debitCode);
    const faType = getFinanceAccountType(mappedMethod);
    const financeAccount = faType ? await getFinanceAccountByType(tx, companyId, faType) : null;

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
      update: { amount: cashRefund },
      create: {
        companyId,
        branchId,
        type: "PAYMENT_RECEIVED",
        side: "CREDIT",
        amount: cashRefund,
        debitAccountId: contasAReceber.id,
        creditAccountId: contaDebito.id,
        financeAccountId: financeAccount?.id,
        sourceType: "Refund",
        sourceId: refundId,
        description: `Reembolso ${getPaymentLabel(refund.refundMethod || "OTHER")} - Devolução #${refundId.substring(0, 8)}`,
        entryDate: refund.completedAt ?? new Date(),
        cashDate: refund.completedAt ?? new Date(),
      },
    });

    // Decrementar saldo da conta financeira pelo valor REALMENTE reembolsado.
    if (financeAccount) {
      await tx.financeAccount.update({
        where: { id: financeAccount.id },
        data: { balance: { decrement: cashRefund } },
      });
    }
  }
}

// ============================================================
// LANÇAMENTO DE CONTA A PAGAR
// ============================================================

/**
 * Mapeia AccountCategory para código da conta contábil de despesa.
 */
function getCategoryExpenseAccountCode(category: AccountCategory): string {
  switch (category) {
    case "RENT":
      return "5.1.03"; // Aluguel
    case "UTILITIES":
      return "5.1.04"; // Energia
    case "INTERNET_PHONE":
      return "5.1.05"; // Telefone/Internet
    case "MARKETING":
      return "5.1.07"; // Marketing
    case "SUPPLIERS":
    case "PERSONNEL":
    case "TAXES":
    case "MAINTENANCE":
    case "EQUIPMENT":
    case "ACCOUNTING":
    case "OTHER":
    default:
      return "5.1.08"; // Outras Despesas
  }
}

/**
 * Gera lançamento financeiro (EXPENSE) ao pagar uma conta a pagar.
 * Idempotente — usa upsert na chave única (companyId, sourceType, sourceId, type, side).
 *
 * Lançamento: Débito Despesa (5.x) / Crédito Contas a Pagar (2.1.01)
 */
export async function generateAccountPayableExpenseEntry(
  tx: TransactionClient,
  accountPayableId: string,
  companyId: string,
  category: AccountCategory,
  amount: number,
  description: string,
  paidDate: Date,
  branchId?: string | null,
  financeAccountId?: string | null
): Promise<void> {
  const expenseCode = getCategoryExpenseAccountCode(category);
  const expenseAccount = await getChartAccountByCode(tx, companyId, expenseCode);
  const contasAPagar = await getChartAccountByCode(tx, companyId, "2.1.01");

  await tx.financeEntry.upsert({
    where: {
      companyId_sourceType_sourceId_type_side: {
        companyId,
        sourceType: "AccountPayable",
        sourceId: accountPayableId,
        type: "EXPENSE",
        side: "DEBIT",
      },
    },
    update: {
      amount,
      entryDate: paidDate,
      cashDate: paidDate,
      financeAccountId: financeAccountId ?? undefined,
    },
    create: {
      companyId,
      branchId: branchId ?? undefined,
      type: "EXPENSE",
      side: "DEBIT",
      amount,
      debitAccountId: expenseAccount.id,
      creditAccountId: contasAPagar.id,
      financeAccountId: financeAccountId ?? undefined,
      sourceType: "AccountPayable",
      sourceId: accountPayableId,
      description: description,
      entryDate: paidDate,
      cashDate: paidDate,
    },
  });
}

/**
 * Remove o lançamento EXPENSE vinculado a uma conta a pagar (para reverter pagamento).
 */
export async function deleteAccountPayableExpenseEntry(
  tx: TransactionClient,
  accountPayableId: string,
  companyId: string
): Promise<void> {
  const entry = await tx.financeEntry.findFirst({
    where: {
      companyId,
      sourceType: "AccountPayable",
      sourceId: accountPayableId,
      type: "EXPENSE",
    },
  });

  if (!entry) return;

  // Re-credita o saldo SOMENTE se a conta foi paga no código novo (gravou financeAccountId).
  // Contas pagas no código antigo têm financeAccountId null e nunca decrementaram saldo —
  // re-creditá-las inflaria o saldo com dinheiro que nunca saiu.
  if (entry.financeAccountId) {
    await tx.financeAccount.update({
      where: { id: entry.financeAccountId },
      data: { balance: { increment: Number(entry.amount) } },
    });
  }

  await tx.financeEntry.delete({ where: { id: entry.id } });
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
/**
 * H15: garante a conta contábil "Receita Financeira / Juros" (3.1.03).
 *
 * O plano de contas padrão não tinha conta de receita financeira, então juros
 * de renegociação/atraso não tinham onde ser lançados. Em vez de exigir uma
 * migration de dados em todas as empresas, a conta é criada sob demanda
 * (upsert) na primeira renegociação que precisar — auto-curável e idempotente.
 */
async function ensureFinancialRevenueAccount(
  tx: TransactionClient,
  companyId: string
) {
  const code = "3.1.03";

  // Vincula ao pai "Receita Operacional" (3.1) se existir, senão fica solta.
  const parent = await tx.chartOfAccounts.findUnique({
    where: { companyId_code: { companyId, code: "3.1" } },
  });

  // upsert ATÔMICO (não findUnique-then-create) — sob renegociações
  // concorrentes na 1ª vez de uma empresa, dois creates colidiriam em P2002
  // e o lançamento seria descartado pelo catch não-fatal. update vazio = no-op.
  return tx.chartOfAccounts.upsert({
    where: { companyId_code: { companyId, code } },
    update: {},
    create: {
      companyId,
      code,
      name: "Receita Financeira / Juros",
      kind: "REVENUE",
      ...(parent ? { parentId: parent.id } : {}),
    },
  });
}

/**
 * H15: lança como receita financeira o JURO de uma renegociação de AR.
 *
 * A renegociação cria novas parcelas cujo total (newAmount) costuma ser maior
 * que o saldo original (acréscimo de juros/multa). Esse ganho NÃO aparecia em
 * lugar nenhum do ledger. Aqui registramos a diferença positiva como receita
 * financeira (Débito: Contas a Receber 1.1.03; Crédito: Receita Financeira
 * 3.1.03). Idempotente via @@unique(companyId, sourceType, sourceId, type, side).
 *
 * Retorna o id do lançamento, ou null se não houve juro (newAmount <= saldo).
 *
 * NOTA: o DRE atual é baseado em sale.total e ainda NÃO soma receitas
 * financeiras do ledger — corrigir isso é dívida separada (ver memória H15).
 */
export async function generateRenegotiationInterestEntry(
  tx: TransactionClient,
  data: {
    accountReceivableId: string;
    originalAmount: number;
    newAmount: number;
    branchId?: string | null;
    entryDate?: Date;
  },
  companyId: string
): Promise<string | null> {
  const interest =
    Math.round((data.newAmount - data.originalAmount) * 100) / 100;
  if (interest <= 0) return null; // sem juro a registrar

  const contasAReceber = await getChartAccountByCode(tx, companyId, "1.1.03");
  const receitaFinanceira = await ensureFinancialRevenueAccount(tx, companyId);

  const entry = await tx.financeEntry.upsert({
    where: {
      companyId_sourceType_sourceId_type_side: {
        companyId,
        sourceType: "ARRenegotiation",
        sourceId: data.accountReceivableId,
        type: "OTHER",
        side: "CREDIT",
      },
    },
    update: { amount: interest },
    create: {
      companyId,
      branchId: data.branchId ?? undefined,
      type: "OTHER",
      side: "CREDIT",
      amount: interest,
      debitAccountId: contasAReceber.id,
      creditAccountId: receitaFinanceira.id,
      sourceType: "ARRenegotiation",
      sourceId: data.accountReceivableId,
      description: `Juros de renegociação AR #${data.accountReceivableId.substring(0, 8)}`,
      entryDate: data.entryDate ?? new Date(),
      cashDate: null, // competência — caixa entra quando a parcela for paga
    },
  });

  return entry.id;
}

/**
 * S5 (auditoria 2026-07-02): lança como RECEITA FINANCEIRA a multa/juros
 * recebidos DIRETAMENTE ao quitar um AR (fora de renegociação), via
 * receive-multiple. Antes só a renegociação lançava juros no ledger; o
 * pagamento direto com multa/juros criava o CashMovement pelo valor cheio, mas
 * o ledger só conhecia o principal (SALE_REVENUE) — o DRE subestimava a receita
 * financeira frente ao caixa real.
 *
 * Débito: Contas a Receber (1.1.03) / Crédito: Receita Financeira (3.1.03).
 * Regime de CAIXA: cashDate = data do recebimento (o dinheiro entrou agora).
 * Idempotente via @@unique — sourceType "ARInterestReceived" distinto do de
 * renegociação, para não colidir num AR que também foi renegociado.
 *
 * Retorna o id do lançamento, ou null se não houve multa/juros.
 */
export async function generateReceivableInterestEntry(
  tx: TransactionClient,
  data: {
    accountReceivableId: string;
    interestAndFine: number;
    branchId?: string | null;
    entryDate?: Date;
  },
  companyId: string
): Promise<string | null> {
  const amount = Math.round(data.interestAndFine * 100) / 100;
  if (amount <= 0) return null;

  const contasAReceber = await getChartAccountByCode(tx, companyId, "1.1.03");
  const receitaFinanceira = await ensureFinancialRevenueAccount(tx, companyId);
  const entryDate = data.entryDate ?? new Date();

  const entry = await tx.financeEntry.upsert({
    where: {
      companyId_sourceType_sourceId_type_side: {
        companyId,
        sourceType: "ARInterestReceived",
        sourceId: data.accountReceivableId,
        type: "OTHER",
        side: "CREDIT",
      },
    },
    update: { amount },
    create: {
      companyId,
      branchId: data.branchId ?? undefined,
      type: "OTHER",
      side: "CREDIT",
      amount,
      debitAccountId: contasAReceber.id,
      creditAccountId: receitaFinanceira.id,
      sourceType: "ARInterestReceived",
      sourceId: data.accountReceivableId,
      description: `Multa/juros recebidos AR #${data.accountReceivableId.substring(0, 8)}`,
      entryDate,
      cashDate: entryDate, // regime de caixa — o dinheiro entrou no recebimento
    },
  });

  return entry.id;
}

/**
 * Garante a conta de Deduções de Receita "Devoluções e Estornos" (3.2.01).
 * Existe no plano de contas padrão (finance-setup), mas empresas criadas antes
 * dessa conta entrar no setup podem não tê-la — upsert atômico evita quebrar o
 * estorno (e evita P2002 em estornos concorrentes na 1ª vez da empresa).
 */
async function ensureDeductionAccount(tx: TransactionClient, companyId: string) {
  const code = "3.2.01";
  const parent = await tx.chartOfAccounts.findUnique({
    where: { companyId_code: { companyId, code: "3.2" } },
  });
  return tx.chartOfAccounts.upsert({
    where: { companyId_code: { companyId, code } },
    update: {},
    create: {
      companyId,
      code,
      name: "Devoluções e Estornos",
      kind: "REVENUE",
      ...(parent ? { parentId: parent.id } : {}),
    },
  });
}

/**
 * Q8.2.1: lança o ESTORNO de uma conta a receber recebida no ledger.
 *
 * Quando um recebimento de AR é estornado, o caixa já é revertido
 * (reverseAccountReceivableCash), mas nenhum lançamento contábil era criado — o
 * estorno sumia do ledger. Aqui registramos a dedução de receita:
 *   Débito: Devoluções e Estornos (3.2.01)   ← reduz a receita
 *   Crédito: Contas a Receber (1.1.03)        ← a AR volta a ficar em aberto
 * Idempotente via @@unique(companyId, sourceType, sourceId, type, side).
 *
 * NOTA: o DRE atual soma sale.total e ainda NÃO lê o ledger (dívida H15), então
 * este lançamento mantém o ledger correto mas ainda não muda o DRE — corrigir o
 * DRE para somar FinanceEntry é a sprint separada "DRE sobre ledger".
 *
 * Retorna o id do lançamento, ou null se amount <= 0.
 */
export async function generateARReversalEntry(
  tx: TransactionClient,
  data: {
    accountReceivableId: string;
    amount: number;
    branchId?: string | null;
    entryDate?: Date;
  },
  companyId: string
): Promise<string | null> {
  const amount = Math.round(data.amount * 100) / 100;
  if (amount <= 0) return null;

  const contasAReceber = await getChartAccountByCode(tx, companyId, "1.1.03");
  const devolucoes = await ensureDeductionAccount(tx, companyId);

  const entry = await tx.financeEntry.upsert({
    where: {
      companyId_sourceType_sourceId_type_side: {
        companyId,
        sourceType: "ARReversal",
        sourceId: data.accountReceivableId,
        type: "REFUND",
        side: "DEBIT",
      },
    },
    update: { amount },
    create: {
      companyId,
      branchId: data.branchId ?? undefined,
      type: "REFUND",
      side: "DEBIT",
      amount,
      debitAccountId: devolucoes.id,
      creditAccountId: contasAReceber.id,
      sourceType: "ARReversal",
      sourceId: data.accountReceivableId,
      description: `Estorno de recebimento AR #${data.accountReceivableId.substring(0, 8)}`,
      entryDate: data.entryDate ?? new Date(),
      cashDate: data.entryDate ?? new Date(), // saída de caixa acompanha o estorno
    },
  });

  return entry.id;
}

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

// ============================================================
// LANÇAMENTO DE PAGAMENTO DE COMISSÃO (Bloco 4)
// ============================================================

/**
 * Lança a despesa de comissão no ledger QUANDO a comissão é PAGA (regime de
 * caixa). Sem este lançamento o DRE lia COMMISSION_EXPENSE = R$0 e o lucro
 * aparecia inflado (a comissão era calculada mas nunca virava despesa contábil).
 *
 * DÉBITO  5.1.02 "Comissões de Vendedores" (EXPENSE)  → vira despesa no DRE.
 * CRÉDITO 1.1.01 "Caixa" (ASSET)                       → saída real de dinheiro.
 *
 * IDEMPOTENTE: a chave única (companyId, sourceType, sourceId, type, side) +
 * upsert garante que pagar/reprocessar a MESMA comissão nunca duplica a despesa.
 * `sourceType="SellerCommission"` (motor novo, por vendedor/mês) + `sourceId`.
 *
 * NÃO lança nada se amount <= 0 (comissão zerada não vira despesa).
 */
export async function generateCommissionPaymentEntry(
  tx: TransactionClient,
  params: {
    companyId: string;
    branchId: string;
    commissionId: string;
    amount: number;
    paidAt: Date;
    sellerName?: string | null;
    /** Discrimina a origem no ledger: "CommissionPayment" (motor novo) ou
     *  "SellerCommission" (legado). Default novo. */
    sourceType?: "CommissionPayment" | "SellerCommission";
  }
): Promise<void> {
  const { companyId, branchId, commissionId, amount, paidAt, sellerName } = params;
  const sourceType = params.sourceType ?? "CommissionPayment";
  if (amount <= 0) return;

  // Idempotência: se a despesa deste pagamento JÁ existe, não relança nem
  // re-decrementa o caixa (evita inflar/deflar 2×). A chave única é a fonte.
  const existing = await tx.financeEntry.findUnique({
    where: {
      companyId_sourceType_sourceId_type_side: {
        companyId,
        sourceType,
        sourceId: commissionId,
        type: "COMMISSION_EXPENSE",
        side: "DEBIT",
      },
    },
    select: { id: true },
  });
  if (existing) return;

  const despesaComissao = await getChartAccountByCode(tx, companyId, "5.1.02");
  const caixa = await getChartAccountByCode(tx, companyId, "1.1.01");

  // Saída real de dinheiro: decrementa o saldo operacional do Caixa (FinanceAccount),
  // igual ao padrão de despesa manual. Sem isto, o Caixa PDV ficaria inflado.
  const caixaAccount = await getFinanceAccountByType(tx, companyId, "CASH");
  if (caixaAccount) {
    await tx.financeAccount.update({
      where: { id: caixaAccount.id },
      data: { balance: { decrement: amount } },
    });
  }

  await tx.financeEntry.create({
    data: {
      companyId,
      branchId,
      type: "COMMISSION_EXPENSE",
      side: "DEBIT",
      amount,
      debitAccountId: despesaComissao.id,
      creditAccountId: caixa.id,
      financeAccountId: caixaAccount?.id,
      sourceType,
      sourceId: commissionId,
      description: `Comissão paga${sellerName ? ` - ${sellerName}` : ""}`,
      entryDate: paidAt,
      cashDate: paidAt,
    },
  });
}
