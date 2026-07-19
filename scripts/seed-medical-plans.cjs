/**
 * Fase 1 (emissao de tiers) — cria/classifica os planos Medical.
 *
 * Cria os 2 planos comerciais Medical (Profissional / Clinica) e classifica o
 * interno-domus. Idempotente por slug (upsert) — roda quantas vezes precisar.
 *
 * Precos em CENTAVOS (Plan.priceMonthly/priceYearly sao Int). Anual = 10x o
 * mensal (2 meses gratis, decisao do dono).
 *
 * Depende da migracao 20260719120000_plan_tier_medical (colunas platformProduct,
 * tier, selfServiceSelectable). Rodar DEPOIS de `prisma migrate deploy`.
 *
 * Uso: node scripts/seed-medical-plans.cjs
 */
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const PLANS = [
  {
    slug: "medical-profissional",
    name: "Profissional",
    description: "Plano para 1 profissional. Prontuario, agenda, receitas, exames e atestados.",
    priceMonthly: 8990,   // R$ 89,90
    priceYearly: 89900,   // R$ 899,00 (10x)
    tier: "specialist",
    selfServiceSelectable: true,
    sortOrder: 10,
  },
  {
    slug: "medical-clinica",
    name: "Clinica",
    description: "Plano completo para clinica. Tudo do Profissional + estetica, convenios, comissoes e relatorios.",
    priceMonthly: 18990,  // R$ 189,90
    priceYearly: 189900,  // R$ 1.899,00 (10x)
    tier: "clinic_full",
    selfServiceSelectable: true,
    sortOrder: 11,
  },
];

async function main() {
  const p = new PrismaClient();
  try {
    for (const plan of PLANS) {
      const res = await p.plan.upsert({
        where: { slug: plan.slug },
        create: {
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          priceMonthly: plan.priceMonthly,
          priceYearly: plan.priceYearly,
          status: "ACTIVE",
          isActive: true,
          isFeatured: false,
          trialDays: 14,
          sortOrder: plan.sortOrder,
          platformProduct: "VIS_MEDICAL",
          tier: plan.tier,
          selfServiceSelectable: plan.selfServiceSelectable,
        },
        update: {
          // Reclassificacao idempotente: garante produto/tier/self-service
          // corretos mesmo se o plano ja existia sem eles.
          platformProduct: "VIS_MEDICAL",
          tier: plan.tier,
          selfServiceSelectable: plan.selfServiceSelectable,
        },
        select: { id: true, slug: true, tier: true, priceMonthly: true, selfServiceSelectable: true },
      });
      console.log("OK:", JSON.stringify(res));
    }

    // Classifica o interno-domus (existe, R$0): Medical, clinic_full, NAO self-service.
    const interno = await p.plan.findUnique({ where: { slug: "interno-domus" } });
    if (interno) {
      const upd = await p.plan.update({
        where: { slug: "interno-domus" },
        data: { platformProduct: "VIS_MEDICAL", tier: "clinic_full", selfServiceSelectable: false },
        select: { id: true, slug: true, tier: true, selfServiceSelectable: true },
      });
      console.log("interno-domus classificado:", JSON.stringify(upd));
    } else {
      console.log("interno-domus nao encontrado (ok se ainda nao criado).");
    }
  } catch (e) {
    console.error("ERRO:", e);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
}

main();
