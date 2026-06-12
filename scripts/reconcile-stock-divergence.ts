/**
 * RECONCILIAÇÃO da divergência de estoque entre o cache `Product.stockQty` e a
 * verdade por filial `BranchStock.quantity`. Corrige o bug "estoque fantasma"
 * (tela mostra estoque, venda falha "Disponível: 0") nos dados existentes.
 *
 * Diagnóstico read-only primeiro:  npx tsx scripts/diagnose-stock-divergence.ts
 *
 * Por padrão roda em DRY-RUN (não escreve nada). Para aplicar:
 *   npx tsx scripts/reconcile-stock-divergence.ts --apply
 *
 * REGRA (loja única): BranchStock da única filial ativa = Product.stockQty.
 * Faz upsert da linha BranchStock (cria se faltava) com quantity = cache.
 *
 * SALVAGUARDAS:
 *  - Só reconcilia empresas com EXATAMENTE 1 filial ativa (loja única). Multi-
 *    filial é PULADO (ambíguo qual filial recebe o estoque — exige decisão
 *    manual). Nenhuma das 6 empresas afetadas hoje é multi-filial.
 *  - Pula produto sem controle de estoque (stockControlled=false) — cache e
 *    branch ali são irrelevantes para venda.
 *  - Pula se já estiver consistente (idempotente).
 *  - Allowlist opcional ONLY_COMPANIES p/ restringir a empresas específicas.
 *  - NÃO mexe em Product.stockQty (o cache é a referência da loja única; só
 *    alinhamos o BranchStock a ele). Assim a tela não muda de valor.
 */
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

// Allowlist de empresas. Vazio = todas as lojas únicas divergentes.
// Opção B (validação pontual): corrigir SÓ a PS Vision primeiro; depois rodar
// nas demais (esvaziar a lista ou trocar pelos outros IDs).
const ONLY_COMPANIES: string[] = ["cmq6mjm2w0002haqqsq9bhw0v"];

async function main() {
  console.log(`\n=== RECONCILIAÇÃO DE ESTOQUE (BranchStock = Product.stockQty) ===`);
  console.log(APPLY ? "MODO: 🔴 APPLY (vai gravar)\n" : "MODO: 🟢 DRY-RUN (só simula, não grava)\n");

  const companies = await prisma.company.findMany({
    where: ONLY_COMPANIES.length > 0 ? { id: { in: ONLY_COMPANIES } } : undefined,
    select: {
      id: true,
      name: true,
      branches: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  let aplicados = 0;
  let pulados = 0;
  let empresasMultiFilial = 0;

  for (const company of companies) {
    // Guarda: só loja única.
    if (company.branches.length !== 1) {
      if (company.branches.length > 1) {
        empresasMultiFilial++;
        console.log(
          `⏭️  ${company.name}: ${company.branches.length} filiais ativas — PULADO (multi-filial exige decisão manual)\n`
        );
      }
      continue;
    }
    const branch = company.branches[0];

    const products = await prisma.product.findMany({
      where: { companyId: company.id, active: true, stockControlled: true },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQty: true,
        branchStocks: { select: { quantity: true } },
      },
    });

    const divergentes = products.filter((p) => {
      const branchSum = p.branchStocks.reduce((s, b) => s + (b.quantity ?? 0), 0);
      return (p.stockQty ?? 0) !== branchSum;
    });

    if (divergentes.length === 0) continue;

    console.log(`📦 ${company.name} → ${branch.name}: ${divergentes.length} produto(s) a reconciliar`);

    for (const p of divergentes) {
      const cache = p.stockQty ?? 0;
      const branchSum = p.branchStocks.reduce((s, b) => s + (b.quantity ?? 0), 0);
      console.log(
        `   • ${p.name} (${p.sku})  branch ${branchSum} → ${cache}  (linhas: ${p.branchStocks.length})`
      );
      // O script alinha BranchStock ao cache Product.stockQty; se o cache estiver
      // negativo (venda com override de gerente sem linha BranchStock), o valor
      // negativo é propagado — coerente com o estado, mas avisamos o operador.
      if (cache < 0) {
        console.log(`     ⚠️  stockQty NEGATIVO (${cache}) — provável override de gerente. Conferir contagem física.`);
      }

      if (APPLY) {
        await prisma.branchStock.upsert({
          where: { branchId_productId: { branchId: branch.id, productId: p.id } },
          create: { branchId: branch.id, productId: p.id, quantity: cache },
          update: { quantity: cache },
        });
        aplicados++;
      } else {
        pulados++;
      }
    }
    console.log("");
  }

  console.log(`────────────────────────────────────────────────────────`);
  if (APPLY) {
    console.log(`✅ Reconciliados: ${aplicados}  |  Empresas multi-filial puladas: ${empresasMultiFilial}`);
    console.log(`Confirme com o diagnóstico (deve zerar):`);
    console.log(`  npx tsx scripts/diagnose-stock-divergence.ts\n`);
  } else {
    console.log(`DRY-RUN: ${pulados} produto(s) seriam reconciliados.  Multi-filial puladas: ${empresasMultiFilial}`);
    console.log(`Para aplicar:  npx tsx scripts/reconcile-stock-divergence.ts --apply\n`);
  }
}

main()
  .catch((e) => {
    console.error("Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
