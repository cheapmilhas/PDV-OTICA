/**
 * Task 2 (T1.2) — vincula a Company VIS_MEDICAL à clínica real do Domus.
 *
 * A clínica real é `7110db1b` (Domus Saude, 116 pacientes). NUNCA vincular por
 * nome: existem 2 clínicas homônimas vazias no Domus. Os bancos são separados,
 * então este é o lado Vis de um vínculo 1:1 mantido por aplicação.
 *
 * Idempotente: se já vinculado ao id certo, sucesso e sai.
 * Uso: node scripts/link-domus-clinic.cjs
 */
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const DOMUS_CLINIC_ID = "7110db1b-528b-4451-a2c4-3581f370b9df"; // Domus Saude, 116 pacientes

async function main() {
  const p = new PrismaClient();

  // Idempotente: já está vinculado ao id certo?
  const jaOk = await p.$queryRawUnsafe(
    `SELECT id FROM "Company" WHERE "platformProduct"='VIS_MEDICAL' AND "domusClinicId"=$1::uuid`,
    DOMUS_CLINIC_ID,
  );
  if (jaOk.length === 1) {
    console.log("JÁ VINCULADO (idempotente):", jaOk[0].id);
    await p.$disconnect();
    return;
  }

  const alvo = await p.$queryRawUnsafe(
    `SELECT id, name FROM "Company"
      WHERE "platformProduct"='VIS_MEDICAL' AND "domusClinicId" IS NULL
        AND id <> 'vismed-dev-company'`,  // NUNCA vincular a casca de teste à clínica real
  );
  if (alvo.length !== 1) {
    console.error(
      "ABORTADO: esperava exatamente 1 Company VIS_MEDICAL real sem vínculo, achei",
      alvo.length, JSON.stringify(alvo),
      "\n(Se a casca 'vismed-dev-company' ainda existe, exclua-a pela UI antes.)",
    );
    process.exit(1);
  }
  const companyId = alvo[0].id;

  // Guarda: ninguém mais pode já apontar para essa clínica.
  const dup = await p.$queryRawUnsafe(
    `SELECT id FROM "Company" WHERE "domusClinicId"=$1::uuid`, DOMUS_CLINIC_ID);
  if (dup.length) {
    console.error("ABORTADO: clínica já vinculada a", JSON.stringify(dup));
    process.exit(1);
  }

  await p.$executeRawUnsafe(
    `UPDATE "Company" SET "domusClinicId"=$1::uuid WHERE id=$2`, DOMUS_CLINIC_ID, companyId);

  const check = await p.$queryRawUnsafe(
    `SELECT id, name, "domusClinicId" FROM "Company" WHERE id=$1`, companyId);
  console.log("VINCULADO:", JSON.stringify(check[0]));
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
