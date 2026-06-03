/**
 * Side-effects compartilhados de criação de venda.
 *
 * Estas funções são chamadas tanto por `sale.service.ts:create` (PDV direto)
 * quanto por `quote.service.ts:convertToSale` (conversão de orçamento).
 *
 * Antes desta extração, cada um tinha sua própria implementação parcial,
 * causando o Bug #1 (vendas convertidas não geravam AccountReceivable,
 * CardReceivable, cashback, etc.).
 *
 * Estrutura:
 * - Funções com sufixo `InTx` recebem `tx` (TransactionClient) e devem ser
 *   chamadas dentro de uma `prisma.$transaction`.
 * - Funções com sufixo `AfterTx` rodam fora da transação (depois do commit).
 */

import { Prisma, type PaymentMethod, type Sale, type SalePayment } from "@prisma/client";
import { addDays } from "date-fns";
import { calculateInstallments } from "@/lib/installment-utils";
import { dateOnlyToUTC } from "@/lib/date-utils";
import { saleDisplayNumber } from "@/lib/sale-number";
import { METHODS_IN_CASH } from "@/lib/payment-methods";
import { atomicStockDebit } from "@/services/stock.service";
import { cashbackService } from "@/services/cashback.service";
import { processaSaleForCampaigns } from "@/services/product-campaign.service";
import { AppError, ERROR_CODES } from "@/lib/error-handler";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "sale-side-effects" });

// ============================================================================
// Tipos compartilhados
// ============================================================================

export interface SaleItemInput {
  productId: string | null | undefined;
  qty: number;
  unitPrice: number;
  discount?: number;
}

export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  installments?: number;
  installmentConfig?: {
    count: number;
    firstDueDate: string;
    interval?: number;
  };
  cardBrand?: string;
  cardLastDigits?: string;
  nsu?: string;
  authorizationCode?: string;
  acquirer?: string;
}

export interface CompanyDefaults {
  defaultFinePercent: Prisma.Decimal | number | null;
  defaultInterestPercent: Prisma.Decimal | number | null;
  defaultGraceDays: number | null;
}

export type Tx = Prisma.TransactionClient;

// ============================================================================
// Stock — debit + StockMovement
// ============================================================================

/**
 * Debita estoque atomicamente para cada item da venda e registra StockMovement.
 *
 * Usa `atomicStockDebit` (race-safe via `UPDATE WHERE quantity >= solicitado`).
 * Atualiza tanto BranchStock (verdade por filial) quanto Product.stockQty (cache).
 *
 * Lança AppError se algum produto não tem estoque.
 */
export async function applyStockDebitInTx(
  tx: Tx,
  params: {
    sale: Pick<Sale, "id" | "branchId" | "companyId">;
    items: Array<{ productId: string | null | undefined; qty: number }>;
    userId: string;
    // G1: gerente autorizou venda sem estoque → permite débito negativo.
    allowNegative?: boolean;
  }
): Promise<void> {
  const { sale, items, userId, allowNegative = false } = params;

  for (const item of items) {
    if (!item.productId) continue;

    const stockResult = await atomicStockDebit(
      item.productId,
      item.qty,
      sale.companyId,
      tx,
      sale.branchId,
      allowNegative
    );

    if (!stockResult.success) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        stockResult.error || "Estoque insuficiente",
        400
      );
    }

    // Registrar movimentação de saída (auditoria)
    await tx.stockMovement.create({
      data: {
        companyId: sale.companyId,
        branchId: sale.branchId,
        productId: item.productId,
        type: "SALE",
        quantity: -item.qty,
        createdByUserId: userId,
        notes: `Saída por venda #${sale.id.substring(0, 8)}`,
      },
    });
  }
}

// ============================================================================
// Payments — SalePayment + auto-fee + CashMovement filtrado + AR + CR
// ============================================================================

export interface ApplyPaymentsResult {
  payments: SalePayment[];
}

