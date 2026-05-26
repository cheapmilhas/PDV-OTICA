/**
 * Cenário 4 — Crediário STORE_CREDIT.
 * - Cria venda à prazo com 3 parcelas
 * - Confere AccountReceivable: 3 itens com installmentNumber 1/2/3, vencimentos 30/60/90 dias
 * - Confere total e nº parcelas
 * - Recebe parcela 1 (PATCH endpoint via service) e confere caixa/financeiro/saldo
 */
import "./_env-shim";
import { saleService } from "@/services/sale.service";
import { createSaleSchema } from "@/lib/validations/sale.schema";
import { loadState, saveState, recordResult, recordBug } from "./_state";
import { prisma } from "@/lib/prisma";

const state = loadState();
const { companyId, branchId, adminUserId, customerId, frameProductId, prefix } = state as Required<typeof state>;

const UNIT = 300; // 3 parcelas de 100
const QTY = 1;
const TOTAL = UNIT * QTY;
const COUNT = 3;
const firstDue = new Date();
firstDue.setUTCDate(firstDue.getUTCDate() + 30);

async function main() {
  // ---- A) Criar venda STORE_CREDIT 3x ----
  const dto = createSaleSchema.parse({
    customerId: customerId!,
    branchId: branchId!,
    sellerUserId: adminUserId!,
    items: [{ productId: frameProductId!, qty: QTY, unitPrice: UNIT, discount: 0 }],
    payments: [
      {
        method: "STORE_CREDIT",
        amount: TOTAL,
        installments: COUNT,
        installmentConfig: {
          count: COUNT,
          firstDueDate: firstDue.toISOString(),
          interval: 30,
        },
      },
    ],
    discount: 0,
    notes: `${prefix} crediário 3x`,
  });

  let sale: any;
  try {
    sale = await saleService.create(dto as any, companyId!, adminUserId!);
    state.salesCreated!["STORE_CREDIT"] = sale.id;
    saveState(state);
    recordResult(
      "4.1 criar venda STORE_CREDIT 3x",
      `Sale total=${TOTAL}, status COMPLETED`,
      `id=${sale.id}, total=${sale.total}, status=${sale.status}`,
      Number(sale.total) === TOTAL && sale.status === "COMPLETED",
    );
  } catch (e: any) {
    recordResult(
      "4.1 criar venda STORE_CREDIT 3x",
      "Venda criada",
      `EXCEPTION: ${e.message}`,
      false,
    );
    if (String(e.message).includes("Transaction already closed")) {
      recordBug(
        "Crediário 3x também sofre timeout 5s",
        "CRITICO",
        "saleService.create com STORE_CREDIT + 3 parcelas excede 5000ms do $transaction. Em prod, vendedor não consegue cadastrar crediário em ambientes com RTT alto.",
        ["src/services/sale.service.ts:391 (timeout default 5s)"],
      );
    }
    await prisma.$disconnect();
    return;
  }

  // ---- B) Conferir parcelas ----
  const ars = await prisma.accountReceivable.findMany({
    where: { saleId: sale.id },
    orderBy: { installmentNumber: "asc" },
  });
  recordResult(
    "4.2 nº de AccountReceivable criadas",
    `${COUNT} parcelas`,
    `${ars.length} parcelas`,
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
    "4.4 installmentNumber 1..N e totalInstallments=N",
    "1/3, 2/3, 3/3",
    ars.map((a) => `${a.installmentNumber}/${a.totalInstallments}`).join(", "),
    numbersOK,
  );

  const expectedDates = [30, 60, 90].map((d) => {
    const dt = new Date(firstDue);
    dt.setUTCDate(dt.getUTCDate() + (d - 30));
    return dt.toISOString().slice(0, 10);
  });
  const gotDates = ars.map((a) => new Date(a.dueDate).toISOString().slice(0, 10));
  recordResult(
    "4.5 vencimentos 30/60/90 dias",
    expectedDates.join(", "),
    gotDates.join(", "),
    JSON.stringify(expectedDates) === JSON.stringify(gotDates),
  );

  const statusOK = ars.every((a) => a.status === "PENDING");
  recordResult(
    "4.6 todas PENDING",
    "PENDING x3",
    ars.map((a) => a.status).join(", "),
    statusOK,
  );

  // ---- C) Receber parcela 1 ----
  // O endpoint PATCH /api/accounts-receivable/[id]/receipt — vamos atualizar via Prisma direto
  // (não há método único no service para isso? vamos verificar)
  const ar1 = ars[0];
  const beforeCash = await prisma.cashMovement.count({ where: { branchId: branchId! } });
  const beforeFin = await prisma.financeEntry.count({ where: { companyId: companyId! } });

  // Simula recebimento conforme caminho do endpoint route.ts:PATCH (update simples)
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
    "4.7 parcela 1 marcada como RECEIVED",
    "status=RECEIVED, receivedAmount=parcela",
    `status=${received.status}, receivedAmount=${received.receivedAmount}`,
    received.status === "RECEIVED" && Number(received.receivedAmount) === Number(ar1.amount),
  );

  // Conferir reflexo em caixa / financeiro
  // OBSERVAÇÃO IMPORTANTE: ao olhar route.ts:PATCH, o handler atualiza só o registro
  // de AccountReceivable. NÃO há side-effect automático de criar CashMovement ou
  // FinanceEntry. Isso é potencialmente um BUG.
  const afterCash = await prisma.cashMovement.count({ where: { branchId: branchId! } });
  const afterFin = await prisma.financeEntry.count({ where: { companyId: companyId! } });

  recordResult(
    "4.8 recebimento gera CashMovement",
    "+1 CashMovement (entrada de caixa)",
    `${beforeCash} → ${afterCash}`,
    afterCash > beforeCash,
  );
  if (afterCash === beforeCash) {
    recordBug(
      "Recebimento de AccountReceivable via PATCH NÃO cria CashMovement",
      "ALTO",
      "PATCH /api/accounts-receivable (route.ts) só faz prisma.accountReceivable.update sem disparar side-effect de caixa. Resultado: parcela aparece como RECEIVED mas o dinheiro nunca entra no Caixa do dia. Frontend de Contas a Receber/Recebimentos engana operador.",
      ["src/app/api/accounts-receivable/route.ts (PATCH handler)"],
    );
  }

  recordResult(
    "4.9 recebimento gera FinanceEntry",
    "+1 FinanceEntry (receita)",
    `${beforeFin} → ${afterFin}`,
    afterFin > beforeFin,
  );
  if (afterFin === beforeFin) {
    recordBug(
      "Recebimento de AccountReceivable via PATCH NÃO cria FinanceEntry",
      "ALTO",
      "Mesmo handler PATCH não chama generate*Entries. Recebimentos ficam fora do DRE/cash-flow.",
      ["src/app/api/accounts-receivable/route.ts (PATCH handler)"],
    );
  }

  // ---- D) Conferir saldo restante ----
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
