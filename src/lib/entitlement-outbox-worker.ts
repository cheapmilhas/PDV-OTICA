import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  tryPublishEntitlementForCompany,
  tryRevokeEntitlementForClinic,
} from "@/lib/vis-domus-publisher";

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

export interface RevocationDrainResult {
  read: number;
  revoked: number;
  failed: number;
}

/**
 * Drena o EntitlementRevocationOutbox: revoga cada clinicId orfao no Domus.
 * Delete condicional por (domusClinicId, seq) — igual ao drain de publish.
 * Nao ha "noop" (revogacao sempre tem clinicId + reason); so published deleta.
 * Passa visCompanyId + reason (COMPANY_DELETED terminal | UNLINKED TTL) ao publisher.
 */
export async function runRevocationDrainBatch(): Promise<RevocationDrainResult> {
  const rows = await prisma.$queryRaw<
    Array<{ domusClinicId: string; visCompanyId: string; reason: string; seq: bigint }>
  >(Prisma.sql`
    SELECT "domusClinicId", "visCompanyId", "reason", "seq" FROM "EntitlementRevocationOutbox"
    ORDER BY "seq" ASC
    LIMIT ${BATCH_SIZE}
  `);

  let revoked = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ({ domusClinicId, visCompanyId, reason, seq }) => {
        const r = await tryRevokeEntitlementForClinic(
          visCompanyId,
          domusClinicId,
          seq.toString(),
          reason as "COMPANY_DELETED" | "UNLINKED",
        );
        if (r.kind !== "published") {
          failed++;
          return; // NAO deleta — reprocessa
        }
        await prisma.$executeRaw(Prisma.sql`
          DELETE FROM "EntitlementRevocationOutbox"
          WHERE "domusClinicId" = ${domusClinicId} AND "seq" = ${seq}
        `);
        revoked++;
      }),
    );
  }

  return { read: rows.length, revoked, failed };
}
