import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tryPublishEntitlementForCompany } from "@/lib/vis-domus-publisher";

const BATCH_SIZE = 50;
const CONCURRENCY = 5;

export interface OutboxDrainResult {
  read: number;
  drained: number; // published + noop (linhas removidas)
  failed: number;
}

/**
 * Drena o EntitlementOutbox: le um batch ordenado por seq, publica cada company
 * (recalcula estado fresco), e apaga a linha SO em published|noop, com delete
 * condicional por (companyId, seq) — se o trigger re-enfileirou (seq maior)
 * durante o publish, o delete nao casa e a linha fica pro proximo tick.
 * Um so worker (cron horario) — sem FOR UPDATE SKIP LOCKED.
 */
export async function runOutboxDrainBatch(): Promise<OutboxDrainResult> {
  const rows = await prisma.$queryRaw<Array<{ companyId: string; seq: bigint }>>(Prisma.sql`
    SELECT "companyId", "seq" FROM "EntitlementOutbox"
    ORDER BY "seq" ASC
    LIMIT ${BATCH_SIZE}
  `);

  let drained = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ({ companyId, seq }) => {
        const r = await tryPublishEntitlementForCompany(companyId);
        if (r.kind === "failed") {
          failed++;
          return; // NAO deleta — reprocessa
        }
        // published | noop → delete condicional por seq
        await prisma.$executeRaw(Prisma.sql`
          DELETE FROM "EntitlementOutbox"
          WHERE "companyId" = ${companyId} AND "seq" = ${seq}
        `);
        drained++;
      }),
    );
  }

  return { read: rows.length, drained, failed };
}