/**
 * Para cada PaymentInput:
 *   1. Cria SalePayment (status RECEIVED)
 *   2. Auto-calcula fee de cartão (CREDIT/DEBIT) — falha não bloqueia
 *   3. Cria CashMovement APENAS para METHODS_IN_CASH (CASH/PIX/DEBIT_CARD)
 *   4. Cria AccountReceivable (N parcelas) para STORE_CREDIT
 *   5. Cria AccountReceivable (1 parcela em +30 dias) para BALANCE_DUE
 *   6. Cria CardReceivable (N parcelas) para CREDIT_CARD
 *
 * Caller é responsável por validar:
 *   - STORE_CREDIT/BALANCE_DUE exigem customerId
 *   - validateCreditLimit (caller decide quando)
 */
export async function applyPaymentsInTx(
  tx: Tx,
  params: {
    sale: Pick<Sale, "id" | "branchId" | "companyId" | "number">;
    payments: PaymentInput[];
    userId: string;
    openShiftId: string;
    customerId: string | null | undefined;
    companySettings: CompanyDefaults | null;
    note?: string; // Nota a anexar nos CashMovements (ex: "convertida de orçamento #abc")
  }
): Promise<ApplyPaymentsResult> {
  const { sale, payments, userId, openShiftId, customerId, companySettings, note } = params;
  const created: SalePayment[] = [];

  for (const payment of payments) {
    const installmentsCount =
      payment.installmentConfig?.count || payment.installments || 1;

    // 1. Cria SalePayment
    const salePayment = await tx.salePayment.create({
      data: {
        saleId: sale.id,
        method: payment.method,
        amount: payment.amount,
        installments: installmentsCount,
        status: "RECEIVED",
        receivedAt: new Date(),
        receivedByUserId: userId,
        ...(payment.cardBrand && { cardBrand: payment.cardBrand }),
        ...(payment.cardLastDigits && { cardLastDigits: payment.cardLastDigits }),
        ...(payment.nsu && { nsu: payment.nsu }),
        ...(payment.authorizationCode && { authorizationCode: payment.authorizationCode }),
        ...(payment.acquirer && { acquirer: payment.acquirer }),
      },
    });
    created.push(salePayment);

    // 2. Auto-fee para cartões (não bloqueia se falhar)
    if (
      (payment.method === "CREDIT_CARD" || payment.method === "DEBIT_CARD") &&
      !salePayment.feeAmount
    ) {
      try {
        const { calculateCardFee } = await import("@/services/card-fee.service");
        const feeResult = await calculateCardFee(
          sale.companyId,
          payment.cardBrand || "VISA",
          payment.method === "CREDIT_CARD" ? "CREDIT" : "DEBIT",
          installmentsCount,
          Number(payment.amount)
        );
        if (feeResult) {
          await tx.salePayment.update({
            where: { id: salePayment.id },
            data: {
              feePercent: feeResult.feePercent,
              feeAmount: feeResult.feeAmount,
              netAmount: feeResult.netAmount,
              settlementDate: feeResult.settlementDate,
            },
          });
        }
      } catch (feeError) {
        // Não bloqueia a venda — fee é informativo
        log.warn("card_fee_auto_calc_failed", {
          saleId: sale.id,
          salePaymentId: salePayment.id,
          method: payment.method,
          error: feeError instanceof Error ? feeError.message : String(feeError),
        });
      }
    }

    // 3. CashMovement APENAS para métodos in-cash
    if ((METHODS_IN_CASH as readonly string[]).includes(payment.method)) {
      await tx.cashMovement.create({
        data: {
          cashShiftId: openShiftId,
          branchId: sale.branchId,
          type: "SALE_PAYMENT",
          direction: "IN",
          method: payment.method,
          amount: payment.amount,
          originType: "SALE_PAYMENT",
          originId: salePayment.id,
          salePaymentId: salePayment.id,
          createdByUserId: userId,
          note: note || `Venda ${saleDisplayNumber(sale)}`,
        },
      });
    }

    // 4. AccountReceivable para STORE_CREDIT
    if (payment.method === "STORE_CREDIT" && payment.installmentConfig && customerId) {
      const installments = calculateInstallments(
        payment.amount,
        payment.installmentConfig.count,
        dateOnlyToUTC(payment.installmentConfig.firstDueDate),
        payment.installmentConfig.interval
      );

      for (const inst of installments) {
        await tx.accountReceivable.create({
          data: {
            companyId: sale.companyId,
            customerId,
            saleId: sale.id,
            description: `Parcela ${inst.installmentNumber}/${installments.length} - Venda ${saleDisplayNumber(sale)}`,
            amount: inst.amount,
            dueDate: inst.dueDate,
            installmentNumber: inst.installmentNumber,
            totalInstallments: installments.length,
            status: "PENDING",
            createdByUserId: userId,
            finePercent: companySettings?.defaultFinePercent ?? 2,
            interestPercent: companySettings?.defaultInterestPercent ?? 1,
            graceDays: companySettings?.defaultGraceDays ?? 0,
          },
        });
      }
    }

    // 5. AccountReceivable para BALANCE_DUE (+30 dias, 1 parcela)
    if (payment.method === "BALANCE_DUE" && customerId) {
      const dueDate = addDays(new Date(), 30);
      await tx.accountReceivable.create({
        data: {
          companyId: sale.companyId,
          customerId,
          saleId: sale.id,
          description: `Saldo a Receber - Venda ${saleDisplayNumber(sale)} - Pagamento na entrega`,
          amount: payment.amount,
          dueDate,
          installmentNumber: 1,
          totalInstallments: 1,
          status: "PENDING",
          createdByUserId: userId,
        },
      });
    }

    // 6. CardReceivable para CREDIT_CARD (N parcelas, +30*i dias cada)
    if (payment.method === "CREDIT_CARD") {
      const numInstallments = installmentsCount;
      const installmentAmount = Number(payment.amount) / numInstallments;

      for (let i = 1; i <= numInstallments; i++) {
        const expectedDate = addDays(new Date(), 30 * i);
        await tx.cardReceivable.create({
          data: {
            companyId: sale.companyId,
            branchId: sale.branchId,
            saleId: sale.id,
            salePaymentId: salePayment.id,
            installmentNumber: i,
            totalInstallments: numInstallments,
            grossAmount: installmentAmount,
            expectedDate,
            status: "PENDING",
            cardBrand: payment.cardBrand || null,
            acquirer: payment.acquirer || null,
            nsu: payment.nsu || null,
          },
        });
      }
    }
  }

  return { payments: created };
}

