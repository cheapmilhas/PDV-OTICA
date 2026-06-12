/**
 * INSPEÇÃO (somente leitura) — entender a empresa P.S Vision e o padrão de produtos
 * importados (PSV-*), para cadastrar as armações das fotos seguindo o mesmo padrão.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  // 1) Achar a empresa P.S Vision
  const companies = await prisma.company.findMany({
    where: { name: { contains: "Vision", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  console.log("=== Empresas com 'Vision' ===");
  console.log(companies);

  const company = companies[0];
  if (!company) {
    console.log("Nenhuma empresa P.S Vision encontrada.");
    return;
  }
  const companyId = company.id;

  // 2) Branches da empresa
  const branches = await prisma.branch.findMany({
    where: { companyId },
    select: { id: true, name: true, code: true },
  });
  console.log("\n=== Branches ===");
  console.log(branches);

  // 3) Amostra de produtos PSV-* existentes (padrão do import anterior)
  const psvProducts = await prisma.product.findMany({
    where: { companyId, sku: { startsWith: "PSV-" } },
    take: 5,
    select: {
      id: true,
      sku: true,
      name: true,
      type: true,
      costPrice: true,
      salePrice: true,
      stockControlled: true,
      stockQty: true,
      categoryId: true,
      brandId: true,
      frameDetail: true,
      branchStocks: { select: { branchId: true, quantity: true } },
    },
  });
  console.log("\n=== Amostra produtos PSV-* (5) ===");
  console.log(JSON.stringify(psvProducts, null, 2));

  const psvCount = await prisma.product.count({
    where: { companyId, sku: { startsWith: "PSV-" } },
  });
  console.log("\nTotal produtos PSV-*:", psvCount);

  // 4) Maior número de SKU PSV- usado (para continuar a sequência)
  const allPsvSkus = await prisma.product.findMany({
    where: { companyId, sku: { startsWith: "PSV-" } },
    select: { sku: true },
  });
  console.log("\n=== SKUs PSV existentes ===");
  console.log(allPsvSkus.map((p) => p.sku).sort());

  // 5) Categorias e marcas existentes (para vincular armações)
  const cats = await prisma.category.findMany({
    where: { companyId },
    select: { id: true, name: true },
  });
  console.log("\n=== Categorias ===");
  console.log(cats);

  // 6) ProductType enum disponível — verificar valor para armação
  console.log("\n=== ProductType (amostra de tipos usados) ===");
  const types = await prisma.product.groupBy({
    by: ["type"],
    where: { companyId },
    _count: true,
  });
  console.log(types);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
