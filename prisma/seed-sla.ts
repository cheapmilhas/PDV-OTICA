import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Criando configurações de SLA...");

  // Limpar configs existentes
  await prisma.slaConfig.deleteMany();

  // Criar configs padrão para cada prioridade
  const configs = await prisma.slaConfig.createMany({
    data: [
      {
        priority: "LOW",
        firstResponseHours: 48,
        resolutionHours: 120, // 5 dias
        notifyAtPercent: [50, 75, 90],
        isActive: true,
      },
      {
        priority: "MEDIUM",
        firstResponseHours: 24,
        resolutionHours: 72, // 3 dias
        notifyAtPercent: [50, 75, 90],
        isActive: true,
      },
      {
        priority: "HIGH",
        firstResponseHours: 8,
        resolutionHours: 24, // 1 dia
        notifyAtPercent: [50, 75, 90],
        isActive: true,
      },
      {
        priority: "URGENT",
        firstResponseHours: 2,
        resolutionHours: 8, // 8 horas
        notifyAtPercent: [50, 75, 90],
        isActive: true,
      },
    ],
  });

  console.log(`✅ ${configs.count} configurações de SLA criadas!`);
  console.log("");
  console.log("Configurações:");
  console.log("  LOW:    48h resposta, 120h (5 dias) resolução");
  console.log("  MEDIUM: 24h resposta, 72h (3 dias) resolução");
  console.log("  HIGH:   8h resposta, 24h (1 dia) resolução");
  console.log("  URGENT: 2h resposta, 8h resolução");
}

main()
  .catch((e) => {
    console.error("❌ Erro ao criar SLA configs:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