// ============================================================================
// Cashback — debit (uso na venda)
// ============================================================================

/**
 * Debita cashback usado na venda.
 * Caller deve já ter validado que o cliente tem saldo suficiente.
 */
export async function applyCashbackUsageInTx(
  tx: Tx,
  params: {
    sale: Pick<Sale, "id" | "branchId">;
    customerId: string;
    cashbackUsed: number;
    userId: string;
  }
): Promise<void> {
  const { sale, customerId, cashbackUsed, userId } = params;

  if (cashbackUsed <= 0) return;

  // Q7.1 P1-5: race fix — antes era update direto (sem validar balance),
  // permitindo balance negativo se 2 vendas paralelas usassem o mesmo
  // saldo. updateMany conditional WHERE balance >= cashbackUsed garante
  // que só uma das duas TX vence; a outra throw aborta a venda inteira.
  const updateResult = await tx.customerCashback.updateMany({
    where: {
      customerId,
      branchId: sale.branchId,
      balance: { gte: cashbackUsed },
    },
    data: {
      balance: { decrement: cashbackUsed },
      totalUsed: { increment: cashbackUsed },
    },
  });

  if (updateResult.count === 0) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      `Saldo de cashback insuficiente ou alterado por outra operação. Recarregue o carrinho.`,
      409,
    );
  }

  // Re-fetch pra pegar o id do CustomerCashback (updateMany não retorna).
  const customerCashback = await tx.customerCashback.findUniqueOrThrow({
    where: {
      customerId_branchId: { customerId, branchId: sale.branchId },
    },
    select: { id: true },
  });

  await tx.cashbackMovement.create({
    data: {
      customerCashbackId: customerCashback.id,
      type: "DEBIT",
      amount: cashbackUsed,
      saleId: sale.id,
      description: `Cashback usado na venda #${sale.id.substring(0, 8)}`,
      createdByUserId: userId,
    },
  });
}

// Prefixos das descrições dos movimentos de ESTORNO (idempotência: se já
// existe um movimento com este prefixo para a venda, não estorna de novo).
const CASHBACK_REVERSAL_EARNED_PREFIX = "Estorno cashback ganho";
const CASHBACK_REVERSAL_USED_PREFIX = "Devolução cashback usado";

