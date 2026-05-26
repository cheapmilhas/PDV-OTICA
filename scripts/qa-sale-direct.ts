/**
 * Roda saleService.create direto (sem HTTP) pra capturar o erro real
 * que o handleApiError mascara como "Erro de regra de negócio".
 */
import { PrismaClient } from "@prisma/client";
import { saleService } from "../src/services/sale.service";

const prisma = new PrismaClient();
const COMPANY_ID = "cmlx4fkjt000092bq1n7rm63g";
const USER_ID = "cmlx4fl53000492bq5fapp8xr";
const BRANCH_ID = "cmlx4fkr0000292bqtebe57r1";

async function main() {
  const product = await prisma.product.findFirst({
    where: { companyId: COMPANY_ID, active: true, stockQty: { gt: 0 } },
    select: { id: true, name: true, salePrice: true, stockQty: true },
  });
  console.log(`Produto: ${product!.name} R$${product!.salePrice} (estoque ${product!.stockQty})`);

  try {
    const sale = await saleService.create(
      {
        customerId: null,
        branchId: BRANCH_ID,
        items: [{ productId: product!.id, qty: 1, unitPrice: Number(product!.salePrice), discount: 0 }],
        payments: [{ method: "CASH" as any, amount: Number(product!.salePrice), installments: 1 }],
        discount: 0,
        cashbackUsed: 0,
        notes: "[QA SMOKE 2026-05-25] direto via tsx",
      } as any,
      COMPANY_ID,
      USER_ID,
    );
    console.log("✅ SUCESSO");
    console.log(`Venda criada: ${sale.id} total=${sale.total}`);
  } catch (err) {
    console.error("❌ ERRO REAL:");
    console.error(err);
  }
}
main().finally(() => prisma.$disconnect());
