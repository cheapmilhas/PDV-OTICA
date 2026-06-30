/**
 * Cenário 5 — Funil Inteligente Fatia 1: elo Lead↔Sale + auto-Ganho determinístico.
 *
 * Exercita END-TO-END (banco real de TESTE, nunca prod) o que a suíte unitária
 * só cobre com `tx` mockado: quando uma venda é criada com customerId, o helper
 * `linkLeadAndMaybeWinInTx` deve gravar Sale.leadId e mover o lead aberto p/ o
 * estágio Ganho (isWon) da ótica.
 *
 * Cobre:
 *  5.1 — lead ABERTO + venda → Sale.leadId gravado + lead movido p/ isWon
 *  5.2 — multi-tenant: o vínculo é da própria empresa (companyId bate)
 *  5.3 — re-compra (lead já terminal) → só vincula, NÃO re-move (idempotente)
 *  5.4 — venda SEM customerId → não vincula nada
 *  5.5 — ESTORNO da venda: verifica se o auto-Ganho é revertido
 *        (achado da auditoria: HOJE não é — registra BUG se confirmar)
 *
 * Pré-requisito: 01-setup.ts e 02-customer.ts (state com company/branch/customer).
 * Roda com: TEST_DATABASE_URL apontando p/ branch de teste do Neon (guard aborta prod).
 */
import "./_env-shim";
import { saleService } from "@/services/sale.service";
import { createSaleSchema } from "@/lib/validations/sale.schema";
import { loadState, recordResult, recordBug } from "./_state";
import { prisma } from "@/lib/prisma";

const state = loadState();
const { companyId, branchId, adminUserId, customerId, frameProductId, prefix } =
  state as Required<typeof state>;

/**
 * Garante BranchStock com saldo p/ o produto na filial. O 01-setup só seta
 * Product.stockQty (cache legado); o débito atômico real usa BranchStock por
 * filial. Sem isso a venda falha com "Estoque insuficiente. Disponível: 0".
 */
async function ensureBranchStock(productId: string, qty: number) {
  await prisma.branchStock.upsert({
    where: { branchId_productId: { branchId, productId } },
    update: { quantity: qty },
    create: { branchId, productId, quantity: qty },
  });
}

/** Garante 1 estágio aberto e 1 estágio Ganho (isWon) na ótica de teste. */
async function ensureStages() {
  const open = await prisma.leadStage.upsert({
    where: { companyId_name: { companyId, name: `${prefix}_Novo` } },
    update: {},
    create: { companyId, name: `${prefix}_Novo`, order: 0, isWon: false, isLost: false },
  });
  const won = await prisma.leadStage.upsert({
    where: { companyId_name: { companyId, name: `${prefix}_Ganho` } },
    update: {},
    create: { companyId, name: `${prefix}_Ganho`, order: 99, isWon: true, isLost: false },
  });
  return { openStageId: open.id, wonStageId: won.id };
}

/** Cria um lead aberto p/ o customer no estágio aberto. */
async function createOpenLead(openStageId: string, name: string) {
  return prisma.lead.create({
    data: {
      companyId,
      name,
      customerId,
      stageId: openStageId,
      source: "WHATSAPP",
      lastActivityAt: new Date(),
    },
    select: { id: true },
  });
}

/** Cria venda à vista (CASH) com (ou sem) customerId via o service real. */
async function createSale(withCustomer: boolean, label: string) {
  const dto = createSaleSchema.parse({
    ...(withCustomer ? { customerId } : {}),
    branchId,
    sellerUserId: adminUserId,
    items: [{ productId: frameProductId, qty: 1, unitPrice: 200, discount: 0 }],
    payments: [{ method: "CASH", amount: 200, installments: 1 }],
    discount: 0,
    notes: `${prefix} ${label}`,
  });
  return saleService.create(dto as any, companyId, adminUserId);
}

