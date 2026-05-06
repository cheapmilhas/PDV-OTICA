/**
 * Bug #3 — Migração: cria SystemRules de credit limit para empresas que não têm.
 *
 * Defaults (decisão Matheus, ver bug3_diagnostico.md):
 *   - customers.default_credit_limit = 500 (R$)
 *   - customers.block_overdue_sales = true
 *   - customers.overdue_days_to_block = 30
 *
 * IMPORTANTE: NÃO altera Customer.creditLimit individual. Todos os clientes
 * existentes ficam com creditLimit=NULL → usa o default da empresa.
 *
 * Este script só CRIA regras faltantes (idempotente).
 *
 * Como rodar:
 *   npx tsx scripts/fix-bug3-set-default-credit-limits.ts            # dry-run
 *   npx tsx scripts/fix-bug3-set-default-credit-limits.ts --apply --i-know-what-im-doing
 */

import { loadDiagnosticEnv } from "./_helpers/env";
import { parseCliArgs, printUsage } from "./_helpers/cli";
import { showBanner } from "./_helpers/banner";
import { createLogger } from "./_helpers/logger";

const RULES_TO_ENSURE = [
  {
    key: "customers.default_credit_limit",
    value: 500,
    description: "Limite de crédito padrão (R$) para novos clientes",
  },
  {
    key: "customers.block_overdue_sales",
    value: true,
    description: "Bloquear vendas para clientes inadimplentes",
  },
  {
    key: "customers.overdue_days_to_block",
    value: 30,
    description: "Dias de atraso para bloquear automaticamente o cliente",
  },
];

async function main() {
  const env = loadDiagnosticEnv();
  const opts = parseCliArgs(process.argv);

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage("scripts/fix-bug3-set-default-credit-limits.ts");
    return;
  }

  const ok = await showBanner({
    scriptName: "fix-bug3-set-default-credit-limits.ts",
    description: "Cria SystemRules de credit (default_credit_limit, block_overdue_sales, overdue_days_to_block) para empresas que não têm.",
    databaseUrl: env.DATABASE_URL,
    options: opts,
  });
  if (!ok) return;

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const log = createLogger("fix-bug3-set-default-credit-limits");

  log.info(`Modo: ${opts.apply ? "APPLY" : "DRY-RUN"}`);

  try {
    const companyFilter = opts.companyId ? { id: opts.companyId } : {};

    const companies = await prisma.company.findMany({
      where: companyFilter,
      take: opts.limit,
      select: {
        id: true,
        name: true,
        tradeName: true,
        systemRules: {
          where: {
            key: { in: RULES_TO_ENSURE.map((r) => r.key) },
          },
          select: { key: true },
        },
      },
    });

    log.info(`Empresas a verificar: ${companies.length}`);

    let countCompaniesWithMissing = 0;
    let countRulesCreated = 0;

    for (const company of companies) {
      const existingKeys = new Set(company.systemRules.map((r) => r.key));
      const missingRules = RULES_TO_ENSURE.filter((r) => !existingKeys.has(r.key));

      if (missingRules.length === 0) {
        continue;
      }

      countCompaniesWithMissing++;
      const compName = company.tradeName || company.name;
      log.info(
        `[${compName}] regras faltantes: ${missingRules.map((r) => r.key).join(", ")}`
      );

      if (opts.apply) {
        for (const rule of missingRules) {
          try {
            await prisma.systemRule.create({
              data: {
                companyId: company.id,
                category: "CUSTOMERS",
                key: rule.key,
                value: rule.value as any,
                description: rule.description,
                active: true,
              },
            });
            countRulesCreated++;
          } catch (err) {
            log.error(
              `[${compName}] erro ao criar ${rule.key}: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }
      } else {
        countRulesCreated += missingRules.length;
      }
    }

    log.info("=".repeat(72));
    log.info("RESUMO");
    log.info("=".repeat(72));
    log.info(`Modo: ${opts.apply ? "APPLY" : "DRY-RUN"}`);
    log.info(`Empresas verificadas: ${companies.length}`);
    log.info(`Empresas com regras faltantes: ${countCompaniesWithMissing}`);
    log.info(`Total de regras criadas: ${countRulesCreated}`);
    log.info(`Log completo: ${log.filePath}`);

    if (!opts.apply) {
      log.info("");
      log.info("→ DRY-RUN. Para aplicar:");
      log.info(
        "    npx tsx scripts/fix-bug3-set-default-credit-limits.ts --apply --i-know-what-im-doing"
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