/**
 * Estorna, de forma IDEMPOTENTE e DENTRO da transação, TODO o cashback de uma
 * venda cancelada/devolvida:
 *  - GANHO: reverte o CREDIT original (balance − , totalEarned −) + DEBIT de estorno.
 *  - USADO: devolve ao cliente (balance + , totalUsed −) + CREDIT de devolução.
 *
 * B2/B3 (Grupo B): antes o cancel só estornava o ganho, fora de transação e
 * sem idempotência — cancel→reativar→cancel duplicava o estorno (saldo
 * negativo) e o cashback USADO nunca voltava pro cliente. Agora é tx + guard.
 *
 * A idempotência usa a existência de um cashbackMovement de estorno (por
 * saleId + prefixo da descrição) como marca de "já estornado".
 */
export async function reverseCashbackForSaleInTx(
  tx: Tx,
  params: { saleId: string; cashbackUsed: number },
): Promise<void> {
  const { saleId, cashbackUsed } = params;

  // 1. Estornar o cashback GANHO (CREDIT original da venda).
  const earned = await tx.cashbackMovement.findFirst({
    where: { saleId, type: "CREDIT", description: { not: { startsWith: CASHBACK_REVERSAL_USED_PREFIX } } },
    orderBy: { createdAt: "asc" },
  });
  if (earned) {
    const alreadyReversedEarned = await tx.cashbackMovement.findFirst({
      where: { saleId, type: "DEBIT", description: { startsWith: CASHBACK_REVERSAL_EARNED_PREFIX } },
    });
    if (!alreadyReversedEarned) {
      const amount = Number(earned.amount);
      await tx.customerCashback.update({
        where: { id: earned.customerCashbackId },
        data: {
          balance: { decrement: amount },
          totalEarned: { decrement: amount },
        },
      });
      await tx.cashbackMovement.create({
        data: {
          customerCashbackId: earned.customerCashbackId,
          type: "DEBIT",
          amount,
          saleId,
          description: `${CASHBACK_REVERSAL_EARNED_PREFIX} - venda #${saleId.slice(-8)}`,
        },
      });
    }
  }

  // 2. Devolver o cashback USADO ao cliente (reverte o DEBIT de uso da venda).
  if (cashbackUsed > 0) {
    const used = await tx.cashbackMovement.findFirst({
      where: { saleId, type: "DEBIT", description: { startsWith: "Cashback usado" } },
      orderBy: { createdAt: "asc" },
    });
    if (used) {
      const alreadyReturnedUsed = await tx.cashbackMovement.findFirst({
        where: { saleId, type: "CREDIT", description: { startsWith: CASHBACK_REVERSAL_USED_PREFIX } },
      });
      if (!alreadyReturnedUsed) {
        // Usa o valor REAL do movimento de uso (não o param cashbackUsed) —
        // se sale.cashbackUsed divergir do que foi efetivamente debitado,
        // reverter pelo param deixaria balance/totalUsed inconsistentes.
        const usedAmount = Number(used.amount);
        await tx.customerCashback.update({
          where: { id: used.customerCashbackId },
          data: {
            balance: { increment: usedAmount },
            totalUsed: { decrement: usedAmount },
          },
        });
        await tx.cashbackMovement.create({
          data: {
            customerCashbackId: used.customerCashbackId,
            type: "CREDIT",
            amount: usedAmount,
            saleId,
            description: `${CASHBACK_REVERSAL_USED_PREFIX} - venda #${saleId.slice(-8)}`,
          },
        });
      }
    }
  }
}

// ============================================================================
// Commission
// ============================================================================

/**
 * Calcula e cria Commission do vendedor.
 * Base de cálculo: Sale.total. Percentual: User.defaultCommissionPercent ou 5%.
 *
 * NOTA: Não consulta CommissionRule (modelo no schema mas não usado em runtime hoje).
 * Manter comportamento idêntico ao atual em sale.service e quote.service para evitar
 * regressão. Ver `/docs/audit/mapping/09_estoque_multifilial.md` J9.
 */
