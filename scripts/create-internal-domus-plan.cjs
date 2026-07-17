/**
 * Task 1.1 — cria o Plan interno R$ 0 do cliente nº 1 (Clínica Domus Saúde).
 *
 * Nasce isActive:true (default) — necessário para aparecer na tela de novo
 * cliente. Depois de vincular o cliente, o plano é desativado (Task 1.2b) para
 * sair da landing pública.
 *
 * Idempotente: se o slug já existe, não recria.
 * Uso: node scripts/create-internal-domus-plan.cjs
 */
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const SLUG = "interno-domus";

async function main() {
  const p = new PrismaClient();

  const existing = await p.plan.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log("JÁ EXISTE (idempotente):", existing.id, existing.name,
      `| isActive=${existing.isActive} priceMonthly=${existing.priceMonthly}`);
    await p.$disconnect();
    return;
  }

  const plan = await p.plan.create({
    data: {
      name: "Interno — Domus",
      slug: SLUG,
      description: "Plano interno da Clínica Domus Saúde (cliente nº 1 do Vis Medical). Não pagante.",
      priceMonthly: 0,
      priceYearly: 0,
      status: "ACTIVE",
      isActive: true,   // temporário: some da landing após vincular o cliente (Task 1.2b)
      isFeatured: false,
      trialDays: 0,     // nasce ACTIVE, sem trial
      sortOrder: 999,   // fim da lista
    },
  });

  console.log("CRIADO:", JSON.stringify({
    id: plan.id, name: plan.name, slug: plan.slug,
    priceMonthly: plan.priceMonthly, isActive: plan.isActive,
  }));
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
