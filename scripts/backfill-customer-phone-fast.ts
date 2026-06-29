/**
 * Backfill RÁPIDO de Customer.phoneNormalized / phone2Normalized.
 *
 * Versão em LOTE do backfill original: em vez de 1 UPDATE por ficha (lento +
 * frágil contra latência do Neon), agrupa N fichas num único UPDATE ... CASE
 * por batch. Idempotente e resiliente — pode re-rodar; só toca quem ainda falta.
 *
 * SEGURANÇA / LGPD (igual ao original):
 *  - PULA fichas anonimizadas/deletadas (anonymizedAt/deletedAt).
 *  - Multi-tenant: a chave é só derivação LOCAL do telefone da própria ficha;
 *    o UPDATE casa por id (PK), nunca cruza companyId.
 *  - Idempotente: só processa fichas cuja chave ainda não está gravada.
 *
 * Uso:
 *   npx tsx scripts/backfill-customer-phone-fast.ts            # dry-run
 *   npx tsx scripts/backfill-customer-phone-fast.ts --apply    # aplica (gated)
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { phoneMatchKey } from "@/lib/lead-phone-match";

const APPLY = process.argv.includes("--apply");
const PAGE = 1000;

interface Row {
  id: string;
  phone: string | null;
  phone2: string | null;
  phoneNormalized: string | null;
  phone2Normalized: string | null;
}

async function main(): Promise<void> {
  console.log(
    `\n=== BACKFILL FAST Customer.phoneNormalized — modo: ${APPLY ? "APPLY (ESCREVE)" : "DRY-RUN"} ===\n`,
  );

  let cursor: string | undefined;
  let scanned = 0;
  let toUpdate = 0;
  let written = 0;

  for (;;) {
    const batch: Row[] = await prisma.customer.findMany({
      where: { deletedAt: null, anonymizedAt: null },
      select: { id: true, phone: true, phone2: true, phoneNormalized: true, phone2Normalized: true },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    // Computa as chaves e seleciona só quem precisa mudar.
    const changes = batch
      .map((c) => {
        scanned++;
        const k1 = phoneMatchKey(c.phone);
        const k2 = phoneMatchKey(c.phone2);
        const needs = k1 !== c.phoneNormalized || k2 !== c.phone2Normalized;
        return needs ? { id: c.id, k1, k2 } : null;
      })
      .filter((x): x is { id: string; k1: string | null; k2: string | null } => x !== null);

    toUpdate += changes.length;

    if (APPLY && changes.length > 0) {
      // UPDATE em lote: 1 round-trip por batch (CASE por id).
      const ids = changes.map((c) => c.id);
      const case1 = Prisma.join(
        changes.map((c) => Prisma.sql`WHEN ${c.id} THEN ${c.k1}`),
        " ",
      );
      const case2 = Prisma.join(
        changes.map((c) => Prisma.sql`WHEN ${c.id} THEN ${c.k2}`),
        " ",
      );
      await prisma.$executeRaw`
        UPDATE "Customer" SET
          "phoneNormalized"  = CASE "id" ${case1} END,
          "phone2Normalized" = CASE "id" ${case2} END
        WHERE "id" IN (${Prisma.join(ids)})
      `;
      written += changes.length;
    }

    process.stdout.write(`  ...escaneados ${scanned} | a atualizar ${toUpdate} | escritos ${written}\r`);
  }

  console.log(`\n\nResumo:`);
  console.log(`  clientes escaneados (ativos):  ${scanned}`);
  console.log(`  precisam atualizar a chave:     ${toUpdate}`);
  console.log(`  ${APPLY ? "ATUALIZADOS" : "atualizaria (dry-run)"}: ${APPLY ? written : toUpdate}`);
  if (!APPLY) console.log(`\n  (dry-run — nada foi escrito.)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
