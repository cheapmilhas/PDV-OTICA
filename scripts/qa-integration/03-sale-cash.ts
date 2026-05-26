/**
 * Cenário 3 — Venda à vista (CASH, PIX, DEBIT_CARD, CREDIT_CARD à vista).
 *
 * Para cada método:
 *  - Cria venda chamando saleService.create direto
 *  - Confere total e status COMPLETED
 *  - Confere baixa de estoque (Product.stockQty)
 *  - Confere StockMovement type=SALE
 *  - Confere CashMovement direction=IN (apenas CASH/PIX/DEBIT_CARD)
 *  - Confere CardReceivable criado (apenas CREDIT_CARD)
 *  - Confere FinanceEntry criada
 *  - Confere aparição em saleService.list filtrando por customer
 */
import "./_env-shim";
import { saleService } from "@/services/sale.service";
import { createSaleSchema } from "@/lib/validations/sale.schema";
import { loadState, saveState, recordResult, recordBug } from "./_state";
import { prisma } from "@/lib/prisma";
import type { PaymentMethod } from "@prisma/client";

const state = loadState();
state.salesCreated = state.salesCreated ?? {};

const { companyId, branchId, adminUserId, customerId, frameProductId, lensProductId, prefix } = state as Required<typeof state>;

interface Variant {
  label: string;
  method: PaymentMethod;
  productId: string;
  productLabel: "FRAME" | "LENS";
  unitPrice: number;
  qty: number;
}

const variants: Variant[] = [
  { label: "CASH",        method: "CASH",        productId: frameProductId!, productLabel: "FRAME", unitPrice: 200, qty: 1 },
  { label: "PIX",         method: "PIX",         productId: lensProductId!,  productLabel: "LENS",  unitPrice: 150, qty: 1 },
  { label: "DEBIT_CARD",  method: "DEBIT_CARD",  productId: frameProductId!, productLabel: "FRAME", unitPrice: 200, qty: 1 },
  { label: "CREDIT_CARD", method: "CREDIT_CARD", productId: lensProductId!,  productLabel: "LENS",  unitPrice: 150, qty: 1 },
];

async function snapshotProduct(id: string) {
  return prisma.product.findUniqueOrThrow({
    where: { id },
    select: { id: true, name: true, stockQty: true },
  });
}

