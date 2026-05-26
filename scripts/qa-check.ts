import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const ten = new Date(Date.now() - 15 * 60 * 1000);
  console.log("=== Vendas em qualquer empresa últimos 15 min ===");
  const sales = await prisma.sale.findMany({
    where: { createdAt: { gte: ten } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true, total: true, createdAt: true, branchId: true,
      company: { select: { name: true } }, branch: { select: { name: true } },
    },
  });
  if (sales.length === 0) console.log("  (nenhuma)");
  for (const s of sales) {
    console.log(`  ${s.createdAt.toISOString()} · R$ ${s.total} · ${s.company?.name} > ${s.branch?.name} · id=${s.id}`);
  }
  console.log("\n=== Últimos cashShifts criados (15 min) ===");
  const sh = await prisma.cashShift.findMany({
    where: { openedAt: { gte: ten } },
    orderBy: { openedAt: "desc" },
    take: 5,
    select: { id: true, status: true, openedAt: true, company: { select: { name: true } }, branch: { select: { name: true } } },
  });
  if (sh.length === 0) console.log("  (nenhum)");
  for (const s of sh) {
    console.log(`  ${s.openedAt.toISOString()} · ${s.status} · ${s.company?.name} > ${s.branch?.name}`);
  }
  console.log("\n=== ActivityLog últimos 15 min ===");
  const al = await prisma.activityLog.findMany({
    where: { createdAt: { gte: ten } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { createdAt: true, type: true, title: true, detail: true, actorName: true },
  });
  if (al.length === 0) console.log("  (nenhum)");
  for (const a of al) {
    console.log(`  ${a.createdAt.toISOString()} · ${a.type} · ${a.title}`);
    if (a.detail) console.log(`    detail: ${JSON.stringify(a.detail)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
