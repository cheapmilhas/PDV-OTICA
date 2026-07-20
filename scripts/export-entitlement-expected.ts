/**
 * Reconciliação Fase 5 (lado VIS) — exporta os entitlements ESPERADOS de cada
 * Company VIS_MEDICAL vinculada, para cruzar com os mirrors do Domus. Read-only:
 * NÃO envia nada, NÃO muda nada. Só imprime o que o Vis considera verdade.
 *
 * O comparador é LOCAL: rode este no Vis, o `export-vis-mirrors.cjs` no Domus, e
 * compare os dois JSONs (NÃO por credencial cruzada de banco). Chave = domusClinicId.
 *
 * USO:
 *   npx tsx scripts/export-entitlement-expected.ts > /tmp/vis-expected.json
 */
import { PrismaClient } from "@prisma/client";
import { buildEntitlementPayload } from "@/lib/vis-domus-publisher";

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({
    where: { platformProduct: "VIS_MEDICAL", domusClinicId: { not: null } },
    select: { id: true, domusClinicId: true },
  });

  const expected = [];
  for (const c of companies) {
    const payload = await buildEntitlementPayload(c.id, new Date());
    if (!payload) continue;
    expected.push({
      domusClinicId: payload.domusClinicId,
      visCompanyId: payload.visCompanyId,
      version: payload.version,
      tier: payload.version === 2 ? payload.plan.tier : null,
      sourceRevision: payload.sourceRevision ?? null,
      writeAllowed: payload.entitlement.writeAllowed,
      reason: payload.entitlement.reason,
    });
  }

  // Ordena por domusClinicId pra diff estável.
  expected.sort((a, b) => a.domusClinicId.localeCompare(b.domusClinicId));
  console.log(JSON.stringify({ count: expected.length, entitlements: expected }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
