import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Definição canônica dos 4 planos (fonte única de verdade no banco).
// priceMonthly/priceYearly em CENTAVOS. highlightFeatures é Json (array de strings).
const PLANS = [
  {
    slug: "basico",
    name: "Básico",
    status: "ACTIVE",
    isActive: true,
    isFeatured: true,
    priceMonthly: 14990,
    priceYearly: 149900,
    trialDays: 14,
    sortOrder: 1,
    maxUsers: 3,
    maxBranches: 1,
    maxProducts: 500,
    description:
      "Tudo que sua ótica precisa para vender e gerenciar o dia a dia.",
    highlightFeatures: [
      "PDV completo (vendas, código de barras, descontos, aprovação de gerente)",
      "Orçamentos (criar, imprimir, converter em venda)",
      "Ordem de Serviço com Kanban (garantia, retrabalho, erro médico)",
      "Leitura de receita por IA (OCR automático)",
      "Clientes + lembretes (aniversário, pós-venda, troca de receita)",
      "Estoque (entrada, saída, ajuste, histórico)",
      "Caixa (abrir/fechar, sangria, reforço, histórico)",
      "Relatórios em tempo real (vendas, estoque, contas a pagar/receber, comissões)",
      "Cashback",
      "Laboratórios e fornecedores",
      "Links de WhatsApp para falar com o cliente",
      "Permissões por usuário",
      "Suporte via chamado",
      "Acesso mobile",
    ],
  },
  {
    slug: "basico-nf",
    name: "Básico + Emissão de NF",
    status: "COMING_SOON",
    isActive: true,
    isFeatured: false,
    priceMonthly: 18990,
    priceYearly: 0,
    trialDays: 14,
    sortOrder: 2,
    maxUsers: 3,
    maxBranches: 1,
    maxProducts: 500,
    description: "Todo o Básico, com emissão de nota fiscal direto do sistema.",
    highlightFeatures: [
      "Tudo do Básico",
      "Emissão de NFC-e/NF-e integrada",
    ],
  },
  {
    slug: "profissional",
    name: "Profissional",
    status: "COMING_SOON",
    isActive: true,
    isFeatured: false,
    priceMonthly: 0,
    priceYearly: 0,
    trialDays: 14,
    sortOrder: 3,
    maxUsers: 5,
    maxBranches: 1,
    maxProducts: 2000,
    description:
      "Gestão financeira completa para crescer com controle total.",
    highlightFeatures: [
      "Tudo do Básico + NF",
      "Módulo financeiro avançado: DRE, Fluxo de Caixa, Conciliação Bancária, BI, Cartões/Recebíveis, Metas, Lotes FIFO e mais",
    ],
  },
  {
    slug: "rede",
    name: "Rede / Multi-loja",
    status: "COMING_SOON",
    isActive: true,
    isFeatured: false,
    priceMonthly: 0,
    priceYearly: 0,
    trialDays: 14,
    sortOrder: 4,
    maxUsers: 999,
    maxBranches: 999,
    maxProducts: 99999,
    description: "Para redes com várias lojas e visão consolidada.",
    highlightFeatures: [
      "Tudo do Profissional",
      "Múltiplas filiais, transferências entre lojas, comparativo de lojas, usuários ilimitados",
    ],
  },
];

async function seedPlans() {
  console.log("🌱 Criando/atualizando planos...");

  for (const p of PLANS) {
    await prisma.plan.upsert({
      where: { slug: p.slug },
      update: p,
      create: p,
    });
    console.log(`   ✓ ${p.name} (${p.slug}) — ${p.status}`);
  }

  // Desativa qualquer plano legado (ex.: "enterprise") que vazaria na landing,
  // pois /api/public/plans filtra isActive:true. Não apagamos Plans para
  // preservar Subscriptions de empresas que já assinam.
  const keep = ["basico", "basico-nf", "profissional", "rede"];
  const deactivated = await prisma.plan.updateMany({
    where: { slug: { notIn: keep } },
    data: { isActive: false },
  });
  if (deactivated.count > 0) {
    console.log(`   ✓ ${deactivated.count} plano(s) legado(s) desativado(s)`);
  }

  console.log("✅ Planos sincronizados.");
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