export async function applyCommissionInTx(
  tx: Tx,
  params: {
    sale: Pick<Sale, "id" | "companyId" | "total">;
    sellerUserId: string;
  }
): Promise<void> {
  const { sale, sellerUserId } = params;

  const seller = await tx.user.findUnique({
    where: { id: sellerUserId },
    select: { defaultCommissionPercent: true },
  });

  const commissionPercent = seller?.defaultCommissionPercent || new Prisma.Decimal(5);
  const baseAmount = sale.total;
  const commissionAmount = new Prisma.Decimal(baseAmount.toString())
    .mul(commissionPercent)
    .div(100);

  await tx.commission.create({
    data: {
      companyId: sale.companyId,
      saleId: sale.id,
      userId: sellerUserId,
      baseAmount,
      percentage: commissionPercent,
      commissionAmount,
      status: "PENDING",
      periodMonth: new Date().getMonth() + 1,
      periodYear: new Date().getFullYear(),
    },
  });
}

/**
 * Reverte comissões de uma venda cancelada (Q4.1).
 *
 * Regras:
 * - PENDING/APPROVED → marca como CANCELED (ainda não pagou ninguém).
 * - PAID → mantém status PAID e cria lançamento negativo de compensação no
 *   período atual; vendedor já recebeu, então debita do próximo fechamento.
 * - CANCELED → ignora (já tratado em cancelamento anterior).
 *
 * Retorna contadores para o caller logar/auditar.
 */
export async function reverseCommissionForSaleInTx(
  tx: Tx,
  params: { saleId: string; companyId: string },
): Promise<{ reversed: number; compensated: number }> {
  const { saleId, companyId } = params;

  const commissions = await tx.commission.findMany({
    where: { saleId, companyId },
  });

  let reversed = 0;
  let compensated = 0;
  const now = new Date();

  for (const c of commissions) {
    if (c.status === "PENDING" || c.status === "APPROVED") {
      await tx.commission.update({
        where: { id: c.id },
        data: { status: "CANCELED" },
      });
      reversed++;
    } else if (c.status === "PAID") {
      // Não desfaz pagamento histórico — gera lançamento negativo no período corrente.
      await tx.commission.create({
        data: {
          companyId,
          saleId,
          userId: c.userId,
          baseAmount: new Prisma.Decimal(0).minus(c.baseAmount),
          percentage: c.percentage,
          commissionAmount: new Prisma.Decimal(0).minus(c.commissionAmount),
          status: "PENDING",
          periodMonth: now.getMonth() + 1,
          periodYear: now.getFullYear(),
          notes: `Estorno de comissão paga (Sale ${saleId.slice(-8)} cancelada)`,
        },
      });
      compensated++;
    }
  }

  return { reversed, compensated };
}

// ============================================================================
// Finance entries (DRE)
// ============================================================================

/**
 * Gera FinanceEntry da venda.
 *
 * Comportamento de erro: NÃO bloqueia a transação (decisão documentada — ver
 * comentário no caller). Mas LOGA estruturadamente para Sentry/Vercel pickup,
 * em vez de silently swallow.
 *
 * Q7.1 P1-10: além de logar, agora também enfileira retry assíncrono via
 * FinanceEntryRetry. Cron /api/cron/retry-finance-entries reprocessa
 * pendentes com backoff exponencial (max 5 tentativas).
 */
