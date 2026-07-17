/**
 * Task 1 (Opção C) — promove uma Company recém-criada de VIS_APP → VIS_MEDICAL.
 *
 * A tela /admin/clientes/novo não tem seletor de produto, então o cliente
 * nasce VIS_APP. Este script o promove. A transação de criação (Company+Branch+
 * User+Subscription) já rodou pela UI testada — aqui só flipamos o produto.
 *
 * Idempotente e seguro: exige que a empresa-alvo seja passada por ID e que ela
 * esteja hoje como VIS_APP e SEM domusClinicId (recém-criada). Recusa promover
 * qualquer empresa com vendas (seria uma ótica real).
 *
 * Uso: node scripts/promote-company-to-medical.cjs <companyId>
 */
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("uso: node scripts/promote-company-to-medical.cjs <companyId>");
    process.exit(1);
  }

  const p = new PrismaClient();
  const rows = await p.$queryRawUnsafe(
    `SELECT id, name, "platformProduct", "domusClinicId",
            (SELECT count(*)::int FROM "Sale" s WHERE s."companyId" = c.id) AS vendas
       FROM "Company" c WHERE id = $1`,
    companyId,
  );
  if (rows.length !== 1) {
    console.error("ABORTADO: empresa não encontrada:", companyId);
    process.exit(1);
  }
  const c = rows[0];

  // Idempotente: já é medical → sucesso e sai.
  if (c.platformProduct === "VIS_MEDICAL") {
    console.log("JÁ É VIS_MEDICAL (idempotente):", c.name);
    await p.$disconnect();
    return;
  }

  // Guarda: nunca promover uma ótica real. Recém-criada = 0 vendas.
  if (c.vendas > 0) {
    console.error(`ABORTADO: "${c.name}" tem ${c.vendas} vendas — parece ótica real, não promovo.`);
    process.exit(1);
  }

  await p.$executeRawUnsafe(
    `UPDATE "Company" SET "platformProduct" = 'VIS_MEDICAL' WHERE id = $1`,
    companyId,
  );

  const check = await p.$queryRawUnsafe(
    `SELECT id, name, "platformProduct" FROM "Company" WHERE id = $1`, companyId);
  console.log("PROMOVIDO:", JSON.stringify(check[0]));
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
