/**
 * Script de socorro para reativar produtos de uma empresa.
 *
 * Quando uma importação marcou produtos como inativos por engano (bug do
 * parser truthy antigo, planilha com coluna "Ativo" em formato inesperado,
 * etc.), use este script para reativar em massa.
 *
 * Uso:
 *   DRY-RUN (default):  npx tsx scripts/reactivate-products.ts <companyId>
 *   APLICAR:            npx tsx scripts/reactivate-products.ts <companyId> --apply
 *
 * Filtros opcionais:
 *   --since=YYYY-MM-DD   Reativar somente produtos atualizados a partir desta data
 *   --type=FRAME         Reativar somente um tipo específico (FRAME, LENS_SERVICE, etc.)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Args = {
  companyId: string;
  apply: boolean;
  since: Date | null;
  type: string | null;
};

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const companyId = positional[0];
  if (!companyId) {
    console.error("Uso: npx tsx scripts/reactivate-products.ts <companyId> [--apply] [--since=YYYY-MM-DD] [--type=FRAME]");
    process.exit(1);
  }
  const apply = argv.includes("--apply");
  const sinceArg = argv.find((a) => a.startsWith("--since="));
  const typeArg = argv.find((a) => a.startsWith("--type="));
  let since: Date | null = null;
  if (sinceArg) {
    const value = sinceArg.split("=")[1];
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) {
      console.error(`Data inválida em --since: "${value}". Use YYYY-MM-DD.`);
      process.exit(1);
    }
    since = parsed;
  }
  const type = typeArg ? typeArg.split("=")[1] : null;
  return { companyId, apply, since, type };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const company = await prisma.company.findUnique({
    where: { id: args.companyId },
    select: { id: true, name: true },
  });
  if (!company) {
    console.error(`Empresa não encontrada: ${args.companyId}`);
    process.exit(1);
  }

  const where: Record<string, unknown> = {
    companyId: args.companyId,
    active: false,
  };
  if (args.since) where.updatedAt = { gte: args.since };
  if (args.type) where.type = args.type;

  const [totalProducts, inactiveCount, activeCount] = await Promise.all([
    prisma.product.count({ where: { companyId: args.companyId } }),
    prisma.product.count({ where }),
    prisma.product.count({ where: { companyId: args.companyId, active: true } }),
  ]);

  console.log("=".repeat(60));
  console.log(`Empresa: ${company.name} (${company.id})`);
  console.log(`Total de produtos:       ${totalProducts}`);
  console.log(`Ativos hoje:             ${activeCount}`);
  console.log(`Inativos (candidatos):   ${inactiveCount}`);
  if (args.since) console.log(`Filtro: desde ${args.since.toISOString().split("T")[0]}`);
  if (args.type) console.log(`Filtro: tipo = ${args.type}`);
  console.log("=".repeat(60));

  if (inactiveCount === 0) {
    console.log("Nada a fazer — não há produtos inativos com esses filtros.");
    return;
  }

  const sample = await prisma.product.findMany({
    where,
    select: { id: true, sku: true, name: true, updatedAt: true },
    take: 5,
    orderBy: { updatedAt: "desc" },
  });
  console.log("\nAmostra (5 mais recentes):");
  for (const p of sample) {
    console.log(`  - [${p.sku}] ${p.name}  (updatedAt: ${p.updatedAt.toISOString()})`);
  }

  if (!args.apply) {
    console.log("\nDRY-RUN: nenhum produto foi alterado.");
    console.log("Para aplicar de verdade, rode novamente com --apply no final.");
    return;
  }

  console.log(`\nAplicando reativação em ${inactiveCount} produto(s)...`);
  const result = await prisma.product.updateMany({
    where,
    data: { active: true },
  });
  console.log(`Reativados: ${result.count}`);

  const finalActive = await prisma.product.count({
    where: { companyId: args.companyId, active: true },
  });
  console.log(`Ativos agora: ${finalActive}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
