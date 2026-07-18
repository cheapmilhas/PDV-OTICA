/**
 * Leitura SOMENTE-LEITURA do estado da Company VIS_MEDICAL no Vis (Sprint 1 T1.6).
 *
 * Serve pra diagnosticar por que o publisher não mandou o webhook: ele só publica
 * se a Company é VIS_MEDICAL, tem domusClinicId não-nulo, e checkSubscription roda.
 * Mostra os campos que buildEntitlementPayload lê + o estado da assinatura.
 *
 * Não escreve nada. Uso: node scripts/read-medical-company-state.cjs
 */
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

async function main() {
  const p = new PrismaClient();

  const companies = await p.company.findMany({
    where: { platformProduct: "VIS_MEDICAL" },
    select: {
      id: true,
      name: true,
      platformProduct: true,
      domusClinicId: true,
      isBlocked: true,
      blockedReason: true,
      accessEnabled: true,
      updatedAt: true,
    },
  });

  console.log("### Company VIS_MEDICAL");
  console.log(JSON.stringify(companies, null, 1));

  for (const c of companies) {
    const sub = await p.subscription.findFirst({
      where: { companyId: c.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, updatedAt: true, plan: { select: { name: true } } },
    });
    console.log(`\n### Subscription mais recente de ${c.name} (${c.id})`);
    console.log(JSON.stringify(sub, null, 1));
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
