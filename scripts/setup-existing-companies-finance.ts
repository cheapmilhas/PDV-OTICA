/**
 * Script para configurar o módulo financeiro em todas as empresas existentes.
 * Uso: npx ts-node scripts/setup-existing-companies-finance.ts
 *
 * IDEMPOTENTE — pode rodar múltiplas vezes sem duplicar dados.
 */
import { PrismaClient } from "@prisma/client";
import { setupCompanyFinance } from "../src/services/finance-setup.service";

const prisma = new PrismaClient();

async function main() {
  console.log("🔧 Configurando módulo financeiro para empresas existentes...\n");

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      branches: { select: { id: true }, take: 1 },
    },
  });

  console.log(`📋 ${companies.length} empresa(s) encontrada(s)\n`);

  let success = 0;
  let errors = 0;

  for (const company of companies) {
    try {
      const branchId = company.branches[0]?.id;
      await prisma.$transaction(
        async (tx) => {
          await setupCompanyFinance(tx as any, company.id, branchId);
        },
        { maxWait: 30000, timeout: 60000 }
      );
      console.log(`  ✅ ${company.name} (${company.id})`);
      success++;
    } catch (err) {
      console.error(`  ❌ ${company.name} (${company.id}):`, err);
      errors++;
    }
  }

  console.log(`\n📊 Resultado: ${success} OK, ${errors} erros`);
}

main()
  .catch((e) => {
    console.error("❌ Erro fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
