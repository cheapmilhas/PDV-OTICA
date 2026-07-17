/**
 * T0.4 — Purga o resíduo clínico da empresa de teste vismed-dev-company.
 *
 * O restore do incidente de 17/07 ressuscitou o seed clínico que a sessão de
 * 16/07 havia apagado. Este script refaz a limpeza — desta vez com cuidado:
 * transação, filtro RÍGIDO por companyId, e verificação de que NENHUM dado de
 * outro tenant é tocado (as óticas têm 343 CustomerAccessLog que ficam intactos).
 *
 * NÃO apaga a empresa em si — isso é pela UI /admin/clientes (86 FKs; a UI faz
 * a cascata na ordem certa com auditoria). Este script só limpa o clínico.
 *
 * Ordem de deleção respeita FK (filho antes do pai).
 * Uso: node scripts/purge-vismed-clinical.cjs
 */
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const COMPANY = "vismed-dev-company";

async function main() {
  const prisma = new PrismaClient();

  // Guarda de segurança: a empresa-alvo tem que ser VIS_MEDICAL de teste.
  const alvo = await prisma.$queryRawUnsafe(
    `SELECT id, name, "platformProduct" FROM "Company" WHERE id = $1`,
    COMPANY,
  );
  if (alvo.length !== 1 || alvo[0].platformProduct !== "VIS_MEDICAL") {
    console.error("ABORTADO: empresa-alvo não é VIS_MEDICAL ou não existe:", alvo);
    process.exit(1);
  }
  console.log("alvo:", alvo[0].name, `(${alvo[0].platformProduct})`);

  // Preflight (achados do Codex, provados no banco): abortar se surgir QUALQUER
  // vínculo cross-tenant ou com venda/OS real. As FKs clínicas referenciam só
  // `id`, então um SET NULL/CASCADE tocaria outro tenant se o vínculo existisse.
  const preflight = await prisma.$queryRawUnsafe(
    `SELECT
       (SELECT count(*)::int FROM "Prescription"
          WHERE "companyId"=$1 AND origin='CLINICAL'
            AND ("saleId" IS NOT NULL OR "serviceOrderId" IS NOT NULL))            AS presc_com_venda,
       (SELECT count(*)::int FROM "ServiceOrder" so JOIN "Prescription" p ON so."prescriptionId"=p.id
          WHERE p."companyId"=$1 AND p.origin='CLINICAL')                          AS so_aponta_presc,
       (SELECT count(*)::int FROM "RefractionExam" re JOIN "Encounter" e ON re."encounterId"=e.id
          WHERE e."companyId"=$1 AND re."companyId"<>$1)                           AS re_cross_tenant,
       (SELECT count(*)::int FROM "Prescription" pr JOIN "RefractionExam" re ON pr."refractionExamId"=re.id
          WHERE re."companyId"=$1 AND pr."companyId"<>$1)                          AS presc_cross_re`,
    COMPANY,
  );
  const pf = preflight[0];
  const bloqueio = Object.entries(pf).filter(([, v]) => v > 0);
  if (bloqueio.length) {
    console.error("ABORTADO: vínculo que exige revisão humana:", JSON.stringify(pf));
    process.exit(1);
  }
  console.log("preflight OK (sem vínculo com venda/OS nem cross-tenant):", JSON.stringify(pf));

  const outrosAntes = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM "CustomerAccessLog" WHERE "companyId" <> $1`,
    COMPANY,
  );

  const results = await prisma.$transaction(async (tx) => {
    // Filho → pai. Prescription CLINICAL primeiro pelos values.
    const r = {};

    const clinicalPresc = await tx.$queryRawUnsafe(
      `SELECT id FROM "Prescription" WHERE "companyId" = $1 AND origin = 'CLINICAL'`,
      COMPANY,
    );
    const presIds = clinicalPresc.map((p) => p.id);

    if (presIds.length) {
      r.prescriptionValues = await tx.$executeRawUnsafe(
        `DELETE FROM "PrescriptionValues" WHERE "prescriptionId" = ANY($1::text[])`,
        presIds,
      );
    }

    r.medicalCertificate = await tx.$executeRawUnsafe(
      `DELETE FROM "MedicalCertificate" WHERE "companyId" = $1`, COMPANY);
    r.refractionExam = await tx.$executeRawUnsafe(
      `DELETE FROM "RefractionExam" WHERE "companyId" = $1`, COMPANY);
    r.encounter = await tx.$executeRawUnsafe(
      `DELETE FROM "Encounter" WHERE "companyId" = $1`, COMPANY);
    r.clinicalAppointment = await tx.$executeRawUnsafe(
      `DELETE FROM "ClinicalAppointment" WHERE "companyId" = $1`, COMPANY);
    r.prescriptionClinical = await tx.$executeRawUnsafe(
      `DELETE FROM "Prescription" WHERE "companyId" = $1 AND origin = 'CLINICAL'`, COMPANY);
    r.customerAccessLog = await tx.$executeRawUnsafe(
      `DELETE FROM "CustomerAccessLog" WHERE "companyId" = $1`, COMPANY);

    // Invariante DENTRO da transação: nenhum log de outro tenant tocado.
    const outrosDepois = await tx.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "CustomerAccessLog" WHERE "companyId" <> $1`,
      COMPANY,
    );
    if (outrosDepois[0].n !== outrosAntes[0].n) {
      throw new Error(
        `ABORTO: CustomerAccessLog de outros tenants mudou ${outrosAntes[0].n} → ${outrosDepois[0].n}`,
      );
    }
    return r;
  });

  console.log("\nDELETADO:");
  for (const [k, v] of Object.entries(results)) console.log(`  ${k}: ${v}`);

  // Verificação FORA da transação.
  const rest = await prisma.$queryRawUnsafe(
    `SELECT
       (SELECT count(*)::int FROM "Encounter" WHERE "companyId"=$1) AS enc,
       (SELECT count(*)::int FROM "Prescription" WHERE "companyId"=$1 AND origin='CLINICAL') AS presc,
       (SELECT count(*)::int FROM "CustomerAccessLog" WHERE "companyId"<>$1) AS outros_logs`,
    COMPANY,
  );
  console.log("\nPÓS-PURGA:", JSON.stringify(rest[0]),
    "\n  (enc/presc devem ser 0; outros_logs deve continuar", outrosAntes[0].n + ")");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
