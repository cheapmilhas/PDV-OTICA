import { PrismaClient } from "@prisma/client";
import { generateSaleEntries } from "../src/services/finance-entry.service";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("Nenhuma empresa encontrada");

  console.log("Gerando entries retroativos para vendas reais...\n");

  const sales = await prisma.sale.findMany({
    where: { companyId: company.id, status: "COMPLETED" },
    select: { id: true, total: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`${sales.length} vendas COMPLETED encontradas\n`);

  let success = 0;
  let errors = 0;

  for (const sale of sales) {
    // Verificar se ja tem entries (idempotencia)
    const existing = await prisma.financeEntry.count({
      where: {
        companyId: company.id,
        sourceType: "Sale",
        sourceId: sale.id,
      },
    });

    if (existing > 0) {
      console.log(
        `  >> Venda ${sale.id.slice(0, 8)} ja tem ${existing} entries`
      );
      continue;
    }

    try {
      await prisma.$transaction(
        async (tx) => {
          await generateSaleEntries(tx as any, sale.id, company.id);
        },
        { maxWait: 30000, timeout: 60000 }
      );
      console.log(
        `  OK Venda ${sale.id.slice(0, 8)} - R$ ${sale.total?.toString()} - ${sale.createdAt.toLocaleDateString("pt-BR")}`
      );
      success++;
    } catch (err: any) {
      console.error(
        `  ERRO Venda ${sale.id.slice(0, 8)}: ${err.message}`
      );
      errors++;
    }
  }

  console.log(`\nResultado: ${success} OK, ${errors} erros`);

  const totalEntries = await prisma.financeEntry.count({
    where: { companyId: company.id },
  });
  console.log(`Total entries reais: ${totalEntries}`);

  // Mostrar entries por tipo
  const byType = await prisma.financeEntry.groupBy({
    by: ["type", "side"],
    where: { companyId: company.id },
    _sum: { amount: true },
    _count: true,
  });
  console.log("\nEntries por tipo:");
  byType.forEach((t) =>
    console.log(
      `  ${t.type} (${t.side}) | count: ${t._count} | soma: R$ ${Number(t._sum.amount || 0).toFixed(2)}`
    )
  );

  // Mostrar balances das contas
  const accounts = await prisma.financeAccount.findMany({
    where: { companyId: company.id },
    select: { name: true, type: true, balance: true },
  });
  console.log("\nBalances das contas:");
  accounts.forEach((a) =>
    console.log(`  ${a.name} (${a.type}): R$ ${Number(a.balance).toFixed(2)}`)
  );

  await prisma.$disconnect();
}

main().catch(console.error);
