/**
 * Script retroativo — Regenera FinanceEntry COGS para vendas existentes.
 *
 * Uso: npx tsx scripts/fix-finance-entries-cogs.ts
 *
 * Deve ser rodado DEPOIS de fix-sale-items-cost.ts.
 *
 * O que faz:
 * 1. Busca vendas COMPLETED que não têm FinanceEntry COGS (ou têm amount=0)
 * 2. Para cada SaleItem com costPrice > 0, cria/atualiza o FinanceEntry COGS
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getCMVAccountCode(productType: string | undefined): string {
  switch (productType) {
    case "FRAME":
    case "SUNGLASSES":
      return "4.1.01";
    case "LENS":
      return "4.1.02";
    case "ACCESSORY":
      return "4.1.03";
    default:
      return "4.1.04";
  }
}

async function main() {
  console.log("==========================================");
  console.log("  REGENERAR FINANCE ENTRIES COGS");
  console.log("==========================================\n");

  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED" },
    include: {
      items: {
        where: {
          productId: { not: null },
          costPrice: { gt: 0 },
        },
        include: {
          product: { select: { type: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Vendas COMPLETED: ${sales.length}\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const sale of sales) {
    for (const item of sale.items) {
      if (!item.productId) continue;

      const itemCost = Number(item.costPrice) * item.qty;
      if (itemCost <= 0) {
        skipped++;
        continue;
      }

      try {
        const cmvCode = getCMVAccountCode(item.product?.type);
        const cmvAccount = await prisma.chartOfAccounts.findUnique({
          where: { companyId_code: { companyId: sale.companyId, code: cmvCode } },
        });
        const estoqueAccount = await prisma.chartOfAccounts.findUnique({
          where: { companyId_code: { companyId: sale.companyId, code: "1.1.04" } },
        });

        if (!cmvAccount || !estoqueAccount) {
          console.log(`  ⚠️ Conta contábil não encontrada para company ${sale.companyId}`);
          skipped++;
          continue;
        }

        // Verificar se já existe
        const existing = await prisma.financeEntry.findFirst({
          where: {
            companyId: sale.companyId,
            sourceType: "SaleItem",
            sourceId: item.id,
            type: "COGS",
            side: "DEBIT",
          },
        });

        if (existing && Number(existing.amount) > 0) {
          skipped++;
          continue;
        }

        if (existing) {
          // Atualizar entry existente com amount=0
          await prisma.financeEntry.update({
            where: { id: existing.id },
            data: { amount: itemCost },
          });
          updated++;
        } else {
          // Criar nova entry
          await prisma.financeEntry.create({
            data: {
              companyId: sale.companyId,
              branchId: sale.branchId,
              type: "COGS",
              side: "DEBIT",
              amount: itemCost,
              debitAccountId: cmvAccount.id,
              creditAccountId: estoqueAccount.id,
              sourceType: "SaleItem",
              sourceId: item.id,
              description: `CMV retroativo - ${item.product?.name || item.productId}`,
              entryDate: sale.completedAt || sale.createdAt,
            },
          });
          created++;
        }

        console.log(
          `  ✅ Venda #${sale.id.substring(0, 8)} | ${item.product?.name} | CMV: R$ ${itemCost.toFixed(2)}`
        );
      } catch (err: any) {
        errors++;
        console.error(`  ❌ Erro: ${err.message}`);
      }
    }
  }

  console.log("\n==========================================");
  console.log("  RELATÓRIO FINAL");
  console.log("==========================================");
  console.log(`Entries criadas:    ${created}`);
  console.log(`Entries atualizadas: ${updated}`);
  console.log(`Itens ignorados:    ${skipped}`);
  console.log(`Erros:              ${errors}`);
  console.log("\n✅ Regeneração concluída!");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  prisma.$disconnect();
  process.exit(1);
});
