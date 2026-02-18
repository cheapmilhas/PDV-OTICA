import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type SoftDeleteModel = "customer" | "product" | "sale" | "serviceOrder" | "quote";

/**
 * Realiza soft delete em uma entidade, definindo deletedAt = now().
 * Não remove o registro do banco — apenas o marca como deletado.
 */
export async function softDelete(
  model: SoftDeleteModel,
  id: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma;
  const data = { deletedAt: new Date() };

  switch (model) {
    case "customer":
      await client.customer.update({ where: { id }, data });
      break;
    case "product":
      await client.product.update({ where: { id }, data });
      break;
    case "sale":
      await client.sale.update({ where: { id }, data });
      break;
    case "serviceOrder":
      await client.serviceOrder.update({ where: { id }, data });
      break;
    case "quote":
      await client.quote.update({ where: { id }, data });
      break;
  }
}

/**
 * Filtro padrão para excluir registros soft-deletados em queries.
 * Uso: where: { ...softDeleteFilter(), companyId }
 */
export function softDeleteFilter() {
  return { deletedAt: null };
}
