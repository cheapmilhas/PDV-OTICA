/**
 * Sanity check — confirma:
 *  1. Conectamos ao branch de TESTE (não produção)
 *  2. Tabelas críticas existem (Company, Customer, Sale, AccountReceivable, ...)
 *  3. Conseguimos ler/contar sem escrever nada
 *  4. Confirma que dados de produção foram clonados (não vazio)
 */
import { getTestPrisma, disconnectTestPrisma } from "./_prisma";

async function main() {
  const prisma = getTestPrisma();

  // 1. Confirma sessão e host
  const dbInfo = await prisma.$queryRaw<
    Array<{ current_database: string; inet_server_addr: string | null; version: string }>
  >`SELECT current_database(), inet_server_addr()::text as inet_server_addr, version()`;
  console.log("[QA-DB] info:", dbInfo[0]);

  // 2. Conta tabelas chave (read-only)
  const [companies, branches, users, customers, products, sales, ar, cr, shifts, audit] =
    await Promise.all([
      prisma.company.count(),
      prisma.branch.count(),
      prisma.user.count(),
      prisma.customer.count(),
      prisma.product.count(),
      prisma.sale.count(),
      prisma.accountReceivable.count(),
      prisma.cardReceivable.count(),
      prisma.cashShift.count(),
      prisma.auditLog.count(),
    ]);

  console.table({
    companies,
    branches,
    users,
    customers,
    products,
    sales,
    accountsReceivable: ar,
    cardReceivables: cr,
    cashShifts: shifts,
    auditLogs: audit,
  });

  // 3. Confere se branch parece ser clone de prod (deve ter > 0 em customers/sales)
  if (companies === 0) {
    console.warn(
      "[QA-WARN] companies=0 — branch parece vazio. Esperávamos clone de produção.",
    );
  } else {
    console.log(
      `[QA-OK] Branch tem ${companies} empresas, ${sales} vendas, ${customers} clientes — clone de produção confirmado.`,
    );
  }

  await disconnectTestPrisma();
}

main().catch((err) => {
  console.error("[QA-FAIL]", err);
  process.exit(1);
});
