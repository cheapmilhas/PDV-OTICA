/**
 * Diagnóstico Bug #1 — Vendas convertidas de orçamento que ficaram órfãs.
 *
 * READ-ONLY. Não escreve nada no banco. Apenas conta e lista.
 *
 * Como rodar:
 *   1. Copie .env.diagnostic.example para .env.diagnostic e preencha DATABASE_URL
 *   2. npx tsx scripts/diagnose-bug1-orphan-quotes.ts [--company-id <id>] [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD]
 *
 * Saída: imprime no console + grava em scripts/logs/diagnose-bug1-<timestamp>.log
 */

import { loadDiagnosticEnv } from "./_helpers/env";
import { parseCliArgs, printUsage } from "./_helpers/cli";
import { showBanner } from "./_helpers/banner";
import { createLogger } from "./_helpers/logger";

async function main() {
  const env = loadDiagnosticEnv();
  const opts = parseCliArgs(process.argv);

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage("scripts/diagnose-bug1-orphan-quotes.ts");
    return;
  }

  const ok = await showBanner({
    scriptName: "diagnose-bug1-orphan-quotes.ts",
    description: "Lista Sales convertidas de Quote que ficaram financeiramente órfãs (sem AR/CR).",
    databaseUrl: env.DATABASE_URL,
    options: opts,
    isReadOnly: true,
  });
  if (!ok) return;

  // Importa Prisma DEPOIS de carregar o env (para usar DATABASE_URL correto)
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const log = createLogger("diagnose-bug1-orphan-quotes");

  try {
    log.info(`Iniciando diagnóstico. Filtros: ${JSON.stringify({
      companyId: opts.companyId,
      startDate: opts.startDate,
      endDate: opts.endDate,
    })}`);

    // Filtros base
    const where: any = {
      convertedFromQuoteId: { not: null },
      ...(opts.companyId && { companyId: opts.companyId }),
    };
    if (opts.startDate || opts.endDate) {
      where.createdAt = {};
      if (opts.startDate) where.createdAt.gte = new Date(opts.startDate);
      if (opts.endDate) where.createdAt.lte = new Date(opts.endDate);
    }

    // 1. Total de Sales convertidas de Quote
    const totalConverted = await prisma.sale.count({ where });
    log.info(`Total de Sales convertidas de Quote (com filtros): ${totalConverted}`);

    if (totalConverted === 0) {
      log.info("Nenhuma venda convertida encontrada com os filtros. Encerrando.");
      return;
    }

    // 2. Sales convertidas
    const sales = await prisma.sale.findMany({
      where,
      select: {
        id: true,
        companyId: true,
        branchId: true,
        customerId: true,
        total: true,
        createdAt: true,
        convertedFromQuoteId: true,
        company: { select: { name: true, tradeName: true } },
        payments: {
          select: { id: true, method: true, amount: true, installments: true },
        },
        accountsReceivable: { select: { id: true } },
        cardReceivables: { select: { id: true } },
        items: {
          select: { id: true, productId: true, qty: true, costPrice: true },
        },
      },
    });

    // 3. Para cada Sale, classificar problemas
    const problems = {
      missingAR_StoreCredit: [] as typeof sales,
      missingAR_BalanceDue: [] as typeof sales,
      missingCR_CreditCard: [] as typeof sales,
      missingStockMovement: [] as typeof sales,
      excessCashMovement: [] as typeof sales,
      zeroCostPrice: [] as typeof sales,
    };

    let countMissingAR_SC = 0;
    let countMissingAR_BD = 0;
    let countMissingCR_CC = 0;
    let countMissingStockMov = 0;
    let countExcessCashMov = 0;
    let countZeroCost = 0;

    let totalMonetaryOrphan = 0;
    const byMonth: Record<string, { count: number; amount: number }> = {};
    const byCompany: Record<string, { count: number; amount: number; name: string }> = {};

    // Buscar StockMovements do tipo SALE para todas as Sales de uma vez (para evitar N+1)
    const saleIds = sales.map((s) => s.id);
    const stockMovements = await prisma.stockMovement.findMany({
      where: {
        type: "SALE",
        notes: { contains: "venda" }, // heurística — notes contém "Saída por venda #<id>"
      },
      select: { id: true, productId: true, branchId: true, notes: true, quantity: true },
    });
    // Mapear por substring do saleId (Sale.id.substring(0,8))
    const stockMovementsBySalePrefix = new Map<string, number>();
    for (const sm of stockMovements) {
      if (!sm.notes) continue;
      const match = sm.notes.match(/venda #([a-z0-9]{8})/i);
      if (match) {
        const prefix = match[1];
        stockMovementsBySalePrefix.set(prefix, (stockMovementsBySalePrefix.get(prefix) || 0) + 1);
      }
    }

    // Buscar CashMovements relacionados a vendas convertidas (excesso)
    const salePaymentIds = sales.flatMap((s) => s.payments.map((p) => p.id));
    const cashMovements = salePaymentIds.length > 0
      ? await prisma.cashMovement.findMany({
          where: { salePaymentId: { in: salePaymentIds } },
          select: { id: true, salePaymentId: true, method: true, type: true },
        })
      : [];
    const cashMovementsByPaymentId = new Map<string, typeof cashMovements>();
    for (const cm of cashMovements) {
      if (!cm.salePaymentId) continue;
      const list = cashMovementsByPaymentId.get(cm.salePaymentId) || [];
      list.push(cm);
      cashMovementsByPaymentId.set(cm.salePaymentId, list);
    }

    const NON_CASH_METHODS = new Set(["CREDIT_CARD", "STORE_CREDIT", "BALANCE_DUE", "BOLETO", "CHEQUE"]);

    for (const sale of sales) {
      const total = Number(sale.total);
      totalMonetaryOrphan += total;

      // Distribuição por mês
      const monthKey = sale.createdAt.toISOString().slice(0, 7); // YYYY-MM
      if (!byMonth[monthKey]) byMonth[monthKey] = { count: 0, amount: 0 };
      byMonth[monthKey].count++;
      byMonth[monthKey].amount += total;

      // Distribuição por empresa
      const compName = sale.company.tradeName || sale.company.name;
      if (!byCompany[sale.companyId]) byCompany[sale.companyId] = { count: 0, amount: 0, name: compName };
      byCompany[sale.companyId].count++;
      byCompany[sale.companyId].amount += total;

      // Classificações
      const hasStoreCredit = sale.payments.some((p) => p.method === "STORE_CREDIT");
      const hasBalanceDue = sale.payments.some((p) => p.method === "BALANCE_DUE");
      const hasCreditCard = sale.payments.some((p) => p.method === "CREDIT_CARD");
      const arCount = sale.accountsReceivable.length;
      const crCount = sale.cardReceivables.length;

      if (hasStoreCredit && arCount === 0) {
        problems.missingAR_StoreCredit.push(sale);
        countMissingAR_SC++;
      }
      if (hasBalanceDue && arCount === 0) {
        problems.missingAR_BalanceDue.push(sale);
        countMissingAR_BD++;
      }
      if (hasCreditCard && crCount === 0) {
        problems.missingCR_CreditCard.push(sale);
        countMissingCR_CC++;
      }

      // StockMovement faltante (heurística por prefixo do id)
      const idPrefix = sale.id.substring(0, 8);
      const smCount = stockMovementsBySalePrefix.get(idPrefix) || 0;
      const expectedSmCount = sale.items.filter((i) => i.productId).length;
      if (smCount < expectedSmCount) {
        problems.missingStockMovement.push(sale);
        countMissingStockMov++;
      }

      // CashMovement excedente (criados pra métodos não-cash)
      let excessCM = false;
      for (const p of sale.payments) {
        if (NON_CASH_METHODS.has(p.method)) {
          const cms = cashMovementsByPaymentId.get(p.id) || [];
          if (cms.some((cm) => cm.type === "SALE_PAYMENT")) {
            excessCM = true;
            break;
          }
        }
      }
      if (excessCM) {
        problems.excessCashMovement.push(sale);
        countExcessCashMov++;
      }

      // SaleItem com costPrice zerado (heurística — provável conversão antiga)
      const hasZeroCost = sale.items.some((i) => Number(i.costPrice) === 0 && i.productId);
      if (hasZeroCost) {
        problems.zeroCostPrice.push(sale);
        countZeroCost++;
      }
    }

    // Output sumarizado
    log.info("=".repeat(72));
    log.info("RESUMO");
    log.info("=".repeat(72));
    log.info(`Total Sales convertidas de Quote: ${totalConverted}`);
    log.info(`Soma R$ Sale.total: ${totalMonetaryOrphan.toFixed(2)}`);
    log.info("");
    log.info("Problemas detectados:");
    log.info(`  - STORE_CREDIT sem AccountReceivable:    ${countMissingAR_SC}`);
    log.info(`  - BALANCE_DUE sem AccountReceivable:     ${countMissingAR_BD}`);
    log.info(`  - CREDIT_CARD sem CardReceivable:        ${countMissingCR_CC}`);
    log.info(`  - Sale sem StockMovement (heurística):   ${countMissingStockMov}`);
    log.info(`  - CashMovement excedente em não-cash:    ${countExcessCashMov}`);
    log.info(`  - SaleItem com costPrice=0:              ${countZeroCost}`);

    log.info("");
    log.info("Distribuição por mês (últimos 12):");
    const months = Object.keys(byMonth).sort().slice(-12);
    for (const m of months) {
      log.info(`  ${m}: ${byMonth[m].count} vendas, R$ ${byMonth[m].amount.toFixed(2)}`);
    }

    log.info("");
    log.info("Top 20 empresas com vendas órfãs:");
    const topCompanies = Object.entries(byCompany)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);
    for (const [id, info] of topCompanies) {
      log.info(`  ${info.name} (${id.slice(0, 12)}...): ${info.count} vendas, R$ ${info.amount.toFixed(2)}`);
    }

    log.info("");
    log.info(`Log completo gravado em: ${log.filePath}`);

    // Saída JSON estruturada também (útil pra processar depois)
    log.json("RESULT", {
      totalConverted,
      totalMonetaryOrphan,
      counts: {
        missingAR_StoreCredit: countMissingAR_SC,
        missingAR_BalanceDue: countMissingAR_BD,
        missingCR_CreditCard: countMissingCR_CC,
        missingStockMovement: countMissingStockMov,
        excessCashMovement: countExcessCashMov,
        zeroCostPrice: countZeroCost,
      },
      byMonth,
      topCompanies: topCompanies.map(([id, info]) => ({ id, ...info })),
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
