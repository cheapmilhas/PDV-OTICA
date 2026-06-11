import { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

/**
 * Próximo número de fatura do SaaS, GLOBALMENTE único e atômico (sem race).
 * Usa a tabela dedicada `SaasCounter` (sem FK de Company) com
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING — mesma semântica atômica do
 * `getNextSequence`, mas sem amarrar a uma Company. Ver decisão no topo do plano.
 */
export async function nextSaasInvoiceNumber(
  client: Pick<typeof defaultPrisma, "$queryRaw"> = defaultPrisma
): Promise<string> {
  const rows = await client.$queryRaw<{ value: number }[]>(Prisma.sql`
    INSERT INTO "SaasCounter" ("key", "value") VALUES ('invoice', 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "SaasCounter"."value" + 1
    RETURNING "value"
  `);
  return `INV-${String(rows[0].value).padStart(6, "0")}`;
}
