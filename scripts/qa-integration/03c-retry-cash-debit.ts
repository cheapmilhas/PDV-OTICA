/**
 * Re-tenta as 2 vendas que falharam por timeout (CASH e DEBIT_CARD)
 * agora que setupCompanyFinance rodou.
 */
import "./_env-shim";
import { saleService } from "@/services/sale.service";
import { createSaleSchema } from "@/lib/validations/sale.schema";
import { loadState, saveState, recordResult, recordBug } from "./_state";
import { prisma } from "@/lib/prisma";

const state = loadState();
const { companyId, branchId, adminUserId, customerId, frameProductId, prefix } = state as Required<typeof state>;

interface Variant {
  label: string;
  method: "CASH" | "DEBIT_CARD";
}

const variants: Variant[] = [
  { label: "CASH", method: "CASH" },
  { label: "DEBIT_CARD", method: "DEBIT_CARD" },
];

async function snapshotProduct(id: string) {
  return prisma.product.findUniqueOrThrow({
    where: { id },
    select: { id: true, name: true, stockQty: true },
  });
}

async function run(v: Variant) {
  const before = await snapshotProduct(frameProductId!);
  const beforeFinance = await prisma.financeEntry.count({ where: { companyId: companyId! } });
  const beforeStockMv = await prisma.stockMovement.count({
    where: { companyId: companyId!, productId: frameProductId!, type: "SALE" },
  });
  const beforeCashMv = await prisma.cashMovement.count({ where: { branchId: branchId!, direction: "IN" } });

  const dto = createSaleSchema.parse({
    customerId: customerId!,
    branchId: branchId!,
    sellerUserId: adminUserId!,
    items: [{ productId: frameProductId!, qty: 1, unitPrice: 200, discount: 0 }],
    payments: [
      {
        method: v.method,
        amount: 200,
        installments: 1,
        ...(v.method === "DEBIT_CARD" ? { cardBrand: "VISA", cardLastDigits: "5678", nsu: `QA-${Date.now()}`, acquirer: "GETNET" } : {}),
      },
    ],
    discount: 0,
    notes: `${prefix} retry ${v.label}`,
  });

  const sale = await saleService.create(dto as any, companyId!, adminUserId!);
  state.salesCreated![v.label] = sale.id;
  saveState(state);

  const after = await snapshotProduct(frameProductId!);
  const afterFinance = await prisma.financeEntry.count({ where: { companyId: companyId! } });
  const afterStockMv = await prisma.stockMovement.count({
    where: { companyId: companyId!, productId: frameProductId!, type: "SALE" },
  });
  const afterCashMv = await prisma.cashMovement.count({ where: { branchId: branchId!, direction: "IN" } });

  recordResult(
    `3.${v.label}.1 venda criada COMPLETED (retry)`,
    "total=200, COMPLETED",
    `id=${sale.id}, total=${sale.total}, status=${sale.status}`,
    Number(sale.total) === 200 && sale.status === "COMPLETED",
  );
  recordResult(
    `3.${v.label}.2 estoque baixou (retry)`,
    `${before.stockQty} → ${before.stockQty - 1}`,
    `${before.stockQty} → ${after.stockQty}`,
    after.stockQty === before.stockQty - 1,
  );
  recordResult(
    `3.${v.label}.3 StockMovement SALE criado (retry)`,
    "+1",
    `${beforeStockMv} → ${afterStockMv}`,
    afterStockMv === beforeStockMv + 1,
  );
  recordResult(
    `3.${v.label}.4 CashMovement IN (retry)`,
    "+1",
    `${beforeCashMv} → ${afterCashMv}`,
    afterCashMv === beforeCashMv + 1,
  );
  recordResult(
    `3.${v.label}.6 FinanceEntry criada (retry após setup financeiro)`,
    "+1 (ou mais)",
    `${beforeFinance} → ${afterFinance}`,
    afterFinance > beforeFinance,
  );
}

async function main() {
  for (const v of variants) {
    console.log(`\n=== Retry 3.${v.label} ===`);
    try {
      await run(v);
    } catch (e: any) {
      recordResult(
        `3.${v.label}.0 criar venda (retry)`,
        "Venda criada com sucesso",
        `EXCEPTION: ${e.message ?? e}`,
        false,
      );
      recordBug(
        `Retry de ${v.label} falhou novamente`,
        "ALTO",
        `Após setup financeiro, ainda falha: ${e.message}`,
        ["src/services/sale.service.ts:391 timeout"],
      );
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[QA-FAIL]", e);
  await prisma.$disconnect();
  process.exit(1);
});