export async function applyFinanceEntriesInTx(
  tx: Tx,
  params: {
    saleId: string;
    companyId: string;
  }
): Promise<void> {
  const { saleId, companyId } = params;
  try {
    const { generateSaleEntries } = await import("@/services/finance-entry.service");
    await generateSaleEntries(tx, saleId, companyId);
  } catch (financeError) {
    const errorMessage =
      financeError instanceof Error ? financeError.message : String(financeError);
    const errorStack =
      financeError instanceof Error ? financeError.stack : undefined;

    log.error("finance_entries_generation_failed", {
      saleId,
      companyId,
      error: errorMessage,
      stack: errorStack,
    });

    // Q7.1 P1-10: enfileira retry. Fora do tx atual (que pode rollback) —
    // usa prisma global garantindo persistência mesmo se a TX da venda
    // falhar depois. upsert por saleId (unique) evita duplicar retry se
    // a venda for re-processada.
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.financeEntryRetry.upsert({
        where: { saleId },
        create: {
          companyId,
          saleId,
          attempt: 0,
          status: "PENDING",
          lastError: errorMessage,
          nextRetryAt: new Date(Date.now() + 5 * 60 * 1000), // 5min depois
        },
        update: {
          status: "PENDING",
          attempt: { increment: 0 }, // mantém attempt; cron incrementa ao processar
          lastError: errorMessage,
          nextRetryAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
    } catch (retryEnqueueError) {
      // Se nem o retry conseguir enfileirar, o log acima já cobriu.
      log.error("finance_entry_retry_enqueue_failed", {
        saleId,
        companyId,
        error:
          retryEnqueueError instanceof Error
            ? retryEnqueueError.message
            : String(retryEnqueueError),
      });
    }
    // NÃO throw — comportamento documentado: venda completa, DRE será corrigido pelo cron.
  }
}

// ============================================================================
// Side-effects pós-transação
// ============================================================================

/**
 * Aplica todos os side-effects após o commit da venda.
 * Cada um falha silenciosamente (com log estruturado) para não afetar a venda.
 *
 * Nota: este conjunto é IDÊNTICO em sale.create e (agora) em quote.convertToSale.
 */
export async function applyPostCommitSideEffects(params: {
  saleId: string;
  customerId: string | null | undefined;
  branchId: string;
  companyId: string;
  total: number;
  /**
   * Se true, NÃO chama earnCashback. Usado pela conversão de orçamento — decisão
   * de produto: vendas convertidas não geram cashback retroativo (ver
   * /docs/audit/fixes/bug1_diagnostico.md decisão (a) de Matheus).
   *
   * Para conversão NOVA (após este fix), deve ser `false` para gerar cashback
   * normalmente. Para script de migração de vendas órfãs antigas, deve ser `true`.
   */
  skipCashbackEarn?: boolean;
}): Promise<void> {
  const { saleId, customerId, branchId, companyId, total, skipCashbackEarn } = params;

  // Cashback ganho
  if (customerId && !skipCashbackEarn) {
    try {
      await cashbackService.earnCashback(customerId, saleId, total, branchId, companyId);
    } catch (cashbackError) {
      log.warn("cashback_earn_failed", {
        saleId,
        customerId,
        error: cashbackError instanceof Error ? cashbackError.message : String(cashbackError),
      });
    }
  }

  // Campanhas
  try {
    await processaSaleForCampaigns(saleId, companyId);
  } catch (campaignError) {
    log.warn("process_campaigns_failed", {
      saleId,
      error: campaignError instanceof Error ? campaignError.message : String(campaignError),
    });
  }

  // Lembrete pós-venda (POST_SALE_30_DAYS)
  if (customerId) {
    try {
      await applyPostSaleReminder({ saleId, customerId, companyId, total });
    } catch (reminderError) {
      log.warn("post_sale_reminder_failed", {
        saleId,
        customerId,
        error: reminderError instanceof Error ? reminderError.message : String(reminderError),
      });
    }
  }
}

/**
 * Cria CustomerReminder POST_SALE_30_DAYS se ainda não existir um pendente
 * para o cliente.
 */
async function applyPostSaleReminder(params: {
  saleId: string;
  customerId: string;
  companyId: string;
  total: number;
}): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const { saleId, customerId, companyId, total } = params;

  const saleItems = await prisma.saleItem.findMany({
    where: { saleId },
    include: { product: { select: { name: true } } },
    take: 1,
  });

  const productName = saleItems[0]?.product?.name || undefined;

  const existingReminder = await prisma.customerReminder.findFirst({
    where: {
      companyId,
      customerId,
      segment: "POST_SALE_30_DAYS",
      status: { in: ["PENDING", "IN_PROGRESS", "SCHEDULED"] },
    },
  });

  if (existingReminder) return;

  await prisma.customerReminder.create({
    data: {
      companyId,
      customerId,
      segment: "POST_SALE_30_DAYS",
      priority: 80,
      lastPurchaseDate: new Date(),
      lastPurchaseAmount: total,
      lastPurchaseProduct: productName,
      daysSinceLastPurchase: 0,
      totalPurchases: 1,
      totalSpent: total,
      status: "PENDING",
      scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}
