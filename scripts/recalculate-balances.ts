import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("Nenhuma empresa encontrada");

  console.log("Recalculando balances das FinanceAccounts...\n");

  // 1. Resetar todos os balances para 0
  await prisma.financeAccount.updateMany({
    where: { companyId: company.id },
    data: { balance: 0 },
  });

  // 2. Buscar todos os entries reais com financeAccountId
  const entries = await prisma.financeEntry.findMany({
    where: {
      companyId: company.id,
      financeAccountId: { not: null },
    },
    select: {
      type: true,
      side: true,
      amount: true,
      financeAccountId: true,
    },
  });

  // 3. Calcular saldo por conta
  const balances = new Map<string, number>();

  for (const entry of entries) {
    const accountId = entry.financeAccountId!;
    const amount = Number(entry.amount);
    const current = balances.get(accountId) || 0;

    // PAYMENT_RECEIVED DEBIT = dinheiro ENTRA na conta
    // PAYMENT_RECEIVED CREDIT = dinheiro SAI (devolvido)
    // CARD_FEE DEBIT = taxa SAI (reduz o saldo do adquirente)
    // EXPENSE DEBIT = despesa SAI da conta
    if (entry.type === "PAYMENT_RECEIVED") {
      if (entry.side === "DEBIT") {
        balances.set(accountId, current + amount);
      } else {
        balances.set(accountId, current - amount);
      }
    } else if (
      entry.type === "CARD_FEE" ||
      entry.type === "EXPENSE" ||
      entry.type === "COMMISSION_EXPENSE"
    ) {
      if (entry.side === "DEBIT") {
        balances.set(accountId, current - amount);
      }
    }
  }

  // 4. Atualizar cada conta
  const accounts = await prisma.financeAccount.findMany({
    where: { companyId: company.id },
    select: { id: true, name: true, type: true },
  });

  for (const account of accounts) {
    const newBalance = balances.get(account.id) || 0;
    await prisma.financeAccount.update({
      where: { id: account.id },
      data: { balance: newBalance },
    });
    console.log(
      `  ${account.name} (${account.type}): R$ ${newBalance.toFixed(2)}`
    );
  }

  console.log("\nBalances recalculados com sucesso!");
  await prisma.$disconnect();
}

main().catch(console.error);
