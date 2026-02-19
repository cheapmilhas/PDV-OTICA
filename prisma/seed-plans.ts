import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedPlans() {
  console.log("🌱 Criando planos...");

  const basicPlan = await prisma.plan.upsert({
    where: { slug: "basico" },
    update: {},
    create: {
      name: "Básico",
      slug: "basico",
      description: "Ideal para óticas pequenas que estão começando",
      priceMonthly: 14900,
      priceYearly: 149000,
      maxUsers: 3,
      maxBranches: 1,
      maxProducts: 500,
      maxStorageMB: 1000,
      isActive: true,
      isFeatured: false,
      trialDays: 14,
      sortOrder: 1,
      features: {
        create: [
          { key: "vendas", value: "true" },
          { key: "estoque", value: "true" },
          { key: "clientes", value: "true" },
          { key: "relatorios_basicos", value: "true" },
          { key: "suporte_email", value: "true" },
          { key: "whatsapp_integration", value: "false" },
          { key: "api_access", value: "false" },
          { key: "relatorios_avancados", value: "false" },
          { key: "multi_filial", value: "false" },
        ],
      },
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { slug: "profissional" },
    update: {},
    create: {
      name: "Profissional",
      slug: "profissional",
      description: "Para óticas em crescimento que precisam de mais recursos",
      priceMonthly: 29900,
      priceYearly: 299000,
      maxUsers: 10,
      maxBranches: 3,
      maxProducts: 5000,
      maxStorageMB: 10000,
      isActive: true,
      isFeatured: true,
      trialDays: 14,
      sortOrder: 2,
      features: {
        create: [
          { key: "vendas", value: "true" },
          { key: "estoque", value: "true" },
          { key: "clientes", value: "true" },
          { key: "relatorios_basicos", value: "true" },
          { key: "relatorios_avancados", value: "true" },
          { key: "suporte_email", value: "true" },
          { key: "suporte_chat", value: "true" },
          { key: "whatsapp_integration", value: "true" },
          { key: "multi_filial", value: "true" },
          { key: "api_access", value: "false" },
        ],
      },
    },
  });

  const enterprisePlan = await prisma.plan.upsert({
    where: { slug: "enterprise" },
    update: {},
    create: {
      name: "Enterprise",
      slug: "enterprise",
      description: "Para redes de óticas e operações de grande porte",
      priceMonthly: 59900,
      priceYearly: 599000,
      maxUsers: -1,
      maxBranches: -1,
      maxProducts: -1,
      maxStorageMB: 100000,
      isActive: true,
      isFeatured: false,
      trialDays: 14,
      sortOrder: 3,
      features: {
        create: [
          { key: "vendas", value: "true" },
          { key: "estoque", value: "true" },
          { key: "clientes", value: "true" },
          { key: "relatorios_basicos", value: "true" },
          { key: "relatorios_avancados", value: "true" },
          { key: "suporte_email", value: "true" },
          { key: "suporte_chat", value: "true" },
          { key: "suporte_prioritario", value: "true" },
          { key: "suporte_telefone", value: "true" },
          { key: "whatsapp_integration", value: "true" },
          { key: "multi_filial", value: "true" },
          { key: "api_access", value: "true" },
          { key: "webhook_notifications", value: "true" },
          { key: "white_label", value: "true" },
        ],
      },
    },
  });

  console.log("✅ Planos criados:");
  console.log(`   - ${basicPlan.name} (${basicPlan.slug})`);
  console.log(`   - ${proPlan.name} (${proPlan.slug})`);
  console.log(`   - ${enterprisePlan.name} (${enterprisePlan.slug})`);
}

async function seedAdminUser() {
  console.log("🌱 Criando admin user...");

  const admin = await prisma.adminUser.upsert({
    where: { email: "admin@pdvotica.com.br" },
    update: {},
    create: {
      email: "admin@pdvotica.com.br",
      name: "Administrador",
      password: "$2b$10$TM69qjpoU9OfsaXtMvvL9.HK.JjR6WtdaqF.cQ7exVWFab1iXd5d.", // "admin123" - TROCAR EM PRODUÇÃO
      role: "SUPER_ADMIN",
      active: true,
    },
  });

  console.log(`✅ Admin criado: ${admin.email}`);
  console.log("⚠️  IMPORTANTE: Trocar a senha em produção!");
}

async function main() {
  try {
    await seedPlans();
    await seedAdminUser();
    console.log("\n🎉 Seed concluído com sucesso!");
  } catch (error) {
    console.error("❌ Erro no seed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
