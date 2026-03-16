/**
 * Script retroativo — Correção Sprint 1 C4
 *
 * Corrige lançamentos contábeis de vendas pagas com STORE_CREDIT (crediário)
 * que foram debitados na conta errada (1.1.02 Bancos → 1.1.03 Contas a Receber).
 *
 * Também remove cashDate dos pagamentos STORE_CREDIT (dinheiro não entrou no caixa).
 *
 * Uso: npx tsx scripts/fix-store-credit-entries.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Correção retroativa: STORE_CREDIT entries ===\n");

  // 1. Buscar todos os SalePayments com método STORE_CREDIT
  const storeCreditPayments = await prisma.salePayment.findMany({
    where: { method: "STORE_CREDIT" },
    select: { id: true, amount: true, sale: { select: { id: true, companyId: true } } },
  });

  console.log(`Encontrados ${storeCreditPayments.length} pagamentos STORE_CREDIT\n`);

  let fixedEntries = 0;
  let fixedCashMovements = 0;

  for (const payment of storeCreditPayments) {
    const companyId = payment.sale.companyId;

    // Buscar conta correta (1.1.03 Contas a Receber)
    const contasAReceber = await prisma.chartOfAccounts.findUnique({
      where: { companyId_code: { companyId, code: "1.1.03" } },
    });

    if (!contasAReceber) {
      console.log(`  SKIP: Conta 1.1.03 não encontrada para company ${companyId}`);
      continue;
    }

    // Corrigir FinanceEntry: mudar debitAccountId de Bancos para Contas a Receber
    const entry = await prisma.financeEntry.findFirst({
      where: {
        companyId,
        sourceType: "SalePayment",
        sourceId: payment.id,
        type: "PAYMENT_RECEIVED",
      },
      include: { debitAccount: { select: { code: true } } },
    });

    if (entry) {
      const currentCode = entry.debitAccount?.code;
      if (currentCode !== "1.1.03") {
        await prisma.financeEntry.update({
          where: { id: entry.id },
          data: {
            debitAccountId: contasAReceber.id,
            cashDate: null, // Crediário não tem cashDate
            description: entry.description + " [Correção retroativa — Sprint 1]",
          },
        });
        console.log(`  FIXED: Entry ${entry.id} | ${currentCode} → 1.1.03 | cashDate → null`);
        fixedEntries++;
      } else {
        console.log(`  OK: Entry ${entry.id} já está em 1.1.03`);
      }

      // Reverter incremento no saldo da FinanceAccount (se foi incrementado errado)
      if (entry.financeAccountId) {
        await prisma.financeAccount.update({
          where: { id: entry.financeAccountId },
          data: { balance: { decrement: Number(entry.amount) } },
        });
        // Remover vínculo com conta financeira
        await prisma.financeEntry.update({
          where: { id: entry.id },
          data: { financeAccountId: null },
        });
        console.log(`  FIXED: Revertido saldo FinanceAccount ${entry.financeAccountId} (-R$${Number(entry.amount)})`);
      }
    }

    // Remover CashMovement de STORE_CREDIT (não deveria existir)
    const cashMovements = await prisma.cashMovement.findMany({
      where: {
        salePaymentId: payment.id,
        method: "STORE_CREDIT",
      },
    });

    for (const cm of cashMovements) {
      await prisma.cashMovement.delete({ where: { id: cm.id } });
      console.log(`  FIXED: CashMovement ${cm.id} deletado (STORE_CREDIT não entra no caixa)`);
      fixedCashMovements++;
    }
  }

  console.log(`\n=== RESULTADO ===`);
  console.log(`FinanceEntries corrigidos: ${fixedEntries}`);
  console.log(`CashMovements removidos: ${fixedCashMovements}`);
  console.log(`\nCorreção retroativa concluída!`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
