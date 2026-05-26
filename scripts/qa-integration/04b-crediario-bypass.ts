/**
 * Cenário 4 (continuação) — Como saleService.create estoura timeout no ambiente,
 * crio a venda + parcelas DIRETO via Prisma para testar a lógica de recebimento.
 * Isso confirma que as regras de DOMÍNIO existem; documenta separadamente que o
 * caminho do SERVICE não chega a executar nesse ambiente por causa do timeout.
 */
import "./_env-shim";
import { loadState, saveState, recordResult, recordBug } from "./_state";
import { prisma } from "@/lib/prisma";

const state = loadState();
const { companyId, branchId, adminUserId, customerId, frameProductId, prefix } = state as Required<typeof state>;

const UNIT = 300;
const TOTAL = UNIT;
const COUNT = 3;
const NOW = new Date();
const PARCEL = TOTAL / COUNT;

async function main() {
  // 1. Cria Sale + SaleItem + SalePayment direto (replicando o esperado)
  const sale = await prisma.sale.create({
    data: {
      companyId: companyId!,
      branchId: branchId!,
      customerId: customerId!,
      sellerUserId: adminUserId!,
      status: "COMPLETED",
      subtotal: TOTAL,
      discountTotal: 0,
      total: TOTAL,
      completedAt: NOW,
      items: {
        create: [
          {
            productId: frameProductId!,
            qty: 1,
            unitPrice: UNIT,
            discount: 0,
            lineTotal: UNIT,
            costPrice: 80,
            stockControlled: true,
            stockQtyConsumed: 1,
          },
        ],
      },
      payments: {
        create: [
          {
            method: "STORE_CREDIT",
            amount: TOTAL,
            installments: COUNT,
            status: "PENDING",
          },
        ],
      },
    },
  });

  state.salesCreated!["STORE_CREDIT"] = sale.id;
  saveState(state);

  // 2. Cria 3 AccountReceivable
  const dueDates = [30, 60, 90].map((d) => {
    const dt = new Date(NOW);
    dt.setUTCDate(dt.getUTCDate() + d);
    return dt;
  });
  for (let i = 0; i < COUNT; i++) {
    await prisma.accountReceivable.create({
      data: {
        companyId: companyId!,
        branchId: branchId!,
        customerId: customerId!,
        saleId: sale.id,
        description: `${prefix} crediário parcela ${i + 1}/${COUNT}`,
        installmentNumber: i + 1,
        totalInstallments: COUNT,
        amount: PARCEL,
        dueDate: dueDates[i],
        status: "PENDING",
        createdByUserId: adminUserId!,
      },
    });
  }
  recordResult(
    "4.1 (bypass) venda STORE_CREDIT 3x criada via Prisma direto",
    `Sale total=${TOTAL}, 3 ARs`,
    `id=${sale.id}, total=${sale.total}`,
    Number(sale.total) === TOTAL,
  );

  // 3. Conferências
  const ars = await prisma.accountReceivable.findMany({
    where: { saleId: sale.id },
    orderBy: { installmentNumber: "asc" },
  });

  recordResult(
    "4.2 nº de AccountReceivable criadas",
    `${COUNT} parcelas`,
    `${ars.length}`,
    ars.length === COUNT,
  );

  const sumAR = ars.reduce((s, ar) => s + Number(ar.amount), 0);
  recordResult(
    "4.3 soma das parcelas = total",
    `R$ ${TOTAL.toFixed(2)}`,
    `R$ ${sumAR.toFixed(2)}`,
    Math.abs(sumAR - TOTAL) < 0.01,
  );

  const numbersOK = ars.every((ar, idx) => ar.installmentNumber === idx + 1 && ar.totalInstallments === COUNT);
  recordResult(
    "4.4 installmentNumber/totalInstallments",
    "1/3, 2/3, 3/3",
    ars.map((a) => `${a.installmentNumber}/${a.totalInstallments}`).join(", "),
    numbersOK,
  );

  // 4. Receber parcela 1 e testar side-effects
  const ar1 = ars[0];
  const beforeCash = await prisma.cashMovement.count({ where: { branchId: branchId! } });
  const beforeFin = await prisma.financeEntry.count({ where: { companyId: companyId! } });

  const received = await prisma.accountReceivable.update({
    where: { id: ar1.id },
    data: {
      status: "RECEIVED",
      receivedAmount: ar1.amount,
      receivedDate: new Date(),
      receivedByUserId: adminUserId!,
    },
  });
  recordResult(
    "4.7 parcela marcada RECEIVED",
    "status=RECEIVED",
    received.status,
    received.status === "RECEIVED",
  );

  const afterCash = await prisma.cashMovement.count({ where: { branchId: branchId! } });
  const afterFin = await prisma.financeEntry.count({ where: { companyId: companyId! } });

  const cashOK = afterCash > beforeCash;
  recordResult(
    "4.8 update direto de AR criou CashMovement?",
    "Esperado: +1 (se houvesse side-effect)",
    `${beforeCash} → ${afterCash}`,
    cashOK,
  );
  if (!cashOK) {
    recordBug(
      "prisma.accountReceivable.update direto NÃO dispara side-effect de caixa",
      "ALTO",
      "Não há trigger/middleware/hook que vincule update de AR.status=RECEIVED a uma entrada em CashMovement. A rota PATCH /api/accounts-receivable também faz update direto sem chamar service de caixa. Operadora marca parcela como recebida mas o dinheiro nunca entra no caixa do dia.",
      [
        "src/app/api/accounts-receivable/route.ts (handler PATCH)",
        "Falta um service tipo 'receiveInstallment' que faça tx { update AR + create CashMovement + create FinanceEntry }",
      ],
    );
  }

  const finOK = afterFin > beforeFin;
  recordResult(
    "4.9 update direto criou FinanceEntry?",
    "Esperado: +1",
    `${beforeFin} → ${afterFin}`,
    finOK,
  );

  // 5. Saldo restante
  const stillOpen = await prisma.accountReceivable.aggregate({
    where: { saleId: sale.id, status: "PENDING" },
    _sum: { amount: true },
  });
  const expectedRemaining = TOTAL - Number(ar1.amount);
  const got = Number(stillOpen._sum.amount ?? 0);
  recordResult(
    "4.10 saldo PENDING após receber 1ª",
    `R$ ${expectedRemaining.toFixed(2)}`,
    `R$ ${got.toFixed(2)}`,
    Math.abs(got - expectedRemaining) < 0.01,
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[QA-FAIL]", e);
  await prisma.$disconnect();
  process.exit(1);
});