async function main() {
  const { openStageId, wonStageId } = await ensureStages();
  // Saldo suficiente p/ as 3 vendas do cenário (5.1, 5.3, 5.4).
  await ensureBranchStock(frameProductId, 10);
  // Idempotência: limpa leads do cliente de execuções anteriores p/ o cenário
  // partir de estado conhecido (1 único lead aberto criado abaixo).
  await prisma.sale.updateMany({ where: { companyId, customerId, leadId: { not: null } }, data: { leadId: null } });
  await prisma.lead.deleteMany({ where: { companyId, customerId } });

  // ---- 5.1 lead aberto + venda → vínculo + auto-Ganho ----
  console.log("\n=== Cenário 5.1 — lead aberto + venda → auto-Ganho ===");
  const lead1 = await createOpenLead(openStageId, `${prefix}_Lead_AutoGanho`);
  let sale1Id = "";
  try {
    const sale1 = await createSale(true, "venda-auto-ganho");
    sale1Id = sale1.id;
    const saleAfter = await prisma.sale.findUniqueOrThrow({
      where: { id: sale1.id },
      select: { leadId: true, companyId: true },
    });
    const leadAfter = await prisma.lead.findUniqueOrThrow({
      where: { id: lead1.id },
      select: { stageId: true, companyId: true },
    });

    recordResult(
      "5.1.1 Sale.leadId gravado com o lead aberto",
      `leadId=${lead1.id}`,
      `leadId=${saleAfter.leadId}`,
      saleAfter.leadId === lead1.id,
    );
    recordResult(
      "5.1.2 lead movido p/ o estágio Ganho (isWon)",
      `stageId=${wonStageId}`,
      `stageId=${leadAfter.stageId}`,
      leadAfter.stageId === wonStageId,
    );
    // ---- 5.2 multi-tenant ----
    recordResult(
      "5.2 vínculo é tenant-safe (Sale.companyId == Lead.companyId == empresa de teste)",
      `companyId=${companyId}`,
      `sale.companyId=${saleAfter.companyId}, lead.companyId=${leadAfter.companyId}`,
      saleAfter.companyId === companyId && leadAfter.companyId === companyId,
    );
  } catch (e: any) {
    recordResult("5.1.0 criar venda c/ lead aberto", "venda criada", `EXCEPTION: ${e.message ?? e}`, false);
    recordBug("Auto-Ganho falhou ao criar venda com lead aberto", "ALTO",
      `saleService.create lançou: ${e.message ?? e}`, ["src/services/sale-side-effects.service.ts"]);
  }

  // ---- 5.3 re-compra: lead já terminal → só vincula, NÃO re-move ----
  console.log("\n=== Cenário 5.3 — re-compra (lead terminal) é idempotente ===");
  try {
    // lead1 agora está em Ganho (terminal). Nova venda do mesmo cliente.
    const sale2 = await createSale(true, "re-compra");
    const sale2After = await prisma.sale.findUniqueOrThrow({
      where: { id: sale2.id }, select: { leadId: true },
    });
    const lead1After = await prisma.lead.findUniqueOrThrow({
      where: { id: lead1.id }, select: { stageId: true, lastActivityAt: true },
    });
    // o vínculo aponta p/ o lead terminal (mais recente do cliente); o estágio NÃO muda.
    recordResult(
      "5.3.1 re-compra vincula ao lead (mesmo terminal)",
      `leadId=${lead1.id}`,
      `leadId=${sale2After.leadId}`,
      sale2After.leadId === lead1.id,
    );
    recordResult(
      "5.3.2 lead terminal NÃO é re-movido (continua em Ganho)",
      `stageId=${wonStageId} (inalterado)`,
      `stageId=${lead1After.stageId}`,
      lead1After.stageId === wonStageId,
    );
  } catch (e: any) {
    recordResult("5.3.0 re-compra", "ok", `EXCEPTION: ${e.message ?? e}`, false);
  }

  // ---- 5.4 venda SEM customerId → não vincula ----
  console.log("\n=== Cenário 5.4 — venda walk-in anônima não vincula ===");
  try {
    const sale3 = await createSale(false, "walk-in-anonima");
    const sale3After = await prisma.sale.findUniqueOrThrow({
      where: { id: sale3.id }, select: { leadId: true },
    });
    recordResult(
      "5.4 venda sem customerId → Sale.leadId null",
      "leadId=null",
      `leadId=${sale3After.leadId}`,
      sale3After.leadId === null,
    );
  } catch (e: any) {
    recordResult("5.4.0 walk-in anônima", "ok", `EXCEPTION: ${e.message ?? e}`, false);
  }

  // ---- 5.5 ESTORNO: o auto-Ganho é revertido? (achado da auditoria) ----
  console.log("\n=== Cenário 5.5 — estorno reverte o auto-Ganho? ===");
  if (sale1Id) {
    try {
      await saleService.refundFull(sale1Id, companyId, { reason: `${prefix} teste-estorno` });
      const leadAfterRefund = await prisma.lead.findUniqueOrThrow({
        where: { id: lead1.id }, select: { stageId: true },
      });
      const stillWon = leadAfterRefund.stageId === wonStageId;
      // EXPECTATIVA DE PRODUTO (a confirmar com o dono): estorno deveria reverter
      // o card de Ganho. HOJE não reverte → registramos como BUG conhecido, não
      // como falha do teste (o teste documenta o comportamento real).
      recordResult(
        "5.5 estorno reverte o card de Ganho (comportamento DESEJADO)",
        "lead sai de Ganho após estorno",
        stillWon ? "lead CONTINUA em Ganho (não revertido)" : "lead saiu de Ganho",
        !stillWon,
        stillWon ? "Achado confirmado: auto-Ganho NÃO é revertido no estorno." : undefined,
      );
      if (stillWon) {
        recordBug(
          "Estorno de venda não reverte o auto-Ganho do lead (card fica 'Ganho' mentindo)",
          "MEDIO",
          "Cria lead aberto → venda (card vai p/ Ganho) → refundFull → card continua em Ganho. " +
          "linkLeadAndMaybeWinInTx só roda na criação; refundFull reverte comissão/cashback mas não o lead.",
          ["src/services/sale.service.ts:1188", "src/services/sale-side-effects.service.ts"],
        );
      }
    } catch (e: any) {
      recordResult("5.5.0 estorno", "estorno executa", `EXCEPTION: ${e.message ?? e}`, false);
    }
  } else {
    recordResult("5.5.0 estorno", "venda 5.1 disponível", "pulado — venda 5.1 não foi criada", false);
  }

  console.log("\n[QA] Cenário 5 concluído. Veja .state.json p/ results/bugs.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[QA-FAIL]", err);
  await prisma.$disconnect();
  process.exit(1);
});
