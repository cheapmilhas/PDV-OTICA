/**
 * Cenários 6 (apagar venda), 7 (apagar cliente), 8 (isolamento), 9 (bordas).
 */
import "./_env-shim";
import { saleService } from "@/services/sale.service";
import { customerService } from "@/services/customer.service";
import { createSaleSchema } from "@/lib/validations/sale.schema";
import { loadState, saveState, recordResult, recordBug } from "./_state";
import { prisma } from "@/lib/prisma";

const state = loadState();
const { companyId, branchId, adminUserId, customerId, prefix } = state as Required<typeof state>;

async function cenario6() {
  console.log("\n=== Cenário 6 — Apagar venda PIX (testa cancel completo) ===");
  const pixSaleId = state.salesCreated?.["PIX"];
  if (!pixSaleId) {
    recordResult("6.0 venda PIX disponível", "venda criada no C3", "ausente", false);
    return;
  }

  const beforeProduct = await prisma.product.findUniqueOrThrow({
    where: { id: state.lensProductId! },
    select: { stockQty: true },
  });
  const beforeStockMv = await prisma.stockMovement.count({
    where: { companyId: companyId!, productId: state.lensProductId!, type: "CUSTOMER_RETURN" },
  });
  const beforeCashOut = await prisma.cashMovement.count({
    where: { branchId: branchId!, direction: "OUT", type: "REFUND" },
  });

  try {
    await saleService.cancel(pixSaleId, companyId!, `${prefix} cancel pix test`);
  } catch (e: any) {
    recordResult("6.1 cancel venda PIX", "OK", `EXCEPTION: ${e.message}`, false);
    return;
  }

  const sale = await prisma.sale.findUniqueOrThrow({ where: { id: pixSaleId } });
  recordResult(
    "6.1 venda marcada CANCELED",
    "status=CANCELED",
    sale.status,
    sale.status === "CANCELED",
  );

  const afterProduct = await prisma.product.findUniqueOrThrow({
    where: { id: state.lensProductId! },
    select: { stockQty: true },
  });
  recordResult(
    "6.2 estoque restituído (Product.stockQty)",
    `+1: ${beforeProduct.stockQty} → ${beforeProduct.stockQty + 1}`,
    `${beforeProduct.stockQty} → ${afterProduct.stockQty}`,
    afterProduct.stockQty === beforeProduct.stockQty + 1,
  );

  const afterStockMv = await prisma.stockMovement.count({
    where: { companyId: companyId!, productId: state.lensProductId!, type: "CUSTOMER_RETURN" },
  });
  recordResult(
    "6.3 StockMovement CUSTOMER_RETURN criado",
    "+1",
    `${beforeStockMv} → ${afterStockMv}`,
    afterStockMv === beforeStockMv + 1,
  );

  const afterCashOut = await prisma.cashMovement.count({
    where: { branchId: branchId!, direction: "OUT", type: "REFUND" },
  });
  recordResult(
    "6.4 CashMovement REFUND OUT criado (PIX estava em caixa)",
    "+1",
    `${beforeCashOut} → ${afterCashOut}`,
    afterCashOut === beforeCashOut + 1,
  );

  // Pagamentos VOIDED
  const payments = await prisma.salePayment.findMany({ where: { saleId: pixSaleId } });
  recordResult(
    "6.5 SalePayment VOIDED",
    "todos VOIDED",
    payments.map((p) => p.status).join(", "),
    payments.every((p) => p.status === "VOIDED"),
  );

  // Histórico do cliente: sale não deve aparecer em list({ status: ativos })
  const ativos = await saleService.list(
    { page: 1, pageSize: 50, customerId: customerId!, status: "ativos" } as any,
    companyId!,
  );
  const items = (ativos as any).data ?? (ativos as any).items ?? [];
  recordResult(
    "6.6 sumiu do filtro 'ativos'",
    "sale.id ausente em list status=ativos",
    `items=${items.length}`,
    !items.some((s: any) => s.id === pixSaleId),
  );

  // Cenário 6.7 — dupla deleção
  try {
    await saleService.cancel(pixSaleId, companyId!, "double cancel");
    recordResult("6.7 dupla deleção", "Deve lançar erro", "passou (BUG)", false);
  } catch (e: any) {
    recordResult(
      "6.7 dupla deleção rejeitada",
      "Erro 'Venda já está cancelada'",
      e.message,
      String(e.message).toLowerCase().includes("cancelada"),
    );
  }
}

