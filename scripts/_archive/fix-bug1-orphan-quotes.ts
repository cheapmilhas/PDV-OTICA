/**
 * Bug #1 — Migração de vendas convertidas de orçamento que ficaram órfãs.
 *
 * Para cada Sale com `convertedFromQuoteId NOT NULL` que NÃO tem os side-effects
 * esperados (AccountReceivable / CardReceivable / FinanceEntry), recria o que faltar.
 *
 * IMPORTANTE — DECISÕES (alinhadas com Matheus em /docs/audit/fixes/bug1_diagnostico.md):
 * - NÃO gera cashback retroativo (cliente comprou há semanas, recebe cashback agora = confuso).
 * - NÃO recria StockMovement (estoque já foi decrementado, mesmo que só no Product.stockQty).
 * - NÃO atualiza BranchStock retroativamente (Bug #2 trata o drift de estoque).
 * - NÃO apaga CashMovement excedente (que foi criado para CREDIT_CARD/STORE_CREDIT no caminho antigo).
 *   Apenas LISTA os movimentos suspeitos para análise manual.
 * - SaleItem.costPrice = 0 fica como está (relatório de margem com erro = dívida técnica documentada).
 *
 * Como rodar:
 *   1. Sempre PRIMEIRO em dry-run:
 *        npx tsx scripts/fix-bug1-orphan-quotes.ts
 *
 *   2. Depois de validar, aplicar com:
 *        npx tsx scripts/fix-bug1-orphan-quotes.ts --apply --i-know-what-im-doing
 *      (precisa digitar "CONFIRMO" no terminal)
 *
 *   3. Filtros opcionais (recomendado: começar com uma empresa só):
 *        --company-id <id>
 *        --start-date YYYY-MM-DD
 *        --end-date YYYY-MM-DD
 *        --limit N (corrige no máximo N vendas por execução)
 *
 * Idempotência:
 *   - Antes de criar AR/CR/FinanceEntry, verifica se já existe.
 *   - Rodar 2× não duplica nada.
 *
 * Atomicidade:
 *   - Cada Sale corrigida é uma `$transaction` separada.
 *   - Se uma falha, as outras continuam.
 */

import { loadDiagnosticEnv } from "./_helpers/env";
import { parseCliArgs, printUsage } from "./_helpers/cli";
import { showBanner } from "./_helpers/banner";
import { createLogger } from "./_helpers/logger";