async function run(v: Variant) {
  const before = await snapshotProduct(v.productId);
  const beforeStockMv = await prisma.stockMovement.count({
    where: { companyId: companyId!, productId: v.productId, type: "SALE" },
  });
  const beforeCashMv = await prisma.cashMovement.count({
    where: { branchId: branchId!, direction: "IN" },
  });
  const beforeFinance = await prisma.financeEntry.count({
    where: { companyId: companyId! },
  });
  const beforeCardRcv = await prisma.cardReceivable.count({
    where: { companyId: companyId! },
  });

  const total = v.unitPrice * v.qty;

  const dtoUnsafe = {
    customerId: customerId!,
    branchId: branchId!,
    sellerUserId: adminUserId!,
    items: [{ productId: v.productId, qty: v.qty, unitPrice: v.unitPrice, discount: 0 }],
    payments: [
      {
        method: v.method,
        amount: total,
        installments: 1,
        ...(v.method === "CREDIT_CARD" || v.method === "DEBIT_CARD"
          ? { cardBrand: "VISA", cardLastDigits: "1234", nsu: `QA-NSU-${Date.now()}`, acquirer: "GETNET" }
          : {}),
      },
    ],
    discount: 0,
    notes: `${prefix} venda-${v.label}`,
  };

  const parsed = createSaleSchema.parse(dtoUnsafe);
  const sale = await saleService.create(parsed as any, companyId!, adminUserId!);

  state.salesCreated![v.label] = sale.id;
  saveState(state);

  // -- Validações --
  recordResult(
    `3.${v.label}.1 venda criada COMPLETED`,
    `total=${total}, status=COMPLETED`,
    `id=${sale.id}, total=${sale.total}, status=${sale.status}`,
    Number(sale.total) === total && sale.status === "COMPLETED",
  );

  const after = await snapshotProduct(v.productId);
  recordResult(
    `3.${v.label}.2 estoque baixou`,
    `stockQty: ${before.stockQty} → ${before.stockQty - v.qty}`,
    `${before.stockQty} → ${after.stockQty}`,
    after.stockQty === before.stockQty - v.qty,
  );

  const afterStockMv = await prisma.stockMovement.count({
    where: { companyId: companyId!, productId: v.productId, type: "SALE" },
  });
  recordResult(
    `3.${v.label}.3 StockMovement SALE criado`,
    "+1 StockMovement type=SALE",
    `count: ${beforeStockMv} → ${afterStockMv}`,
    afterStockMv === beforeStockMv + 1,
  );

  // CashMovement só pra métodos em caixa (CASH, PIX, DEBIT_CARD)
  const expectsCashMv = ["CASH", "PIX", "DEBIT_CARD"].includes(v.method);
  const afterCashMv = await prisma.cashMovement.count({
    where: { branchId: branchId!, direction: "IN" },
  });
  recordResult(
    `3.${v.label}.4 CashMovement IN (esperado=${expectsCashMv})`,
    expectsCashMv ? "+1 CashMovement direction=IN" : "sem nova CashMovement (não-caixa)",
    `count: ${beforeCashMv} → ${afterCashMv}`,
    expectsCashMv ? afterCashMv === beforeCashMv + 1 : afterCashMv === beforeCashMv,
  );

  // CardReceivable só pra CREDIT_CARD
  const expectsCardRcv = v.method === "CREDIT_CARD";
  const afterCardRcv = await prisma.cardReceivable.count({
    where: { companyId: companyId! },
  });
  recordResult(
    `3.${v.label}.5 CardReceivable (esperado=${expectsCardRcv})`,
    expectsCardRcv ? "+1 (CREDIT_CARD parcela 1/1)" : "sem CardReceivable",
    `count: ${beforeCardRcv} → ${afterCardRcv}`,
    expectsCardRcv ? afterCardRcv >= beforeCardRcv + 1 : afterCardRcv === beforeCardRcv,
  );

  // FinanceEntry: espera 1+ entradas após venda
  const afterFinance = await prisma.financeEntry.count({
    where: { companyId: companyId! },
  });
  recordResult(
    `3.${v.label}.6 FinanceEntry criada`,
    "ao menos +1 FinanceEntry vinculada à venda",
    `count: ${beforeFinance} → ${afterFinance}`,
    afterFinance > beforeFinance,
  );

  // Aparição na lista do cliente
  const list = await saleService.list(
    { page: 1, pageSize: 50, customerId: customerId!, status: "ativos" } as any,
    companyId!,
  );
  const items = (list as any).data ?? (list as any).items ?? [];
  const foundInList = items.some((s: any) => s.id === sale.id);
  recordResult(
    `3.${v.label}.7 aparece no histórico do cliente`,
    "saleService.list({ customerId }) contém a venda",
    `items=${items.length}, foundThis=${foundInList}`,
    foundInList,
  );
}

async function main() {
  for (const v of variants) {
    console.log(`\n=== Cenário 3.${v.label} ===`);
    try {
      await run(v);
    } catch (e: any) {
      recordBug(
        `Falha em criar venda à vista ${v.label}`,
        "ALTO",
        `saleService.create lançou: ${e.message ?? e}`,
        ["src/services/sale.service.ts:197"],
      );
      recordResult(
        `3.${v.label}.0 criar venda`,
        "Venda criada com sucesso",
        `EXCEPTION: ${e.message ?? e}`,
        false,
      );
    }
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[QA-FAIL]", err);
  await prisma.$disconnect();
  process.exit(1);
});
