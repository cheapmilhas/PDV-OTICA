/**
 * Backfill de BranchStock para produtos órfãos (Bloco 2 / C2).
 *
 * Conserta produtos que foram importados ANTES da correção e ficaram sem linha
 * BranchStock ("Disponível: 0", invendáveis).
 *
 * MODOS:
 *   dry-run (padrão) — só LÊ e reporta o que faria. Não escreve nada.
 *   apply            — escreve no banco. SÓ rodar com aprovação explícita.
 *
 * Uso:
 *   npx tsx scripts/backfill-branchstock.ts            # dry-run
 *   npx tsx scripts/backfill-branchstock.ts --apply    # aplica (gated)
 *
 * SEGURANÇA:
 *  - Aditivo e idempotente: só cria BranchStock que FALTA (where none {}), nunca
 *    toca estoque existente. Rodar 2x não causa dano.
 *  - quantity = Product.stockQty (mesma equivalência do helper do Bloco 2).
 *  - Filtro: produtos ATIVOS + com controle de estoque (mesmos 26 da contagem).
 *  - Multi-tenant: a filial é sempre da MESMA empresa do produto.
 *  - Empresa de 1 filial → automático. Multi-filial → NÃO infere, marca p/ decisão.
 */
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

interface OrphanRow {
  id: string;
  sku: string;
  name: string;
  companyId: string;
  stockQty: number;
}

async function main() {
  console.log(`\n=== BACKFILL BranchStock — modo: ${APPLY ? "APPLY (ESCREVE)" : "DRY-RUN (só leitura)"} ===\n`);

  // 1. Produtos órfãos: ativos + controlados + SEM nenhuma linha BranchStock.
  const orphans: OrphanRow[] = (
    await prisma.product.findMany({
      where: { stockControlled: true, active: true, branchStocks: { none: {} } },
      select: { id: true, sku: true, name: true, companyId: true, stockQty: true },
      orderBy: { companyId: "asc" },
    })
  ).map((p) => ({ ...p, stockQty: p.stockQty ?? 0 }));

  console.log(`Total de produtos órfãos (ativos+controlados, sem BranchStock): ${orphans.length}\n`);

  // 2. Resolve as filiais ATIVAS de cada empresa envolvida (1 vez por empresa).
  const companyIds = [...new Set(orphans.map((o) => o.companyId))];
  const branchesByCompany = new Map<string, { id: string; name: string }[]>();
  const companyNames = new Map<string, string>();
  for (const cid of companyIds) {
    const branches = await prisma.branch.findMany({
      where: { companyId: cid, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    branchesByCompany.set(cid, branches);
    const co = await prisma.company.findUnique({ where: { id: cid }, select: { name: true } });
    companyNames.set(cid, co?.name ?? "(?)");
  }

  // 3. Classifica cada órfão e monta o PLANO de linhas a criar.
  //    Decisão do Matheus: empresa de 1 filial → cria na Matriz; multi-filial →
  //    cria em CADA filial ativa (quantity = 0). Sem filial → não dá.
  interface PlanRow { product: OrphanRow; branchId: string; branchName: string }
  const plan: PlanRow[] = [];
  const singleProducts: OrphanRow[] = [];
  const multiProducts: (OrphanRow & { branchCount: number })[] = [];
  const noBranch: OrphanRow[] = [];

  for (const o of orphans) {
    const branches = branchesByCompany.get(o.companyId) ?? [];
    if (branches.length === 0) {
      noBranch.push(o);
    } else if (branches.length === 1) {
      singleProducts.push(o);
      plan.push({ product: o, branchId: branches[0].id, branchName: branches[0].name });
    } else {
      // Multi-filial: 1 linha por filial ativa da empresa.
      multiProducts.push({ ...o, branchCount: branches.length });
      for (const b of branches) plan.push({ product: o, branchId: b.id, branchName: b.name });
    }
  }

  // 4. Relatório detalhado — o PLANO (1 linha BranchStock por entrada).
  const fmt = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));

  console.log("──────────── PLANO DE LINHAS BranchStock A CRIAR ────────────");
  for (const r of plan) {
    console.log(
      `  ${fmt(r.product.sku, 14)} ${fmt(r.product.name, 30)} | ${fmt(companyNames.get(r.product.companyId)!, 20)} | ` +
        `→ filial "${r.branchName}" | quantity = ${r.product.stockQty}`
    );
  }

  if (noBranch.length > 0) {
    console.log("\n──────── SEM FILIAL ATIVA (não dá p/ criar BranchStock) ────────");
    for (const n of noBranch) {
      console.log(`  ${fmt(n.sku, 14)} ${fmt(n.name, 30)} | empresa: ${companyNames.get(n.companyId)} | stockQty = ${n.stockQty}`);
    }
  }

  console.log("\n──────────────────────── RESUMO ────────────────────────");
  console.log(`  Produtos órfãos:                ${orphans.length}`);
  console.log(`  • 1 filial (1 linha cada):      ${singleProducts.length}`);
  console.log(`  • multi-filial (N linhas):      ${multiProducts.length}` +
    (multiProducts.length ? ` → ${multiProducts.map((m) => `${m.sku}(${m.branchCount})`).join(", ")}` : ""));
  console.log(`  • sem filial ativa:             ${noBranch.length}`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  TOTAL de linhas BranchStock a criar: ${plan.length}`);

  // 5. APLICAÇÃO (só com --apply). No dry-run, NÃO escreve.
  if (!APPLY) {
    console.log(`\n✋ DRY-RUN: nada foi escrito no banco. Após aprovação + snapshot, rode com --apply para criar as ${plan.length} linhas.\n`);
    return;
  }

  console.log(`\n=== APPLY: criando ${plan.length} linhas BranchStock (idempotente) ===`);
  let created = 0;
  for (const r of plan) {
    const res = await prisma.branchStock.upsert({
      where: { branchId_productId: { branchId: r.branchId, productId: r.product.id } },
      create: { branchId: r.branchId, productId: r.product.id, quantity: r.product.stockQty },
      update: {}, // NÃO sobrescreve estoque existente (idempotente)
    });
    if (res) created++;
  }
  console.log(`✓ ${created} upserts executados (linhas garantidas no banco).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERRO:", String(e?.message || e).slice(0, 200));
    process.exit(1);
  });
