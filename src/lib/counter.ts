import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Retorna o próximo número sequencial para uma chave por empresa.
 * Usa upsert + increment atômico — seguro contra race condition.
 *
 * Chaves usadas:
 *   "service_order" — número da OS
 *   "sale"          — número da venda (futuro)
 *   "quote"         — número do orçamento (futuro)
 */
export async function getNextSequence(
  companyId: string,
  key: string,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const client = tx || prisma;

  const counter = await client.counter.upsert({
    where: {
      companyId_key: { companyId, key },
    },
    create: {
      companyId,
      key,
      value: 1,
    },
    update: {
      value: { increment: 1 },
    },
  });

  return counter.value;
}
