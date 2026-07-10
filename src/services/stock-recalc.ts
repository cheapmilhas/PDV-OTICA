// src/services/stock-recalc.ts
import type { Prisma } from "@prisma/client";

/**
 * Recalcula Product.stockQty como a SOMA das linhas BranchStock do produto.
 * Fonte de verdade do estoque é BranchStock (por filial); stockQty é cache.
 *
 * Trava a linha do Product com FOR UPDATE dentro da tx antes de recalcular,
 * evitando lost-update entre esta escrita e uma venda concorrente que também
 * mexe no cache. Chamar SEMPRE dentro de uma transação.
 */
export async function resyncProductStockCache(
  tx: Prisma.TransactionClient,
  productId: string
): Promise<void> {
  // Lock pessimista na linha do produto (serializa recalc vs venda concorrente).
  await tx.$executeRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
  await tx.$executeRaw`
    UPDATE "Product"
    SET "stockQty" = (
      SELECT COALESCE(SUM("quantity"), 0)
      FROM "branch_stocks"
      WHERE "product_id" = ${productId}
    ),
    "updatedAt" = NOW()
    WHERE "id" = ${productId}
  `;
}
