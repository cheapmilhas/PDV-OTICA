/**
 * DIAGNÓSTICO (somente leitura) — pagamento de Conta a Pagar não debitou o caixa.
 *
 * NÃO altera nada. Só roda SELECTs e imprime um laudo.
 *
 * Uso:
 *   npx tsx scripts/diag-conta-pagar.ts "enel"
 *   (o argumento é um trecho da descrição da conta — ex: "enel", "energia")
 *
 * Para uma empresa específica, passe o companyId como 2º argumento:
 *   npx tsx scripts/diag-conta-pagar.ts "enel" <companyId>
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const termo = (process.argv[2] || "enel").trim();
  const companyId = process.argv[3]?.trim() || undefined;

  console.log(`\n=== DIAGNÓSTICO CONTA A PAGAR ===`);
  console.log(`Buscando contas cuja descrição contém: "${termo}"${companyId ? ` (empresa ${companyId})` : ""}\n`);

  const contas = await prisma.accountPayable.findMany({
    where: {
      description: { contains: termo, mode: "insensitive" },
      ...(companyId ? { companyId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      id: true,
      companyId: true,
      description: true,
      amount: true,
      status: true,
      paidAmount: true,
      paidDate: true,
      paidByUserId: true,
      updatedAt: true,
    },
  });

  if (contas.length === 0) {
    console.log("Nenhuma conta encontrada com esse termo. Tente outro trecho da descrição.\n");
    return;
  }

  for (const c of contas) {
    console.log("────────────────────────────────────────────────────────");
    console.log(`Conta:        ${c.description}`);
    console.log(`  id:         ${c.id}`);
    console.log(`  empresa:    ${c.companyId}`);
    console.log(`  valor:      R$ ${Number(c.amount).toFixed(2)}`);
    console.log(`  status:     ${c.status}`);
    console.log(`  paidAmount: ${c.paidAmount != null ? "R$ " + Number(c.paidAmount).toFixed(2) : "—"}`);
    console.log(`  paidDate:   ${c.paidDate ? c.paidDate.toISOString() : "—"}`);
    console.log(`  paidBy:     ${c.paidByUserId ?? "—"}`);

    // 1) Existe lançamento (FinanceEntry) de despesa pra essa conta?
    const entry = await prisma.financeEntry.findFirst({
      where: {
        companyId: c.companyId,
        sourceType: "AccountPayable",
        sourceId: c.id,
        type: "EXPENSE",
        side: "DEBIT",
      },
      select: {
        id: true,
        amount: true,
        financeAccountId: true,
        entryDate: true,
        cashDate: true,
      },
    });

    if (!entry) {
      console.log(`  LANÇAMENTO: ❌ NÃO existe FinanceEntry de despesa para esta conta.`);
    } else {
      console.log(`  LANÇAMENTO: ✅ existe (id ${entry.id}, R$ ${Number(entry.amount).toFixed(2)})`);
      console.log(`    financeAccountId no lançamento: ${entry.financeAccountId ?? "❌ NULO (não aponta conta de saída)"}`);

      // 2) Que conta financeira é essa? É "Caixa" ou banco?
      if (entry.financeAccountId) {
        const acc = await prisma.financeAccount.findUnique({
          where: { id: entry.financeAccountId },
          select: { id: true, name: true, type: true, balance: true },
        });
        if (acc) {
          console.log(`    conta de saída: "${acc.name}" (tipo ${acc.type}) — saldo atual R$ ${Number(acc.balance).toFixed(2)}`);
        }
      }
    }

    console.log("");
  }

  console.log("────────────────────────────────────────────────────────");
  console.log("\nCOMO LER ISTO:");
  console.log("• status = PAID + LANÇAMENTO ✅ + financeAccount com saldo menor");
  console.log("    → o débito ACONTECEU (no saldo da conta financeira escolhida).");
  console.log("      Se você esperava ver no 'Caixa do dia' (sangria), isso é uma");
  console.log("      decisão de produto, não um bug — o sistema debita a CONTA FINANCEIRA.");
  console.log("• status = PAID + LANÇAMENTO ❌  → BUG: pagou sem registrar o débito.");
  console.log("• status = PENDING/OVERDUE       → a conta NÃO foi efetivamente paga");
  console.log("    (o clique pode ter falhado/idempotência). Nada a debitar ainda.");
  console.log("• financeAccountId NULO no lançamento → débito não apontou conta de saída.\n");
}

main()
  .catch((e) => {
    console.error("Erro no diagnóstico:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
