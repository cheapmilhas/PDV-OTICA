import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("Nenhuma empresa encontrada");

  console.log("Removendo dados demo...\n");

  // 1. Remover FinanceEntries demo
  const deletedEntries = await prisma.financeEntry.deleteMany({
    where: { companyId: company.id, sourceId: { startsWith: "demo-" } },
  });
  console.log(`  ${deletedEntries.count} FinanceEntries demo removidos`);

  // 2. Remover DailyAgg gerados pelo seed
  const deletedAggs = await prisma.dailyAgg.deleteMany({
    where: { companyId: company.id },
  });
  console.log(`  ${deletedAggs.count} DailyAggs removidos`);

  // 3. Remover InventoryLots demo (invoiceNumber starts with "NF-DEMO")
  const deletedLots = await prisma.inventoryLot.deleteMany({
    where: { companyId: company.id, invoiceNumber: { startsWith: "NF-DEMO" } },
  });
  console.log(`  ${deletedLots.count} InventoryLots demo removidos`);

  // 4. Resetar balance de todas as FinanceAccounts para 0
  const resetAccounts = await prisma.financeAccount.updateMany({
    where: { companyId: company.id },
    data: { balance: 0 },
  });
  console.log(`  ${resetAccounts.count} balances de contas resetados para 0`);

  // Verificacao
  const remaining = await prisma.financeEntry.count({
    where: { companyId: company.id },
  });
  console.log(`\nEntries restantes: ${remaining} (devem ser 0)`);

  const remainingAggs = await prisma.dailyAgg.count({
    where: { companyId: company.id },
  });
  console.log(`DailyAggs restantes: ${remainingAggs} (devem ser 0)`);

  await prisma.$disconnect();
}

main().catch(console.error);
