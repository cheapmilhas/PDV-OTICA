/**
 * Script retroativo — Preenche SaleItem.costPrice com Product.costPrice atual.
 *
 * Uso: npx tsx scripts/fix-sale-items-cost.ts
 *
 * O que faz:
 * 1. Busca todos os SaleItems com costPrice = 0 que têm productId
 * 2. Para cada um, copia o costPrice atual do Product
 * 3. Exibe relatório final
 *
 * NOTA: Usa o custo ATUAL do produto. Se o custo mudou desde a venda,
 * o valor será aproximado. Melhor que zero.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("==========================================");
  console.log("  CORREÇÃO RETROATIVA: SaleItem.costPrice");
  console.log("==========================================\n");

  // Buscar SaleItems com costPrice = 0 e que têm produto associado
  const items = await prisma.saleItem.findMany({
    where: {
      costPrice: 0,
      productId: { not: null },
    },
    select: {
      id: true,
      productId: true,
      qty: true,
      sale: { select: { id: true, createdAt: true } },
    },
  });

  console.log(`SaleItems com costPrice = 0: ${items.length}\n`);

  if (items.length === 0) {
    console.log("Nenhum item para corrigir. Tudo OK!");
    await prisma.$disconnect();
    return;
  }

  // Buscar custo atual de todos os produtos envolvidos
  const productIds = [...new Set(items.map((i) => i.productId!))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, costPrice: true },
  });
  const costMap = new Map(products.map((p) => [p.id, { cost: Number(p.costPrice), name: p.name }]));

  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const product = costMap.get(item.productId!);
    if (!product || product.cost <= 0) {
      skipped++;
      continue;
    }

    await prisma.saleItem.update({
      where: { id: item.id },
      data: { costPrice: product.cost },
    });

    updated++;
    console.log(
      `  ✅ ${product.name} | Venda #${item.sale.id.substring(0, 8)} | custo: R$ ${product.cost.toFixed(2)} × ${item.qty}`
    );
  }

  console.log("\n==========================================");
  console.log("  RELATÓRIO FINAL");
  console.log("==========================================");
  console.log(`Total de itens encontrados: ${items.length}`);
  console.log(`Itens atualizados:         ${updated}`);
  console.log(`Itens ignorados (sem custo no produto): ${skipped}`);
  console.log("\n✅ Correção concluída!");
  console.log("\n⚠️  PRÓXIMO PASSO: Execute o recálculo dos FinanceEntries:");
  console.log("   npx tsx scripts/fix-finance-entries-cogs.ts");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  prisma.$disconnect();
  process.exit(1);
});
