import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

interface StockDebitResult {
  success: boolean;
  previousQty: number;
  newQty: number;
  error?: string;
}

/**
 * Debita estoque de forma atômica no BranchStock da filial.
 * Também atualiza Product.stockQty como cache (soma total).
 */
export async function atomicStockDebit(
  productId: string,
  quantity: number,
  companyId: string,
  tx?: Prisma.TransactionClient,
  branchId?: string | null,
  // G1 (Grupo G): quando um gerente autoriza venda sem estoque (override
  // INSUFFICIENT_STOCK), o débito deve permitir estoque NEGATIVO. Sem isto, o
  // débito atômico (quantity >= qty) falhava e abortava a venda — o override
  // pulava só a pré-validação, mas o recurso nunca funcionava de fato.
  allowNegative = false
): Promise<StockDebitResult> {
  const client = tx || prisma;

  // Verificar se produto é controlado
  const product = await client.product.findFirst({
    where: { id: productId, companyId },
    select: { stockQty: true, name: true, stockControlled: true },
  });

  if (!product) {
    return { success: false, previousQty: 0, newQty: 0, error: "Produto não encontrado" };
  }

  if (!product.stockControlled) {
    return { success: true, previousQty: 0, newQty: 0 };
  }

  // Se branchId fornecido, usar BranchStock
  if (branchId) {
    if (allowNegative) {
      // Override de gerente: debita SEM o guard quantity>=qty (deixa negativo).
      // upsert cobre o caso de não haver linha de BranchStock ainda.
      // Nota: allowNegative é sale-wide (o override INSUFFICIENT_STOCK vale pra
      // venda toda); itens com estoque suficiente também pulam o guard de race.
      // Aceitável — o gerente já assumiu vender sem garantia de estoque.
      // prevBranchQty é best-effort para auditoria (StockMovement), não guard:
      // sob concorrência pode estar levemente defasado; o decrement é atômico.
      const before = await client.branchStock.findUnique({
        where: { branchId_productId: { branchId, productId } },
        select: { quantity: true },
      });
      const prevBranchQty = before?.quantity ?? 0;
      await client.branchStock.upsert({
        where: { branchId_productId: { branchId, productId } },
        create: { branchId, productId, quantity: -quantity },
        update: { quantity: { decrement: quantity } },
      });
      await client.$executeRaw`
        UPDATE "Product"
        SET "stockQty" = "stockQty" - ${quantity},
            "updatedAt" = NOW()
        WHERE "id" = ${productId}
          AND "companyId" = ${companyId}
          AND "stockControlled" = true
      `;
      return {
        success: true,
        previousQty: prevBranchQty,
        newQty: prevBranchQty - quantity,
      };
    }

    // Operação atômica: só debita se quantity >= solicitado (previne race condition)
    const updated = await client.branchStock.updateMany({
      where: {
        branchId,
        productId,
        quantity: { gte: quantity },
      },
      data: { quantity: { decrement: quantity } },
    });

    if (updated.count === 0) {
      // Buscar qty atual apenas para mensagem de erro
      const branchStock = await client.branchStock.findUnique({
        where: { branchId_productId: { branchId, productId } },
      });
      const currentQty = branchStock?.quantity ?? 0;
      return {
        success: false,
        previousQty: currentQty,
        newQty: currentQty,
        error: `Estoque insuficiente para "${product.name}". Disponível: ${currentQty}, Solicitado: ${quantity}`,
      };
    }

    const previousQty = (product.stockQty ?? 0);

    // Atualizar cache Product.stockQty (atômico via $executeRaw)
    await client.$executeRaw`
      UPDATE "Product"
      SET "stockQty" = "stockQty" - ${quantity},
          "updatedAt" = NOW()
      WHERE "id" = ${productId}
        AND "companyId" = ${companyId}
    `;

    return {
      success: true,
      previousQty: previousQty,
      newQty: previousQty - quantity,
    };
  }

  // Fallback: sem branchId, usar Product.stockQty diretamente (compatibilidade)
  // allowNegative remove o guard stockQty>=quantity (override de gerente).
  const result = allowNegative
    ? await client.$executeRaw`
        UPDATE "Product"
        SET "stockQty" = "stockQty" - ${quantity},
            "updatedAt" = NOW()
        WHERE "id" = ${productId}
          AND "companyId" = ${companyId}
          AND "stockControlled" = true
      `
    : await client.$executeRaw`
        UPDATE "Product"
        SET "stockQty" = "stockQty" - ${quantity},
            "updatedAt" = NOW()
        WHERE "id" = ${productId}
          AND "companyId" = ${companyId}
          AND "stockQty" >= ${quantity}
          AND "stockControlled" = true
      `;

  if (result === 0) {
    return {
      success: false,
      previousQty: product.stockQty,
      newQty: product.stockQty,
      error: `Estoque insuficiente para "${product.name}". Disponível: ${product.stockQty}, Solicitado: ${quantity}`,
    };
  }

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
 * Também atualiza Product.stockQty como cache.
 */
export async function atomicStockCredit(
  productId: string,
  quantity: number,
  companyId: string,
  tx?: Prisma.TransactionClient,
  branchId?: string | null
): Promise<StockDebitResult> {
  const client = tx || prisma;

  // Se branchId fornecido, usar BranchStock
  if (branchId) {
    // Upsert: cria se não existir (ex: devolução para branch que não tinha estoque)
    const updated = await client.branchStock.upsert({
      where: { branchId_productId: { branchId, productId } },
      create: { branchId, productId, quantity },
      update: { quantity: { increment: quantity } },
    });

    // Atualizar cache Product.stockQty
    await client.$executeRaw`
      UPDATE "Product"
      SET "stockQty" = "stockQty" + ${quantity},
          "updatedAt" = NOW()
      WHERE "id" = ${productId}
        AND "companyId" = ${companyId}
    `;

    return {
      success: true,
      previousQty: updated.quantity - quantity,
      newQty: updated.quantity,
    };
  }

  // Fallback: sem branchId
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
