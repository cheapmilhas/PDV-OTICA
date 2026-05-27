import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Retorna o próximo número sequencial para uma chave por empresa.
 *
 * Atomicidade: `upsert` + `{ increment: 1 }` mapeia para `INSERT ... ON CONFLICT
 * DO UPDATE SET value = value + 1 RETURNING value` no Postgres. Garantido contra
 * race entre processos/workers concorrentes via unique constraint @@unique(companyId,key).
 *
 * Auditado em 2026-05-26 (Q4.3): não há nenhum outro callsite calculando MAX()
 * ou orderBy+take(1) para sequências. Manter este helper como única porta de
 * entrada para geração de números.
 *
 * Chaves usadas:
 *   "service_order" — número da OS (callsite: src/services/service-order.service.ts)
 *   "sale"          — reservado (vendas usam id cuid hoje)
 *   "quote"         — reservado (orçamentos usam id cuid hoje)
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
