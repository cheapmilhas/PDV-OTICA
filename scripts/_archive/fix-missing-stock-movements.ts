/**
 * Script de auditoria retroativa — Cria StockMovement faltantes para vendas COMPLETED.
 *
 * Uso: npx tsx scripts/fix-missing-stock-movements.ts
 *
 * O que faz:
 * 1. Busca todas as vendas com status COMPLETED
 * 2. Para cada SaleItem com productId, verifica se existe um StockMovement tipo SALE
 * 3. Se não existir, cria a movimentação retroativa
 * 4. Exibe relatório final
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("========================================");
  console.log("  AUDITORIA DE MOVIMENTAÇÕES DE ESTOQUE");
  console.log("========================================\n");

  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED" },
    include: {
      items: {
        where: { productId: { not: null } },
        select: {
          id: true,
          productId: true,
          qty: true,
          saleId: true,
          product: { select: { name: true, sku: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Total de vendas COMPLETED: ${sales.length}\n`);

  let totalVerificados = 0;
  let totalCriados = 0;
  let totalJaExistentes = 0;
  const erros: string[] = [];

  for (const sale of sales) {
    for (const item of sale.items) {
      if (!item.productId) continue;
      totalVerificados++;

      // Verificar se já existe StockMovement para esta venda + produto
      const existing = await prisma.stockMovement.findFirst({
        where: {
          companyId: sale.companyId,
          productId: item.productId,
          type: "SALE",
          // Busca por nota que referencia esta venda
          notes: { contains: sale.id.substring(0, 8) },
        },
      });

      if (existing) {
        totalJaExistentes++;
        continue;
      }

      // Criar movimentação retroativa
      try {
        await prisma.stockMovement.create({
          data: {
            companyId: sale.companyId,
            branchId: sale.branchId,
            productId: item.productId,
            type: "SALE",
            quantity: -item.qty,
            notes: `Movimentação retroativa - Auditoria ${new Date().toISOString().split("T")[0]} - Venda #${sale.id.substring(0, 8)}`,
            createdAt: sale.completedAt || sale.createdAt,
          },
        });
        totalCriados++;
        console.log(
          `  ✅ Criado: Venda #${sale.id.substring(0, 8)} | ${item.product?.name || item.productId} | qty: -${item.qty}`
        );
      } catch (err: any) {
        erros.push(`Venda ${sale.id} / Item ${item.id}: ${err.message}`);
        console.error(`  ❌ Erro: Venda #${sale.id.substring(0, 8)} | ${err.message}`);
      }
    }
  }

  console.log("\n========================================");
  console.log("  RELATÓRIO FINAL");
  console.log("========================================");
  console.log(`Vendas verificadas:        ${sales.length}`);
  console.log(`Itens verificados:         ${totalVerificados}`);
  console.log(`Movimentações já existiam: ${totalJaExistentes}`);
  console.log(`Movimentações criadas:     ${totalCriados}`);
  console.log(`Erros:                     ${erros.length}`);

  if (erros.length > 0) {
    console.log("\nErros encontrados:");
    erros.forEach((e) => console.log(`  - ${e}`));
  }

  console.log("\n✅ Auditoria concluída!");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  prisma.$disconnect();
  process.exit(1);
});
