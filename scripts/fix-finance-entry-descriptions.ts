/**
 * Corrige descrições de lançamentos que usam nomes técnicos de enum.
 * Substitui STORE_CREDIT → Crediário, CASH → Dinheiro, etc.
 *
 * Uso: npx tsx scripts/fix-finance-entry-descriptions.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REPLACEMENTS: [string, string][] = [
  ["Pagamento STORE_CREDIT", "Pagamento Crediário"],
  ["Pagamento CASH", "Pagamento Dinheiro"],
  ["Pagamento PIX", "Pagamento PIX"], // já correto, skip
  ["Pagamento CREDIT_CARD", "Pagamento Cartão de Crédito"],
  ["Pagamento DEBIT_CARD", "Pagamento Cartão de Débito"],
  ["Pagamento BANK_TRANSFER", "Pagamento Transferência Bancária"],
  ["Pagamento OTHER", "Pagamento Outro"],
];

async function main() {
  console.log("=== Corrigindo descrições de lançamentos ===\n");

  let totalFixed = 0;

  for (const [oldText, newText] of REPLACEMENTS) {
    if (oldText === newText) continue;

    const entries = await prisma.financeEntry.findMany({
      where: { description: { contains: oldText } },
      select: { id: true, description: true },
    });

    for (const entry of entries) {
      if (entry.description) {
        await prisma.financeEntry.update({
          where: { id: entry.id },
          data: { description: entry.description.replace(oldText, newText) },
        });
        totalFixed++;
      }
    }

    if (entries.length > 0) {
      console.log(`  "${oldText}" → "${newText}": ${entries.length} lançamentos`);
    }
  }

  console.log(`\nTotal corrigidos: ${totalFixed}`);
  console.log("Concluído!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
