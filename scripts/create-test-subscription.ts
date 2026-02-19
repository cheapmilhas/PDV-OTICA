import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!company) {
    console.log("❌ Nenhuma empresa encontrada");
    return;
  }

  console.log(`📋 Empresa: ${company.name} (${company.id})`);

  const plan = await prisma.plan.findUnique({ where: { slug: "profissional" } });

  if (!plan) {
    console.log("❌ Plano 'profissional' não encontrado. Rode npm run db:seed:plans primeiro.");
    return;
  }

  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);

  const existing = await prisma.subscription.findFirst({ where: { companyId: company.id } });

  if (existing) {
    console.log(`⚠️  Empresa já tem assinatura (${existing.status})`);
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: "TRIAL",
        trialStartedAt: new Date(),
        trialEndsAt: trialEnds,
        planId: plan.id,
      },
    });
    console.log(`✅ Assinatura atualizada para TRIAL (expira em 14 dias: ${trialEnds.toLocaleDateString("pt-BR")})`);
    return;
  }

  const subscription = await prisma.subscription.create({
    data: {
      companyId: company.id,
      planId: plan.id,
      status: "TRIAL",
      trialStartedAt: new Date(),
      trialEndsAt: trialEnds,
      billingCycle: "MONTHLY",
    },
  });

  console.log(`✅ Assinatura criada:`);
  console.log(`   - ID: ${subscription.id}`);
  console.log(`   - Status: ${subscription.status}`);
  console.log(`   - Plano: ${plan.name}`);
  console.log(`   - Trial expira: ${trialEnds.toLocaleDateString("pt-BR")}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
