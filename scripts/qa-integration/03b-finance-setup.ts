/**
 * Roda setupCompanyFinance para popular ChartOfAccounts + FinanceAccount na empresa de teste.
 * Também registra os bugs do Cenário 3 (timeout 5s + falha de FinanceEntry para empresa sem onboarding).
 */
import "./_env-shim";
import { setupCompanyFinance } from "@/services/finance-setup.service";
import { prisma } from "@/lib/prisma";
import { loadState, recordBug } from "./_state";

async function main() {
  const state = loadState();

  recordBug(
    "Transação de venda excede timeout 5s do Prisma (Neon long-distance)",
    "CRITICO",
    "saleService.create faz $transaction com muitos round-trips (Sale + Items + Payments + estoque + cashback + commission + FinanceEntry). Em CASH/DEBIT_CARD a tx passou de 5000ms (default Prisma) e abortou com 'Transaction already closed'. PIX/CREDIT passaram por sorte. Reprodução: criar venda à vista em ambiente de teste contra Neon US-East. Risco em prod: vendedor vê erro genérico do Prisma e perde a venda.",
    [
      "src/services/sale.service.ts:391 (prisma.$transaction sem timeout custom)",
      "Sem option { timeout: 30000 } no $transaction",
    ],
  );

  recordBug(
    "Empresa criada via API/seed sem onboarding NÃO popula ChartOfAccounts → FinanceEntry sempre falha",
    "CRITICO",
    "generateSaleEntries busca contas '1.1.03' (CAIXA), '1.1.04' (CARTAO), '1.1.05' (CREDIARIO) em ChartOfAccounts. Se a empresa não passou pelo onboarding (que dispara setupCompanyFinance), as contas não existem → todas as vendas geram log de erro 'Conta contábil não encontrada'. Venda aparece em /vendas e /caixa mas NÃO em /financeiro. Múltiplas empresas em prod podem ter esse drift silencioso.",
    [
      "src/services/finance-entry.service.ts:23 (getChartAccountByCode lança erro)",
      "src/services/sale-side-effects.service.ts:429 (applyFinanceEntriesInTx engole erro)",
      "src/services/finance-setup.service.ts:79 (setupCompanyFinance deveria rodar no onboarding)",
    ],
  );

  console.log("[QA] Rodando setupCompanyFinance para destravar Financeiro...");
  await prisma.$transaction(async (tx) => {
    await setupCompanyFinance(tx as any, state.companyId!, state.branchId!);
  }, { timeout: 30000 });
  console.log("[QA] setupCompanyFinance OK");

  // Conferir
  const coa = await prisma.chartOfAccounts.count({ where: { companyId: state.companyId! } });
  const fa = await prisma.financeAccount.count({ where: { companyId: state.companyId! } });
  console.log(`[QA] ChartOfAccounts: ${coa}, FinanceAccount: ${fa}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[QA-FAIL]", e);
  await prisma.$disconnect();
  process.exit(1);
});
