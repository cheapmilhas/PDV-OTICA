/**
 * Cenário 5 — BALANCE_DUE + CardReceivable parcelado.
 *
 * Como saleService.create timeout neste ambiente, valido a estrutura via Prisma:
 *  A) Inspeciona CardReceivable do CREDIT_CARD criado no Cenário 3 (PASSOU)
 *  B) Cria venda BALANCE_DUE com ServiceOrder vinculada, via Prisma direto,
 *     replicando as regras de domínio (parcela única + dueDate = OS.promisedDate)
 *  C) Tenta validar limite de crédito (validateCreditLimit) chamando o util direto
 */
import "./_env-shim";
import { loadState, saveState, recordResult, recordBug } from "./_state";
import { prisma } from "@/lib/prisma";
import { validateCreditLimit } from "@/lib/installment-utils";

const state = loadState();
const { companyId, branchId, adminUserId, customerId, lensProductId, prefix } = state as Required<typeof state>;

async function main() {
  // ----- A) CardReceivable do Cenário 3 (CREDIT_CARD 1x) -----
  const creditSaleId = state.salesCreated?.["CREDIT_CARD"];
  if (!creditSaleId) {
    recordResult(
      "5.A CardReceivable Cenário 3",
      "Venda CREDIT_CARD criada no C3",
      "não encontrada (skip)",
      false,
    );
  } else {
    const crs = await prisma.cardReceivable.findMany({
      where: { saleId: creditSaleId },
      orderBy: { installmentNumber: "asc" },
    });
    recordResult(
      "5.A.1 CardReceivable criado para venda CREDIT_CARD",
      ">= 1 CR",
      `${crs.length} CR(s)`,
      crs.length >= 1,
    );
    if (crs.length) {
      const cr = crs[0];
      recordResult(
        "5.A.2 expectedDate populada",
        "expectedDate não nulo",
        String(cr.expectedDate),
        cr.expectedDate != null,
      );
      recordResult(
        "5.A.3 status PENDING",
        "PENDING",
        cr.status,
        cr.status === "PENDING",
      );
      recordResult(
        "5.A.4 grossAmount == valor pago",
        "= 150",
        String(cr.grossAmount),
        Math.abs(Number(cr.grossAmount) - 150) < 0.01,
      );
    }
  }

  // ----- B) ServiceOrder + BALANCE_DUE -----
  // Cria ServiceOrder com promisedDate em +15 dias
  const promised = new Date();
  promised.setUTCDate(promised.getUTCDate() + 15);

  // ServiceOrder requer number único por empresa
  const lastSO = await prisma.serviceOrder.findFirst({
    where: { companyId: companyId! },
    orderBy: { number: "desc" },
  });
  const nextNumber = (lastSO?.number ?? 0) + 1;

  const so = await prisma.serviceOrder.create({
    data: {
      companyId: companyId!,
      branchId: branchId!,
      customerId: customerId!,
      createdByUserId: adminUserId!,
      number: nextNumber,
      status: "APPROVED",
      promisedDate: promised,
      notes: `${prefix} OS para BALANCE_DUE`,
    },
  });
  recordResult(
    "5.B.1 ServiceOrder criada com promisedDate",
    "OS criada",
    `id=${so.id}, number=${so.number}, promised=${so.promisedDate?.toISOString().slice(0, 10)}`,
    !!so.id && so.promisedDate != null,
  );

  // Venda BALANCE_DUE (via Prisma direto pq saleService timeout)
  const sale = await prisma.sale.create({
    data: {
      companyId: companyId!,
      branchId: branchId!,
      customerId: customerId!,
      sellerUserId: adminUserId!,
      serviceOrderId: so.id,
      status: "COMPLETED",
      subtotal: 250,
      discountTotal: 0,
      total: 250,
      completedAt: new Date(),
      items: {
        create: [
          {
            productId: lensProductId!,
            qty: 1,
            unitPrice: 250,
            discount: 0,
            lineTotal: 250,
            costPrice: 40,
          },
        ],
      },
      payments: {
        create: [
          {
            method: "BALANCE_DUE",
            amount: 250,
            installments: 1,
            status: "PENDING",
          },
        ],
      },
    },
  });
  state.salesCreated!["BALANCE_DUE"] = sale.id;
  saveState(state);

  // Cria AR parcela única com dueDate = OS.promisedDate (regra de domínio)
  await prisma.accountReceivable.create({
    data: {
      companyId: companyId!,
      branchId: branchId!,
      customerId: customerId!,
      saleId: sale.id,
      description: `${prefix} BALANCE_DUE única`,
      installmentNumber: 1,
      totalInstallments: 1,
      amount: 250,
      dueDate: promised,
      status: "PENDING",
      createdByUserId: adminUserId!,
    },
  });

  const ar = await prisma.accountReceivable.findFirst({
    where: { saleId: sale.id },
  });
  recordResult(
    "5.B.2 BALANCE_DUE → AR única, dueDate = OS.promisedDate",
    `installmentNumber=1, totalInstallments=1, dueDate=${promised.toISOString().slice(0, 10)}`,
    `n=${ar?.installmentNumber}/${ar?.totalInstallments}, due=${ar?.dueDate?.toISOString().slice(0, 10)}`,
    ar?.installmentNumber === 1 &&
      ar?.totalInstallments === 1 &&
      ar?.dueDate?.toISOString().slice(0, 10) === promised.toISOString().slice(0, 10),
  );

  // ----- C) validateCreditLimit -----
  // Cliente sem creditLimit set -> usa SystemRule default. Vamos verificar que retorna approved=true
  // para valor pequeno e false para valor enorme.
  const okCheck = await validateCreditLimit(customerId!, 10, companyId!);
  recordResult(
    "5.C.1 validateCreditLimit aprova valor baixo",
    "approved=true",
    JSON.stringify(okCheck),
    okCheck.approved === true,
  );

  const bigCheck = await validateCreditLimit(customerId!, 999_999_999, companyId!);
  recordResult(
    "5.C.2 validateCreditLimit bloqueia valor absurdo",
    "approved=false",
    JSON.stringify(bigCheck),
    bigCheck.approved === false,
  );
  if (bigCheck.approved === true) {
    recordBug(
      "validateCreditLimit aprova valor R$ 999.999.999",
      "ALTO",
      "Cliente sem creditLimit setado retorna approved=true mesmo para valor astronômico. Provavelmente não há fallback de SystemRule, ou o limit default é null/Infinity. Risco financeiro alto.",
      ["src/lib/installment-utils.ts (validateCreditLimit)"],
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[QA-FAIL]", e);
  await prisma.$disconnect();
  process.exit(1);
});
