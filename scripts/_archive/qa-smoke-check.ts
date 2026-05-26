/**
 * Verifica TODAS as vendas dos últimos 10 min em qualquer empresa,
 * e confere a filial Pacajus.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

  console.log("=== Vendas em qualquer empresa últimos 10 min ===");
  const sales = await prisma.sale.findMany({
    where: { createdAt: { gte: tenMinAgo } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      total: true,
      createdAt: true,
      companyId: true,
      branchId: true,
      sellerUser: { select: { name: true } },
      company: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });
  if (sales.length === 0) console.log("  (nenhuma)");
  for (const s of sales) {
    console.log(`  ${s.createdAt.toISOString()} · R$ ${s.total} · ${s.sellerUser?.name} · ${s.company?.name} > ${s.branch?.name}`);
  }

  console.log("\n=== Filial Pacajus ===");
  const branches = await prisma.branch.findMany({
    where: { name: { contains: "Pacajus", mode: "insensitive" } },
    select: { id: true, name: true, active: true, company: { select: { name: true } } },
  });
  for (const b of branches) console.log(`  ${b.id} · ${b.name} · ${b.company.name} · active=${b.active}`);

  console.log("\n=== Filial selecionada no PDV (branchId cmlx4fkr0000292bqtebe57r1) ===");
  const target = await prisma.branch.findUnique({
    where: { id: "cmlx4fkr0000292bqtebe57r1" },
    select: { id: true, name: true, active: true, companyId: true, company: { select: { name: true } } },
  });
  console.log(`  ${target?.name} · ${target?.company.name} · companyId=${target?.companyId}`);

  console.log("\n=== Vendas das ultimas 24h na Atacadao dos Óculos ===");
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.sale.count({
    where: { companyId: "cmlx4fkjt000092bq1n7rm63g", createdAt: { gte: dayAgo } },
  });
  console.log(`  ${count} vendas em 24h`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
