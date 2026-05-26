/**
 * Registra bugs descobertos no Cenário 3 (drift schema vs. banco em BranchStock)
 * e cria BranchStock para os 2 produtos via $executeRaw (insere SÓ colunas existentes
 * no banco real — quantity, min_stock, max_stock) para destravar os testes.
 */
import "./_env-shim";
import { prisma } from "@/lib/prisma";
import { loadState, saveState, recordBug } from "./_state";

const state = loadState();

async function main() {
  // BUGs
  recordBug(
    "Schema drift: BranchStock.{costPrice,salePrice,promoPrice,marginPercent} ausentes no banco",
    "CRITICO",
    "Prisma client gera SELECT incluindo cost_price/sale_price/promo_price/margin_percent mas a tabela branch_stocks no DB de produção NÃO tem essas colunas. Conferir via: SELECT column_name FROM information_schema.columns WHERE table_name='branch_stocks'. Migration nunca aplicada.",
    [
      "prisma/schema.prisma:2282 (modelo BranchStock)",
      "DB: branch_stocks tem só id, branch_id, product_id, quantity, min_stock, max_stock, location, updated_at",
    ],
  );

  recordBug(
    "atomicStockDebit explode no error-path quando BranchStock inexistente",
    "ALTO",
    "Quando um Product existe com stockQty>0 mas não há BranchStock(branchId, productId), o atomicStockDebit UPDATE retorna count=0 e cai no findUnique que tenta selecionar colunas inexistentes (cost_price/...) → 500 em vez de 'Estoque insuficiente'. Bloqueia vendas no PDV de qualquer produto cadastrado sem BranchStock por filial. Em produção isso aparece como 'erro genérico do Prisma' para vendedor.",
    [
      "src/services/stock.service.ts:50-62 (caminho if updated.count === 0)",
    ],
  );

  recordBug(
    "Criação de Product não cria BranchStock automaticamente",
    "ALTO",
    "Criar Product via productService ou Prisma direto NÃO popula BranchStock para nenhuma filial. Resultado: produto novo é invisível à venda em todas as filiais até alguém criar a linha em branch_stocks manualmente. Não há trigger / hook / migration de seed.",
    [
      "src/services/product.service.ts (não cria BranchStock)",
      "src/services/stock.service.ts (atomicStockDebit assume linha existente)",
    ],
  );

  // Workaround para destravar testes: insere BranchStock direto
  // SQL nu para evitar Prisma tentar incluir cost_price (que não existe no DB).
  const { branchId, frameProductId, lensProductId } = state as Required<typeof state>;

  await prisma.$executeRaw`
    INSERT INTO branch_stocks (id, branch_id, product_id, quantity, min_stock, location, updated_at)
    VALUES (
      ${"bs_" + frameProductId!.slice(-12)},
      ${branchId!},
      ${frameProductId!},
      50,
      5,
      NULL,
      NOW()
    )
    ON CONFLICT (branch_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity
  `;

  await prisma.$executeRaw`
    INSERT INTO branch_stocks (id, branch_id, product_id, quantity, min_stock, location, updated_at)
    VALUES (
      ${"bs_" + lensProductId!.slice(-12)},
      ${branchId!},
      ${lensProductId!},
      30,
      3,
      NULL,
      NOW()
    )
    ON CONFLICT (branch_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity
  `;

  console.log("[QA] BranchStock inserido via raw SQL (workaround do schema drift).");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
