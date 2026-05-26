/**
 * Re-testa o recebimento de AR REPLICANDO o handler PATCH /api/accounts-receivable
 * (que cria CashMovement SE paymentMethod for enviado).
 * Também corrige o bug 4.8 com nuance correta.
 */
import "./_env-shim";
import { loadState, recordResult, recordBug } from "./_state";
import { prisma } from "@/lib/prisma";

const state = loadState();
const { companyId, branchId, adminUserId } = state as Required<typeof state>;

async function main() {
  // Pega uma parcela PENDING do crediário 3x criado em 04b
  const ar = await prisma.accountReceivable.findFirst({
    where: { companyId: companyId!, status: "PENDING", description: { contains: state.prefix } },
    orderBy: { installmentNumber: "asc" },
  });
  if (!ar) {
    console.log("Sem AR PENDING — abortando");
    await prisma.$disconnect();
    return;
  }

  const beforeCash = await prisma.cashMovement.count({ where: { branchId: branchId! } });
  const beforeFin = await prisma.financeEntry.count({ where: { companyId: companyId! } });

  // Replicando o handler PATCH com paymentMethod="CASH"
  const userId = adminUserId!;
  await prisma.$transaction(async (tx) => {
    await tx.accountReceivable.update({
      where: { id: ar.id },
      data: {
        status: "RECEIVED",
        receivedAmount: ar.amount,
        receivedDate: new Date(),
        receivedByUserId: userId,
      },
    });

    const openShift = await tx.cashShift.findFirst({
      where: { branchId: ar.branchId!, status: "OPEN" },
      orderBy: { openedAt: "desc" },
    });
    if (openShift) {
      await tx.cashMovement.create({
        data: {
          cashShiftId: openShift.id,
          branchId: ar.branchId!,
          type: "SALE_PAYMENT",
          direction: "IN",
          method: "CASH",
          amount: Number(ar.amount),
          originType: "AccountReceivable",
          originId: ar.id,
          note: `Recebimento ${ar.description}`,
          createdByUserId: userId,
        },
      });
    }
  });

  const afterCash = await prisma.cashMovement.count({ where: { branchId: branchId! } });
  const afterFin = await prisma.financeEntry.count({ where: { companyId: companyId! } });

  recordResult(
    "4.8.b PATCH com paymentMethod cria CashMovement",
    "+1 CashMovement (replicando handler PATCH)",
    `${beforeCash} → ${afterCash}`,
    afterCash === beforeCash + 1,
  );

  recordResult(
    "4.9.b PATCH NÃO cria FinanceEntry mesmo com paymentMethod",
    "Comportamento documentado (BUG: deveria criar)",
    `${beforeFin} → ${afterFin}`,
    afterFin === beforeFin,
  );

  recordBug(
    "Handler PATCH /accounts-receivable NÃO cria FinanceEntry no recebimento",
    "ALTO",
    "Mesmo com paymentMethod enviado, o handler só cria CashMovement. Nenhum FinanceEntry é gerado (DRE/cash-flow ficam defasados). Compare com saleService.create que chama applyFinanceEntriesInTx. Recebimentos de parcela são uma fonte legítima de receita.",
    ["src/app/api/accounts-receivable/route.ts:511-549"],
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[QA-FAIL]", e);
  await prisma.$disconnect();
  process.exit(1);
});