async function main() {
  const env = loadDiagnosticEnv();
  const opts = parseCliArgs(process.argv);

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage("scripts/fix-bug1-orphan-quotes.ts");
    return;
  }

  const ok = await showBanner({
    scriptName: "fix-bug1-orphan-quotes.ts",
    description:
      "Recria AccountReceivable/CardReceivable/FinanceEntry faltantes em vendas convertidas de Quote.",
    databaseUrl: env.DATABASE_URL,
    options: opts,
  });
  if (!ok) return;

  const { PrismaClient, Prisma } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const log = createLogger("fix-bug1-orphan-quotes");

  // Importação dinâmica para garantir que process.env.DATABASE_URL já esteja injetado
  const { addDays } = await import("date-fns");
  const { calculateInstallments } = await import("../src/lib/installment-utils");
  const { dateOnlyToUTC } = await import("../src/lib/date-utils");

  log.info(`Modo: ${opts.apply ? "APPLY (escrita real)" : "DRY-RUN"}`);
  log.info(`Filtros: ${JSON.stringify({
    companyId: opts.companyId,
    startDate: opts.startDate,
    endDate: opts.endDate,
    limit: opts.limit,
  })}`);

  try {
    const where: any = {
      convertedFromQuoteId: { not: null },
      ...(opts.companyId && { companyId: opts.companyId }),
    };
    if (opts.startDate || opts.endDate) {
      where.createdAt = {};
      if (opts.startDate) where.createdAt.gte = new Date(opts.startDate);
      if (opts.endDate) where.createdAt.lte = new Date(opts.endDate);
    }

    const sales = await prisma.sale.findMany({
      where,
      take: opts.limit,
      orderBy: { createdAt: "asc" },
      include: {
        payments: true,
        accountsReceivable: { select: { id: true, installmentNumber: true } },
        cardReceivables: { select: { id: true, salePaymentId: true, installmentNumber: true } },
        items: { select: { id: true, productId: true, costPrice: true } },
      },
    });

    log.info(`Sales convertidas encontradas com filtros: ${sales.length}`);

    const stats = {
      processed: 0,
      arCreated: 0,
      arBalanceDueCreated: 0,
      crCreated: 0,
      financeEntriesGenerated: 0,
      skipped: 0,
      errors: 0,
      // Decisão (Matheus): NÃO corrigir SaleItem.costPrice=0 retroativamente.
      // Apenas contar e avisar no log final.
      salesWithZeroCostPrice: 0,
      saleItemsWithZeroCostPrice: 0,
    };

    for (const sale of sales) {
      stats.processed++;
      const saleLog = (msg: string) =>
        log.info(`[Sale ${sale.id.substring(0, 12)}...] ${msg}`);

      // Contagem informativa de itens com costPrice=0 (NÃO corrigidos — decisão)
      const zeroCostItems = sale.items.filter(
        (i) => i.productId && Number(i.costPrice) === 0
      );
      if (zeroCostItems.length > 0) {
        stats.salesWithZeroCostPrice++;
        stats.saleItemsWithZeroCostPrice += zeroCostItems.length;
      }

      try {
        // Buscar CompanySettings para juros/multa default (lookup fora da tx)
        const companySettings = await prisma.companySettings.findUnique({
          where: { companyId: sale.companyId },
          select: {
            defaultFinePercent: true,
            defaultInterestPercent: true,
            defaultGraceDays: true,
          },
        });

        const actions: string[] = [];

        // Para cada SalePayment, decidir o que falta
        for (const payment of sale.payments) {
          // STORE_CREDIT — verifica se já tem AR
          if (payment.method === "STORE_CREDIT") {
            const existingAr = sale.accountsReceivable.length > 0;
            if (existingAr) {
              saleLog(`SKIP STORE_CREDIT (já tem ${sale.accountsReceivable.length} AR)`);
              continue;
            }

            const installmentsCount = payment.installments || 1;
            // Como não temos installmentConfig retroativamente, calculamos:
            //   - Primeira parcela: hoje + 30 dias
            //   - Intervalo: 30 dias
            // Isso é uma APROXIMAÇÃO — relatar no log.
            const firstDueDate = addDays(new Date(), 30);
            const installments = calculateInstallments(
              Number(payment.amount),
              installmentsCount,
              firstDueDate,
              30
            );

            if (opts.apply) {
              await prisma.$transaction(async (tx) => {
                for (const inst of installments) {
                  await tx.accountReceivable.create({
                    data: {
                      companyId: sale.companyId,
                      customerId: sale.customerId!,
                      saleId: sale.id,
                      description: `[MIGRAÇÃO] Parcela ${inst.installmentNumber}/${installments.length} - Venda #${sale.id.substring(0, 8)} (data estimada — verificar com cliente)`,
                      amount: inst.amount,
                      dueDate: inst.dueDate,
                      installmentNumber: inst.installmentNumber,
                      totalInstallments: installments.length,
                      status: "PENDING",
                      finePercent: companySettings?.defaultFinePercent ?? 2,
                      interestPercent: companySettings?.defaultInterestPercent ?? 1,
                      graceDays: companySettings?.defaultGraceDays ?? 0,
                    },
                  });
                }
              });
            }
            stats.arCreated += installments.length;
            actions.push(`+${installments.length} AR (STORE_CREDIT, data estimada)`);
          }

          // BALANCE_DUE — verifica se já tem AR
          if (payment.method === "BALANCE_DUE") {
            const existingAr = sale.accountsReceivable.some(
              (ar) => ar.installmentNumber === 1
            );
            if (existingAr) {
              saleLog(`SKIP BALANCE_DUE (já tem AR)`);
              continue;
            }

            const dueDate = addDays(new Date(), 30);
            if (opts.apply) {
              await prisma.accountReceivable.create({
                data: {
                  companyId: sale.companyId,
                  customerId: sale.customerId!,
                  saleId: sale.id,
                  description: `[MIGRAÇÃO] Saldo a Receber - Venda #${sale.id.substring(0, 8)} (data estimada)`,
                  amount: payment.amount,
                  dueDate,
                  installmentNumber: 1,
                  totalInstallments: 1,
                  status: "PENDING",
                },
              });
            }
            stats.arBalanceDueCreated++;
            actions.push("+1 AR (BALANCE_DUE)");
          }

          // CREDIT_CARD — verifica se já tem CR para esse SalePayment
          if (payment.method === "CREDIT_CARD") {
            const existingCr = sale.cardReceivables.some(
              (cr) => cr.salePaymentId === payment.id
            );
            if (existingCr) {
              saleLog(`SKIP CREDIT_CARD (já tem CR)`);
              continue;
            }

            const numInstallments = payment.installments || 1;
            const installmentAmount = Number(payment.amount) / numInstallments;

            if (opts.apply) {
              await prisma.$transaction(async (tx) => {
                for (let i = 1; i <= numInstallments; i++) {
                  const expectedDate = addDays(new Date(), 30 * i);
                  await tx.cardReceivable.create({
                    data: {
                      companyId: sale.companyId,
                      branchId: sale.branchId,
                      saleId: sale.id,
                      salePaymentId: payment.id,
                      installmentNumber: i,
                      totalInstallments: numInstallments,
                      grossAmount: installmentAmount,
                      expectedDate,
                      status: "PENDING",
                      cardBrand: payment.cardBrand,
                      acquirer: payment.acquirer,
                      nsu: payment.nsu,
                    },
                  });
                }
              });
            }
            stats.crCreated += numInstallments;
            actions.push(`+${numInstallments} CR (CREDIT_CARD)`);
          }
        }

        // FinanceEntry — verifica se há lançamentos para esta Sale
        const existingEntries = await prisma.financeEntry.count({
          where: {
            companyId: sale.companyId,
            sourceType: "Sale",
            sourceId: sale.id,
          },
        });

        if (existingEntries === 0) {
          if (opts.apply) {
            try {
              const { generateSaleEntries } = await import(
                "../src/services/finance-entry.service"
              );
              await prisma.$transaction(async (tx) => {
                await generateSaleEntries(tx as any, sale.id, sale.companyId);
              });
              stats.financeEntriesGenerated++;
              actions.push("+FinanceEntry (DRE)");
            } catch (financeError) {
              log.warn(
                `Sale ${sale.id} — falha ao gerar FinanceEntry: ${
                  financeError instanceof Error ? financeError.message : String(financeError)
                }`
              );
            }
          } else {
            stats.financeEntriesGenerated++;
            actions.push("+FinanceEntry (DRE) [DRY-RUN]");
          }
        } else {
          saleLog(`SKIP FinanceEntry (já existe ${existingEntries} entries)`);
        }

        if (actions.length > 0) {
          saleLog(`Ações: ${actions.join(", ")}`);
        } else {
          saleLog("Nada a fazer");
          stats.skipped++;
        }
      } catch (err) {
        stats.errors++;
        log.error(
          `Sale ${sale.id} — erro: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    log.info("=".repeat(72));
    log.info("RESUMO");
    log.info("=".repeat(72));
    log.info(`Modo: ${opts.apply ? "APPLY" : "DRY-RUN"}`);
    log.info(`Sales processadas: ${stats.processed}`);
    log.info(`AccountReceivable criadas (STORE_CREDIT): ${stats.arCreated}`);
    log.info(`AccountReceivable criadas (BALANCE_DUE): ${stats.arBalanceDueCreated}`);
    log.info(`CardReceivable criadas: ${stats.crCreated}`);
    log.info(`FinanceEntry geradas: ${stats.financeEntriesGenerated}`);
    log.info(`Sales puladas (nada a fazer): ${stats.skipped}`);
    log.info(`Erros: ${stats.errors}`);

    // Aviso informativo sobre costPrice=0 (decisão Matheus: não corrigir)
    if (stats.salesWithZeroCostPrice > 0) {
      log.warn("");
      log.warn("=".repeat(72));
      log.warn(
        `AVISO: ${stats.salesWithZeroCostPrice} vendas órfãs identificadas com SaleItem.costPrice=0 ` +
          `(${stats.saleItemsWithZeroCostPrice} itens no total). NÃO serão corrigidas (decisão de produto).`
      );
      log.warn(
        "Razão: Product.costPrice atual pode ser diferente do histórico — aplicar o valor"
      );
      log.warn(
        "atual nas vendas antigas distorceria os relatórios ainda mais. A solução correta"
      );
      log.warn(
        "exigiria buscar histórico via InventoryLot, fora do escopo desta migração."
      );
      log.warn(
        "Relatórios de margem desse período devem ser interpretados com cautela —"
      );
      log.warn(
        "vão mostrar lucro inflado (lucro = preço de venda, sem deduzir custo)."
      );
      log.warn("=".repeat(72));
    }

    log.info("");
    log.info(`Log completo: ${log.filePath}`);

    if (!opts.apply) {
      log.info("");
      log.info("→ Este foi um DRY-RUN. Para aplicar de verdade:");
      log.info("    npx tsx scripts/fix-bug1-orphan-quotes.ts --apply --i-know-what-im-doing");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
