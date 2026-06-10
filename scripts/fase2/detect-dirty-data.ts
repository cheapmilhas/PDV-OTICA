/**
 * FASE 2 — Detecção de dados sujos (SELECT-only, NÃO altera nada).
 *
 * Roda APENAS leitura. Use SEMPRE numa Neon branch isolada de teste, nunca em
 * produção direta. Para forçar isso, este script EXIGE a variável
 * FASE2_TEST_DATABASE_URL (separada de DATABASE_URL) — assim não há risco de
 * apontar pro banco de produção por engano.
 *
 *   FASE2_TEST_DATABASE_URL="postgres://...branch-de-teste..." \
 *     npx tsx scripts/fase2/detect-dirty-data.ts
 *
 * Reporta:
 *  - BUG-05: parcelas duplicadas [saleId, installmentNumber] em AccountReceivable
 *  - BUG-06: estoques negativos (BranchStock.quantity, Product.stockQty)
 *  - RACE-01: mais de 1 CashShift OPEN por filial
 *  - RACE-02: AccountPayable duplicado por [recurringExpenseId, mês de dueDate]
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.FASE2_TEST_DATABASE_URL;
if (!url) {
  console.error(
    "ERRO: defina FASE2_TEST_DATABASE_URL com a connection string da Neon branch de TESTE.\n" +
      "Este script é SELECT-only mas recusa rodar sem essa variável para nunca tocar produção por engano."
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  console.log("=== FASE 2 — Detecção de dados sujos (SELECT-only) ===");
  console.log("Banco:", url!.replace(/:\/\/[^@]*@/, "://***@").replace(/\/[^/?]+(\?|$)/, "/***$1"));
  console.log("------------------------------------------------------------");

  // BUG-05: parcelas duplicadas
  const dupAR = await prisma.$queryRaw<Array<{ saleId: string; installmentNumber: number; n: bigint }>>`
    SELECT "saleId", "installmentNumber", COUNT(*)::bigint AS n
    FROM "AccountReceivable"
    WHERE "saleId" IS NOT NULL
    GROUP BY "saleId", "installmentNumber"
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 50
  `;
  console.log(`BUG-05 — parcelas duplicadas [saleId, installmentNumber]: ${dupAR.length} grupo(s)`);
  dupAR.forEach((r) => console.log(`   sale=${r.saleId} parcela=${r.installmentNumber} ×${Number(r.n)}`));

  // BUG-06: estoque negativo
  // BranchStock usa @@map("branch_stocks") + colunas branch_id/product_id (snake_case).
  const negBranch = await prisma.$queryRaw<Array<{ id: string; branch_id: string; product_id: string; quantity: number }>>`
    SELECT "id", "branch_id", "product_id", "quantity"
    FROM "branch_stocks" WHERE "quantity" < 0 ORDER BY "quantity" ASC LIMIT 50
  `;
  const negProduct = await prisma.$queryRaw<Array<{ id: string; name: string; stockQty: number }>>`
    SELECT "id", "name", "stockQty" FROM "Product" WHERE "stockQty" < 0 ORDER BY "stockQty" ASC LIMIT 50
  `;
  console.log(`BUG-06 — BranchStock.quantity negativo: ${negBranch.length} | Product.stockQty negativo: ${negProduct.length}`);
  negBranch.forEach((r) => console.log(`   BranchStock branch=${r.branch_id} product=${r.product_id} qty=${r.quantity}`));
  negProduct.forEach((r) => console.log(`   Product ${r.name} stockQty=${r.stockQty}`));

  // RACE-01: mais de 1 caixa OPEN por filial
  const multiOpen = await prisma.$queryRaw<Array<{ branchId: string; n: bigint }>>`
    SELECT "branchId", COUNT(*)::bigint AS n
    FROM "CashShift" WHERE "status" = 'OPEN'
    GROUP BY "branchId" HAVING COUNT(*) > 1
  `;
  console.log(`RACE-01 — filiais com >1 CashShift OPEN: ${multiOpen.length}`);
  multiOpen.forEach((r) => console.log(`   branch=${r.branchId} OPEN×${Number(r.n)}`));

  // Histórico: caixa aberto há muito tempo (não bloqueia migration, mas reportar)
  const staleOpen = await prisma.$queryRaw<Array<{ id: string; branchId: string; openedAt: Date }>>`
    SELECT "id", "branchId", "openedAt" FROM "CashShift"
    WHERE "status" = 'OPEN' AND "openedAt" < NOW() - INTERVAL '2 days'
    ORDER BY "openedAt" ASC LIMIT 20
  `;
  console.log(`RACE-01 (info) — caixas OPEN há +2 dias: ${staleOpen.length}`);
  staleOpen.forEach((r) => console.log(`   shift=${r.id} branch=${r.branchId} aberto desde ${r.openedAt.toISOString()}`));

  // RACE-02: AccountPayable duplicado por recurringExpense + mês de dueDate
  const dupRec = await prisma.$queryRaw<Array<{ recurringExpenseId: string; mes: string; n: bigint }>>`
    SELECT "recurringExpenseId", to_char("dueDate", 'YYYY-MM') AS mes, COUNT(*)::bigint AS n
    FROM "AccountPayable"
    WHERE "recurringExpenseId" IS NOT NULL
    GROUP BY "recurringExpenseId", to_char("dueDate", 'YYYY-MM')
    HAVING COUNT(*) > 1
    ORDER BY n DESC LIMIT 50
  `;
  console.log(`RACE-02 — AccountPayable duplicado [recurringExpenseId, mês]: ${dupRec.length} grupo(s)`);
  dupRec.forEach((r) => console.log(`   recExp=${r.recurringExpenseId} mês=${r.mes} ×${Number(r.n)}`));

  console.log("------------------------------------------------------------");
  console.log("Detecção concluída (nada foi alterado).");
}

main()
  .catch((e) => {
    console.error("ERRO:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
