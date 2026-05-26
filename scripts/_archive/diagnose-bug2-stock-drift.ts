/**
 * Diagnóstico Bug #2 — Drift entre Product.stockQty (cache) e SUM(BranchStock.quantity).
 *
 * READ-ONLY. Não escreve nada no banco.
 *
 * Como rodar:
 *   npx tsx scripts/diagnose-bug2-stock-drift.ts [--company-id <id>]
 *
 * Saída: imprime resumo + lista top 50 produtos com drift no console e em
 * scripts/logs/diagnose-bug2-stock-drift-<timestamp>.log
 */

import { loadDiagnosticEnv } from "./_helpers/env";
import { parseCliArgs, printUsage } from "./_helpers/cli";
import { showBanner } from "./_helpers/banner";
import { createLogger } from "./_helpers/logger";

async function main() {
  const env = loadDiagnosticEnv();
  const opts = parseCliArgs(process.argv);

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage("scripts/diagnose-bug2-stock-drift.ts");
    return;
  }

  const ok = await showBanner({
    scriptName: "diagnose-bug2-stock-drift.ts",
    description: "Lista produtos onde Product.stockQty != SUM(BranchStock.quantity).",
    databaseUrl: env.DATABASE_URL,
    options: opts,
    isReadOnly: true,
  });
  if (!ok) return;

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const log = createLogger("diagnose-bug2-stock-drift");

  try {
    log.info(`Iniciando diagnóstico de drift de estoque.`);

    // Filtro por empresa (opcional)
    const companyFilter = opts.companyId ? { companyId: opts.companyId } : {};

    // 1. Produtos controlled
    const products = await prisma.product.findMany({
      where: {
        ...companyFilter,
        stockControlled: true,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        stockQty: true,
        companyId: true,
        company: { select: { name: true, tradeName: true } },
        branchStocks: { select: { quantity: true, branchId: true } },
        // refundItems via SaleItem (heurística: produto que já teve refund)
        saleItems: {
          select: { refundItems: { select: { id: true } } },
          take: 1,
        },
      },
    });

    log.info(`Total de produtos controlled (com filtros): ${products.length}`);

    // 2. Calcular drift
    interface DriftRow {
      productId: string;
      sku: string;
      name: string;
      cache: number;
      truth: number;
      drift: number;
      branchStockCount: number;
      hasRefundHistory: boolean;
      companyName: string;
    }

    const driftRows: DriftRow[] = [];
    let countDriftPositive = 0; // cache > truth (Product.stockQty inflado)
    let countDriftNegative = 0; // cache < truth (Product.stockQty deflado)
    let countDriftZero = 0;
    let totalAbsoluteDrift = 0;

    for (const p of products) {
      const cache = p.stockQty;
      const truth = p.branchStocks.reduce((sum, bs) => sum + bs.quantity, 0);
      const drift = cache - truth;

      if (drift > 0) countDriftPositive++;
      else if (drift < 0) countDriftNegative++;
      else countDriftZero++;

      totalAbsoluteDrift += Math.abs(drift);

      const hasRefundHistory = p.saleItems.some((si) => si.refundItems.length > 0);

      if (drift !== 0) {
        driftRows.push({
          productId: p.id,
          sku: p.sku,
          name: p.name,
          cache,
          truth,
          drift,
          branchStockCount: p.branchStocks.length,
          hasRefundHistory,
          companyName: p.company.tradeName || p.company.name,
        });
      }
    }

    // 3. Sumário
    log.info("=".repeat(72));
    log.info("RESUMO");
    log.info("=".repeat(72));
    log.info(`Produtos com cache > truth (Product.stockQty inflado): ${countDriftPositive}`);
    log.info(`Produtos com cache < truth (Product.stockQty deflado): ${countDriftNegative}`);
    log.info(`Produtos sem drift: ${countDriftZero}`);
    log.info(`Total de unidades em drift absoluto: ${totalAbsoluteDrift}`);
    log.info("");

    // 4. Top 50 por |drift|
    const top50 = driftRows
      .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
      .slice(0, 50);

    log.info("Top 50 produtos com maior |drift|:");
    log.info(
      "  SKU                  Nome                                      Cache  Truth  Drift  Branches  RefundHist  Empresa"
    );
    for (const row of top50) {
      const sku = row.sku.padEnd(20);
      const name = row.name.substring(0, 40).padEnd(40);
      const cache = String(row.cache).padStart(5);
      const truth = String(row.truth).padStart(5);
      const drift = String(row.drift).padStart(5);
      const branches = String(row.branchStockCount).padStart(8);
      const refund = row.hasRefundHistory ? "✓" : " ";
      log.info(
        `  ${sku} ${name} ${cache} ${truth} ${drift} ${branches}     ${refund}        ${row.companyName}`
      );
    }

    log.info("");
    log.info(`Log completo: ${log.filePath}`);

    // JSON estruturado para processamento posterior
    log.json("RESULT", {
      totalProducts: products.length,
      countDriftPositive,
      countDriftNegative,
      countDriftZero,
      totalAbsoluteDrift,
      top50,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
