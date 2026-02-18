import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

interface StockDebitResult {
  success: boolean;
  previousQty: number;
  newQty: number;
  error?: string;
}

/**
 * Debita estoque de forma atômica, garantindo que não fique negativo.
 * Usa UPDATE com WHERE condicional para evitar race condition.
 */
export async function atomicStockDebit(
  productId: string,
  quantity: number,
  companyId: string,
  tx?: Prisma.TransactionClient
): Promise<StockDebitResult> {
  const client = tx || prisma;

  // Atomic update: só debita se tiver estoque suficiente
  const result = await client.$executeRaw`
    UPDATE "Product"
    SET "stockQty" = "stockQty" - ${quantity},
        "updatedAt" = NOW()
    WHERE "id" = ${productId}
      AND "companyId" = ${companyId}
      AND "stockQty" >= ${quantity}
      AND "stockControlled" = true
  `;

  if (result === 0) {
    // Não atualizou — ou não existe, ou estoque insuficiente, ou não controlado
    const product = await client.product.findFirst({
      where: { id: productId, companyId },
      select: { stockQty: true, name: true, stockControlled: true },
    });

    if (!product) {
      return { success: false, previousQty: 0, newQty: 0, error: "Produto não encontrado" };
    }

    if (!product.stockControlled) {
      // Produto sem controle de estoque — permite vender sem alterar
      return { success: true, previousQty: 0, newQty: 0 };
    }

    return {
      success: false,
      previousQty: product.stockQty,
      newQty: product.stockQty,
      error: `Estoque insuficiente para "${product.name}". Disponível: ${product.stockQty}, Solicitado: ${quantity}`,
    };
  }

  // Buscar valores pós-update
  const updated = await client.product.findUnique({
    where: { id: productId },
    select: { stockQty: true },
  });

  return {
    success: true,
    previousQty: (updated?.stockQty ?? 0) + quantity,
    newQty: updated?.stockQty ?? 0,
  };
}

/**
 * Credita estoque de forma atômica (devolução, entrada).
 */
export async function atomicStockCredit(
  productId: string,
  quantity: number,
  companyId: string,
  tx?: Prisma.TransactionClient
): Promise<StockDebitResult> {
  const client = tx || prisma;

  await client.$executeRaw`
    UPDATE "Product"
    SET "stockQty" = "stockQty" + ${quantity},
        "updatedAt" = NOW()
    WHERE "id" = ${productId}
      AND "companyId" = ${companyId}
      AND "stockControlled" = true
  `;

  const updated = await client.product.findUnique({
    where: { id: productId },
    select: { stockQty: true },
  });

  return {
    success: true,
    previousQty: (updated?.stockQty ?? 0) - quantity,
    newQty: updated?.stockQty ?? 0,
  };
}