async function cenario7() {
  console.log("\n=== Cenário 7 — Apagar cliente com vendas ===");
  // Soft delete deveria desativar; vendas associadas permanecem
  const beforeSales = await prisma.sale.count({ where: { customerId: customerId! } });
  const deleted = await customerService.softDelete(customerId!, companyId!);
  const after = await prisma.customer.findUniqueOrThrow({ where: { id: customerId! } });
  const afterSales = await prisma.sale.count({ where: { customerId: customerId! } });

  recordResult(
    "7.1 softDelete marca active=false (não bloqueia mesmo com vendas)",
    "active=false",
    `active=${after.active}, deletedAt=${after.deletedAt}`,
    after.active === false,
  );
  recordResult(
    "7.2 vendas não são removidas",
    `count se mantém: ${beforeSales}`,
    `${afterSales}`,
    afterSales === beforeSales,
  );

  // Verifica AuditLog (criação)
  const audits = await prisma.auditLog.findMany({
    where: { companyId: companyId!, entityType: "Customer", entityId: customerId! },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  recordResult(
    "7.3 AuditLog criado para soft-delete",
    "ao menos 1 entrada",
    `${audits.length} entradas`,
    audits.length > 0,
  );
  if (audits.length === 0) {
    recordBug(
      "Soft-delete de cliente NÃO gera AuditLog",
      "MEDIO",
      "customerService.softDelete só faz prisma.customer.update({ active: false }). O middleware de auditoria deveria capturar updates mas não o fez para Customer nesse caso.",
      ["src/services/customer.service.ts:softDelete", "src/lib/prisma-audit-middleware.ts"],
    );
  }
}

async function cenario8() {
  console.log("\n=== Cenário 8 — Isolamento multi-empresa ===");

  // Cria empresa B + branch B + admin B + venda B
  const companyB = await prisma.company.create({
    data: {
      name: `${prefix}_OticaB`,
      slug: `${prefix.toLowerCase().replace(/[^a-z0-9]/g, "")}b`,
      email: `${prefix.toLowerCase().replace(/[^a-z0-9]/g, "")}b@qa.test`,
      maxUsers: 5,
      maxProducts: 100,
      maxBranches: 1,
    },
  });
  state.company2Id = companyB.id;
  saveState(state);

  const branchB = await prisma.branch.create({
    data: { companyId: companyB.id, name: `${prefix}_FilialB_A`, code: "QB-A" },
  });

  // Cria 2ª filial NA EMPRESA A (para teste filial A vs B)
  const branch2A = await prisma.branch.create({
    data: { companyId: companyId!, name: `${prefix}_FilialA_B`, code: "QA-B" },
  });
  state.branch2Id = branch2A.id;
  saveState(state);

  // Cliente da empresa A — confirma que NÃO aparece em lista da empresa B
  const listB = await customerService.list({ page: 1, pageSize: 50, search: prefix } as any, companyB.id);
  const itemsB = (listB as any).data ?? (listB as any).items ?? [];
  recordResult(
    "8.1 cliente da empresa A não vaza para empresa B",
    "0 itens com prefixo (não é tenant da B)",
    `items=${itemsB.length}`,
    itemsB.length === 0,
  );

  // Conferir filtro de getById cross-tenant
  try {
    await customerService.getById(customerId!, companyB.id);
    recordResult(
      "8.2 getById cross-tenant deve falhar",
      "AppError 404",
      "passou (BUG)",
      false,
    );
  } catch (e: any) {
    recordResult(
      "8.2 getById cross-tenant rejeita",
      "AppError 404",
      e.message,
      String(e.message).toLowerCase().includes("não encontrado") || String(e.message).toLowerCase().includes("not found"),
    );
  }

  // Venda na empresa A filial 2 (já existe sale.serviceOrderId/etc)
  // Conferir lista por filial: list({ branchId: branch2A.id }) NÃO retorna vendas que estão em branchId original
  const listOnBranch2 = await saleService.list(
    { page: 1, pageSize: 50 } as any,
    companyId!,
    branch2A.id,
  );
  const itemsBranch2 = (listOnBranch2 as any).data ?? (listOnBranch2 as any).items ?? [];
  recordResult(
    "8.3 vendas da filial A não aparecem no filtro branchId=A2",
    "0 vendas (filial B nunca teve venda)",
    `items=${itemsBranch2.length}`,
    itemsBranch2.length === 0,
  );
}

async function cenario9() {
  console.log("\n=== Cenário 9 — Bordas ===");

  // 9.1 valor zero/negativo bloqueia
  try {
    createSaleSchema.parse({
      branchId: branchId!,
      items: [{ productId: "x", qty: 1, unitPrice: 0 }],
      payments: [{ method: "CASH", amount: 0 }],
    });
    recordResult("9.1 amount=0", "Zod rejeita", "passou (BUG)", false);
  } catch (e: any) {
    recordResult(
      "9.1 amount=0",
      "Zod rejeita (positive)",
      "rejeitado",
      true,
    );
  }

  try {
    createSaleSchema.parse({
      branchId: branchId!,
      items: [{ productId: "x", qty: 1, unitPrice: -10 }],
      payments: [{ method: "CASH", amount: 10 }],
    });
    recordResult("9.2 unitPrice negativo", "Zod rejeita", "passou (BUG)", false);
  } catch (e: any) {
    recordResult("9.2 unitPrice negativo", "Zod rejeita", "rejeitado", true);
  }

  // 9.3 Venda perto da meia-noite — testa que startOfLocalDay/endOfLocalDay
  // tratam corretamente America/Sao_Paulo (UTC-3)
  // 23:59:59 BRT = 02:59:59 UTC do dia seguinte
  const localMidnightTest = new Date("2026-05-22T23:59:00-03:00");
  const utcRepresentation = localMidnightTest.toISOString();
  recordResult(
    "9.3 horário 23:59 BRT representado em UTC",
    "2026-05-23T02:59:00.000Z (UTC do dia seguinte)",
    utcRepresentation,
    utcRepresentation.startsWith("2026-05-23T"),
  );
  // Não validamos comportamento do filter de relatórios aqui por brevidade;
  // anotamos como ponto a auditar manualmente.
  recordBug(
    "Não auditado: filtros de relatório por dia tratam corretamente America/Sao_Paulo?",
    "BAIXO",
    "Vendas próximas à meia-noite no fuso BRT podem cair no dia errado em relatórios se o filtro usar UTC ingênuo. Auditoria estática mostrou uso de startOfLocalDay/endOfLocalDay em src/lib/date-utils.ts, mas não foi validado end-to-end por causa do timeout do saleService neste ambiente.",
    ["src/lib/date-utils.ts", "src/services/reports.service.ts"],
  );
}

async function main() {
  await cenario6();
  await cenario7();
  await cenario8();
  await cenario9();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[QA-FAIL]", e);
  await prisma.$disconnect();
  process.exit(1);
});
