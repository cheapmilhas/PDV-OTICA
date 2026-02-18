/**
 * Script de migração: inicializa tabela Counter com os valores máximos
 * de OS existentes por empresa, garantindo que novos números não colidam.
 *
 * Execução: npx tsx prisma/seeds/migrate-counters.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log(`Inicializando counters para ${companies.length} empresa(s)...`);

  for (const company of companies) {
    const maxOs = await prisma.serviceOrder.aggregate({
      where: { companyId: company.id },
      _max: { number: true },
    });

    const maxValue = maxOs._max.number ?? 0;

    await prisma.counter.upsert({
      where: { companyId_key: { companyId: company.id, key: "service_order" } },
      create: { companyId: company.id, key: "service_order", value: maxValue },
      update: { value: { set: maxValue } },
    });

    console.log(`  ${company.name}: counter service_order = ${maxValue}`);
  }

  console.log("✅ Counters inicializados com sucesso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
