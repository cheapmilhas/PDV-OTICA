/**
 * DIAGNÓSTICO (read-only) da divergência de estoque entre o cache global
 * `Product.stockQty` e a verdade por filial `BranchStock.quantity`.
 *
 * Causa do bug "estoque fantasma": o PDV mostra Product.stockQty (soma global,
 * cache), mas a venda DEBITA de BranchStock da filial. Quando os dois divergem,
 * a tela mostra "Estoque: 1" e a venda falha com "Disponível: 0". Isso acontece
 * com produtos cujo BranchStock nunca foi criado/atualizado (importação tardia,
 * migração que só pegou stockQty>0 num momento, ajustes que tocaram só o cache).
 *
 * NÃO ESCREVE NADA. Roda em prod com segurança.
 *
 * Uso:
 *   npx tsx scripts/diagnose-stock-divergence.ts                # todas as empresas
 *   npx tsx scripts/diagnose-stock-divergence.ts <companyId>    # uma empresa
 *
 * Saída: para cada produto divergente — nome, SKU, stockQty (cache),
 * soma do BranchStock real, e se há linha de BranchStock faltando.
 */
import { prisma } from "../src/lib/prisma";

const onlyCompanyId = process.argv[2]?.startsWith("--") ? undefined : process.argv[2];

type Row = {
  productId: string;
  name: string;
  sku: string | null;
  companyId: string;
  companyName: string;
  stockControlled: boolean;
  cacheQty: number;
  branchSum: number;
  branchRows: number; // quantas linhas de BranchStock existem para o produto
  activeBranches: number; // filiais ativas da empresa
};

async function main() {
  console.log(`\n=== DIAGNÓSTICO DE DIVERGÊNCIA DE ESTOQUE (read-only) ===`);
  console.log(onlyCompanyId ? `Empresa: ${onlyCompanyId}\n` : `Todas as empresas\n`);

  const companies = await prisma.company.findMany({
    where: onlyCompanyId ? { id: onlyCompanyId } : undefined,
    select: {
      id: true,
      name: true,
      branches: { where: { active: true }, select: { id: true } },
    },
  });

  if (companies.length === 0) {
    console.log("⚠️  Nenhuma empresa encontrada.\n");
    return;
  }

  const divergent: Row[] = [];
  let totalProducts = 0;

  for (const company of companies) {
    const activeBranches = company.branches.length;

    const products = await prisma.product.findMany({
      where: { companyId: company.id, active: true },
      select: {
        id: true,
        name: true,
        sku: true,
        stockControlled: true,
        stockQty: true,
        branchStocks: { select: { quantity: true } },
      },
    });

    for (const p of products) {
      totalProducts++;
      const cacheQty = p.stockQty ?? 0;
      const branchSum = p.branchStocks.reduce((s, b) => s + (b.quantity ?? 0), 0);
      if (cacheQty !== branchSum) {
        divergent.push({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          companyId: company.id,
          companyName: company.name,
          stockControlled: p.stockControlled,
          cacheQty,
          branchSum,
          branchRows: p.branchStocks.length,
          activeBranches,
        });
      }
    }
  }

  if (divergent.length === 0) {
    console.log(`✅ Nenhuma divergência. ${totalProducts} produtos conferidos.\n`);
    return;
  }

  // Ordena: maior gap primeiro (cache > branch = risco de venda travada).
  divergent.sort((a, b) => (b.cacheQty - b.branchSum) - (a.cacheQty - a.branchSum));

  console.log(`⚠️  ${divergent.length} produto(s) divergente(s) de ${totalProducts} conferidos:\n`);

  let phantomBlocked = 0; // cache>branch: tela mostra estoque mas venda trava
  let missingRows = 0; // sem nenhuma linha de BranchStock

  for (const d of divergent) {
    const gap = d.cacheQty - d.branchSum;
    const flag = gap > 0 ? "🚨 VENDA TRAVA (cache>branch)" : "ℹ️  cache<branch";
    const ctrl = d.stockControlled ? "" : " [sem controle de estoque]";
    if (gap > 0 && d.stockControlled) phantomBlocked++;
    if (d.branchRows === 0) missingRows++;

    console.log(`${flag}${ctrl}`);
    console.log(`   ${d.name}${d.sku ? `  (${d.sku})` : ""}`);
    console.log(`   empresa: ${d.companyName} (${d.companyId})`);
    console.log(
      `   cache Product.stockQty=${d.cacheQty}  |  soma BranchStock=${d.branchSum}  |  gap=${gap > 0 ? "+" : ""}${gap}`
    );
    console.log(
      `   linhas BranchStock: ${d.branchRows}${d.branchRows === 0 ? " ⛔ NENHUMA (produto nunca teve estoque por filial)" : ""}  |  filiais ativas: ${d.activeBranches}`
    );
    console.log("");
  }

  console.log(`────────────────────────────────────────────────────────`);
  console.log(`Total divergentes:        ${divergent.length}  (inclui itens sem controle, marcados acima)`);
  console.log(`🚨 Vendas que travariam:  ${phantomBlocked}  (controlado + cache>branch — o que a reconciliação corrige)`);
  console.log(`⛔ Sem linha BranchStock: ${missingRows}`);
  console.log(`\nNada foi alterado. Para corrigir os dados (após revisar acima):`);
  console.log(`  npx tsx scripts/reconcile-stock-divergence.ts            # dry-run`);
  console.log(`  npx tsx scripts/reconcile-stock-divergence.ts --apply    # aplica\n`);
}

main()
  .catch((e) => {
    console.error("Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
