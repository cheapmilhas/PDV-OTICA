/**
 * Backfill de entitlement v2 (Fase 5) — força o republish v2 de cada Company
 * VIS_MEDICAL vinculada, para propagar o `plan.tier` + `sourceRevision` atuais ao
 * Domus. O publisher normal só publica quando algo muda (block/unblock/change_plan);
 * este script empurra o estado ATUAL uma vez, mesmo sem mudança.
 *
 * ⚠️ Toca o Domus de PRODUÇÃO: envia webhook de entitlement (NÃO move dinheiro,
 *    NÃO muda cobrança). O Domus grava o mirror. Rode com cuidado.
 *
 * SEGURANÇA:
 *   - DRY-RUN é o padrão (sem `--apply` só lista o que publicaria, não envia).
 *   - `--apply` publica de verdade (awaited, coletando o resultado de cada uma).
 *   - Sempre restrito a Company VIS_MEDICAL com domusClinicId (o publisher já
 *     retorna null para o resto; aqui nem entram na lista).
 *
 * USO:
 *   # dry-run (não envia nada, só lista):
 *   npx tsx scripts/backfill-entitlement-v2.ts
 *
 *   # publicar de verdade:
 *   npx tsx scripts/backfill-entitlement-v2.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { publishEntitlementForCompany, buildEntitlementPayload } from "@/lib/vis-domus-publisher";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODO: APPLY (publica de verdade)" : "MODO: DRY-RUN (não envia)\n");

  const companies = await prisma.company.findMany({
    where: { platformProduct: "VIS_MEDICAL", domusClinicId: { not: null } },
    select: { id: true, domusClinicId: true },
  });
  console.log(`Companies VIS_MEDICAL vinculadas: ${companies.length}\n`);

  let ok = 0;
  let skipped = 0;
  for (const c of companies) {
    const payload = await buildEntitlementPayload(c.id, new Date());
    if (!payload) {
      console.log(`- ${c.id} → SEM PAYLOAD (não medical/vínculo?) — pulado`);
      skipped++;
      continue;
    }
    const tier = payload.version === 2 ? payload.plan.tier : "(v1, sem tier)";
    const rev = payload.sourceRevision ?? "(sem revision)";
    console.log(
      `- ${c.id} → v${payload.version} tier=${tier} rev=${rev} clinic=${payload.domusClinicId} writeAllowed=${payload.entitlement.writeAllowed}`,
    );

    if (apply) {
      await publishEntitlementForCompany(c.id); // best-effort; loga internamente se falhar
      ok++;
    }
  }

  console.log(
    apply
      ? `\n✓ Publicadas ${ok} (puladas ${skipped}). Verifique os mirrors no Domus (reconciliação).`
      : `\nDry-run. ${companies.length - skipped} publicariam. Rode com --apply para enviar.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
