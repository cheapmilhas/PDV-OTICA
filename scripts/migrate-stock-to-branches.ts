/**
 * Script de migração: Product.stockQty → BranchStock
 *
 * Para cada produto com stockQty > 0, cria um BranchStock na branch
 * mais antiga da empresa (Matriz).
 *
 * Uso: npx tsx scripts/migrate-stock-to-branches.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Iniciando migração de estoque para BranchStock...\n");

  // Buscar todas as empresas com suas branches
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      branches: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, name: true },
      },
    },
  });

  let totalMigrated = 0;
  let totalSkipped = 0;

  for (const company of companies) {
    const mainBranch = company.branches[0];
    if (!mainBranch) {
      console.log(`⚠️  ${company.name}: sem branch ativa, pulando`);
      continue;
    }

    // Buscar produtos com estoque > 0
    const products = await prisma.product.findMany({
      where: {
        companyId: company.id,
        stockQty: { gt: 0 },
        active: true,
      },
      select: { id: true, name: true, stockQty: true, stockMin: true, stockMax: true },
    });

    if (products.length === 0) {
      console.log(`  ${company.name}: nenhum produto com estoque`);
      continue;
    }

    console.log(`📦 ${company.name} → ${mainBranch.name}: ${products.length} produtos`);

    for (const product of products) {
      try {
        await prisma.branchStock.upsert({
          where: {
            branchId_productId: {
              branchId: mainBranch.id,
              productId: product.id,
            },
          },
          create: {
            branchId: mainBranch.id,
            productId: product.id,
            quantity: product.stockQty,
            minStock: product.stockMin,
            maxStock: product.stockMax,
          },
          update: {
            quantity: product.stockQty,
            minStock: product.stockMin,
            maxStock: product.stockMax,
          },
        });
        totalMigrated++;
      } catch (err) {
        console.error(`  ❌ Erro ao migrar ${product.name}:`, err);
        totalSkipped++;
      }
    }
  }

  console.log(`\n✅ Migração concluída!`);
  console.log(`   Migrados: ${totalMigrated}`);
  console.log(`   Erros: ${totalSkipped}`);
}

main()
  .catch((err) => {
    console.error("Erro fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
