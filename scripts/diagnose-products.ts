/**
 * Verifica que as colunas faltantes em branch_stocks foram criadas,
 * e que a query que /api/products faz volta a rodar sem 500.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Uso: npx tsx scripts/diagnose-products.ts <companyId>");
    process.exit(1);
  }

  console.log("=== 1. Conferindo colunas reais de branch_stocks ===");
  const cols = await prisma.$queryRaw<Array<{ column_name: string; data_type: string }>>`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'branch_stocks'
    ORDER BY ordinal_position;
  `;
  for (const c of cols) console.log(`  ${c.column_name.padEnd(20)} ${c.data_type}`);
  const needed = ["cost_price", "sale_price", "promo_price", "margin_percent"];
  const actual = new Set(cols.map((c) => c.column_name));
  const stillMissing = needed.filter((n) => !actual.has(n));
  if (stillMissing.length > 0) {
    console.error(`❌ AINDA FALTA: ${stillMissing.join(", ")}`);
    process.exit(1);
  }
  console.log("✅ Todas as 4 colunas existem.");

  console.log("\n=== 2. Reproduzindo a query EXATA do /api/products GET ===");
  const data = await prisma.product.findMany({
    where: { companyId, active: true },
    skip: 0,
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      category: true,
      brand: true,
      color: true,
      shape: true,
      branchStocks: {
        include: { branch: { select: { id: true, name: true } } },
      },
    },
  });
  console.log(`✅ Query executou sem erro. Retornou ${data.length} produto(s).`);
  if (data[0]) {
    console.log(`   Primeiro: [${data[0].sku}] ${data[0].name}`);
  }

  console.log("\n=== 3. Total de produtos ativos ===");
  const total = await prisma.product.count({ where: { companyId, active: true } });
  console.log(`✅ Total: ${total}`);

  console.log("\n🎉 Tudo certo. O cliente deve ver os produtos após hard refresh.");
}

main()
  .catch((err) => {
    console.error("❌ Erro:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
