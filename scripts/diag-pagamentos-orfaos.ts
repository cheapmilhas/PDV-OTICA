/**
 * DIAGNÓSTICO (somente leitura) — quantos pagamentos de Conta a Pagar ficaram
 * com lançamento SEM financeAccountId (não debitaram saldo)?
 *
 * Hipótese: são todos anteriores à correção C1 (2026-06-04 22:53), quando o
 * financeAccountId ainda era opcional. NÃO altera nada.
 *
 * Uso: npx tsx scripts/diag-pagamentos-orfaos.ts
 */
import { prisma } from "../src/lib/prisma";

const C1_DATE = new Date("2026-06-04T22:53:18-03:00");

async function main() {
  console.log(`\n=== PAGAMENTOS DE CONTA A PAGAR SEM CONTA DE SAÍDA ===`);
  console.log(`(lançamento EXPENSE/DEBIT de AccountPayable com financeAccountId nulo)\n`);

  // Todos os lançamentos de despesa de contas a pagar SEM conta de saída.
  const orfaos = await prisma.financeEntry.findMany({
    where: {
      sourceType: "AccountPayable",
      type: "EXPENSE",
      side: "DEBIT",
      financeAccountId: null,
    },
    select: {
      id: true,
      companyId: true,
      amount: true,
      entryDate: true,
      sourceId: true,
      description: true,
    },
    orderBy: { entryDate: "asc" },
  });

  if (orfaos.length === 0) {
    console.log("✅ Nenhum lançamento órfão encontrado. Tudo aponta conta de saída.\n");
    return;
  }

  let antesDaC1 = 0;
  let depoisDaC1 = 0;
  let somaTotal = 0;

  for (const e of orfaos) {
    const antes = e.entryDate < C1_DATE;
    if (antes) antesDaC1++;
    else depoisDaC1++;
    somaTotal += Number(e.amount);

    console.log(
      `${antes ? "🕐 ANTES C1" : "⚠️  DEPOIS C1"}  ${e.entryDate.toISOString()}  ` +
      `R$ ${Number(e.amount).toFixed(2).padStart(9)}  emp ${e.companyId}  ${e.description ?? ""}`
    );
  }

  console.log(`\n────────────────────────────────────────────────────────`);
  console.log(`Total de lançamentos órfãos: ${orfaos.length}`);
  console.log(`  • ANTES da C1 (04/06 22:53): ${antesDaC1}  → esperado (dado legado)`);
  console.log(`  • DEPOIS da C1:              ${depoisDaC1}  → ${depoisDaC1 > 0 ? "🔴 INVESTIGAR (correção não pegou?)" : "✅ nenhum (correção funcionou)"}`);
  console.log(`  • Soma dos valores:          R$ ${somaTotal.toFixed(2)}`);
  console.log(`\nLEITURA:`);
  console.log(`• Se TODOS são ANTES da C1 → é só dado legado. O código atual já`);
  console.log(`  exige conta de saída; nenhum pagamento novo cai nesse buraco.`);
  console.log(`• Se houver algum DEPOIS da C1 → a correção tem uma brecha a investigar.\n`);
}

main()
  .catch((e) => {
    console.error("Erro no diagnóstico:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
