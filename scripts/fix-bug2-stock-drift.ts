/**
 * Bug #2 — Migração: sincronizar Product.stockQty = SUM(BranchStock.quantity).
 *
 * ESTRATÉGIA ESCOLHIDA (alinhada com Matheus): opção (a) — sincronizar o cache
 * Product.stockQty com a soma real de BranchStock.quantity por produto.
 *
 * Justificativa: BranchStock é a verdade operacional (cada filial conta seu
 * estoque físico). Product.stockQty é cache derivado.
 *
 * NÃO recria StockMovement faltantes (risco de duplicar histórico).
 *
 * Como rodar:
 *   1. Sempre PRIMEIRO em dry-run:
 *        npx tsx scripts/fix-bug2-stock-drift.ts
 *
 *   2. Aplicar:
 *        npx tsx scripts/fix-bug2-stock-drift.ts --apply --i-know-what-im-doing
 *      (digita "CONFIRMO")
 *
 *   3. Filtros:
 *        --company-id <id>
 *        --limit N
 */

import { loadDiagnosticEnv } from "./_helpers/env";
import { parseCliArgs, printUsage } from "./_helpers/cli";
import { showBanner } from "./_helpers/banner";
import { createLogger } from "./_helpers/logger";

async function main() {
  const env = loadDiagnosticEnv();
  const opts = parseCliArgs(process.argv);

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage("scripts/fix-bug2-stock-drift.ts");
    return;
  }

  const ok = await showBanner({
    scriptName: "fix-bug2-stock-drift.ts",
    description: "Sincroniza Product.stockQty = SUM(BranchStock.quantity).",
    databaseUrl: env.DATABASE_URL,
    options: opts,
  });
  if (!ok) return;

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const log = createLogger("fix-bug2-stock-drift");

  log.info(`Modo: ${opts.apply ? "APPLY" : "DRY-RUN"}`);

  try {
    const companyFilter = opts.companyId ? { companyId: opts.companyId } : {};

    const products = await prisma.product.findMany({
      where: {
        ...companyFilter,
        stockControlled: true,
      },
      take: opts.limit,
      select: {
        id: true,
        sku: true,
        name: true,
        stockQty: true,
        companyId: true,
        branchStocks: { select: { quantity: true } },
      },
    });

    log.info(`Produtos a verificar: ${products.length}`);

    let countDriftDetected = 0;
    let countSynced = 0;
    let countSkipped = 0;
    let totalUnitsAdjusted = 0;

    for (const p of products) {
      const cache = p.stockQty;
      const truth = p.branchStocks.reduce((sum, bs) => sum + bs.quantity, 0);
      const drift = cache - truth;

      if (drift === 0) {
        countSkipped++;
        continue;
      }

      countDriftDetected++;

      log.info(
        `[Product ${p.sku}] cache=${cache}, truth=${truth}, drift=${drift} → ${
          opts.apply ? "AJUSTAR" : "(dry-run)"
        }`
      );

      if (opts.apply) {
        try {
          await prisma.product.update({
            where: { id: p.id },
            data: { stockQty: truth },
          });
          countSynced++;
          totalUnitsAdjusted += Math.abs(drift);
        } catch (err) {
          log.error(
            `[Product ${p.sku}] erro: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      } else {
        countSynced++; // simulação
        totalUnitsAdjusted += Math.abs(drift);
      }
    }

    log.info("=".repeat(72));
    log.info("RESUMO");
    log.info("=".repeat(72));
    log.info(`Modo: ${opts.apply ? "APPLY" : "DRY-RUN"}`);
    log.info(`Produtos verificados: ${products.length}`);
    log.info(`Produtos com drift detectado: ${countDriftDetected}`);
    log.info(`Produtos sincronizados: ${countSynced}`);
    log.info(`Produtos sem drift (skipped): ${countSkipped}`);
    log.info(`Total de unidades ajustadas (|drift|): ${totalUnitsAdjusted}`);
    log.info(`Log completo: ${log.filePath}`);

    if (!opts.apply) {
      log.info("");
      log.info("→ DRY-RUN. Para aplicar:");
      log.info("    npx tsx scripts/fix-bug2-stock-drift.ts --apply --i-know-what-im-doing");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
