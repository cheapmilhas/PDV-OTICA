import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { reverseLeadWinForSaleInTx } from "@/services/sale-side-effects.service";
import { LEAD_STAGE_KEYS } from "@/lib/lead-stage-keys";

/**
 * Funil Inteligente — reversão do auto-Ganho no estorno/cancelamento.
 *
 * Quando uma venda que disparou auto-Ganho é estornada/cancelada, o card do
 * lead deve SAIR de "Ganho" (senão o funil mente: card Ganho de venda que não
 * existe mais). Regras:
 *  - só reverte se a venda tem leadId;
 *  - só se o lead está num estágio que ESTE serviço auto-moveu: Ganho (isWon) OU
 *    "Exame feito" (systemKey EXAM_DONE). Não mexe se humano já moveu p/ outro lugar;
 *  - volta p/ o 1º estágio não-terminal (menor order) da ótica;
 *  - fail-safe: erro NÃO propaga (não pode travar o cancelamento da venda).
 *  - multi-tenant: companyId em todo filtro/update.
 */
describe("reverseLeadWinForSaleInTx — desfaz o auto-Ganho no estorno", () => {
  function makeTx(overrides: Record<string, any> = {}) {
    return {
      sale: { findUnique: vi.fn() },
      lead: { findFirst: vi.fn(), updateMany: vi.fn() },
      leadStage: { findFirst: vi.fn() },
      ...overrides,
    } as any;
  }

  const WON = { id: "s_won", isWon: true, isLost: false, systemKey: null };
  const EXAM_DONE = { id: "s_exam", isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_DONE };
  const FIRST_OPEN = { id: "s_novo" };

  beforeEach(() => vi.clearAllMocks());

  it("no-op quando a venda não tem leadId", async () => {
    const tx = makeTx();
    tx.sale.findUnique.mockResolvedValue({ leadId: null });

    await reverseLeadWinForSaleInTx(tx, { saleId: "sale_1", companyId: "co_1" });

    expect(tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it("reverte: lead em Ganho volta p/ o 1º estágio não-terminal (menor order)", async () => {
    const tx = makeTx();
    tx.sale.findUnique.mockResolvedValue({ leadId: "lead_1" });
    tx.lead.findFirst.mockResolvedValue({ id: "lead_1", stage: WON });
    tx.leadStage.findFirst.mockResolvedValue(FIRST_OPEN);

    await reverseLeadWinForSaleInTx(tx, { saleId: "sale_1", companyId: "co_1" });

    // resolve o 1º estágio NÃO-terminal por order asc
    const stageQuery = tx.leadStage.findFirst.mock.calls[0][0];
    expect(stageQuery.where).toMatchObject({ companyId: "co_1", isWon: false, isLost: false });
    expect(stageQuery.orderBy).toMatchObject({ order: "asc" });
    // move o lead de volta, com companyId no where
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead_1", companyId: "co_1" },
        data: expect.objectContaining({ stageId: "s_novo" }),
      }),
    );
  });

  it("reverte: lead em 'Exame feito' (EXAM_DONE, isWon=false) volta p/ o 1º estágio aberto", async () => {
    const tx = makeTx();
    tx.sale.findUnique.mockResolvedValue({ leadId: "lead_1" });
    tx.lead.findFirst.mockResolvedValue({ id: "lead_1", stage: EXAM_DONE });
    tx.leadStage.findFirst.mockResolvedValue(FIRST_OPEN);

    await reverseLeadWinForSaleInTx(tx, { saleId: "sale_1", companyId: "co_1" });

    // resolve o 1º estágio não-terminal (mesmo caminho de volta do Ganho)
    const stageQuery = tx.leadStage.findFirst.mock.calls[0][0];
    expect(stageQuery.where).toMatchObject({ companyId: "co_1", isWon: false, isLost: false });
    expect(stageQuery.orderBy).toMatchObject({ order: "asc" });
    // move o card de "Exame feito" de volta — senão fica preso p/ uma venda estornada
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead_1", companyId: "co_1" },
        data: expect.objectContaining({ stageId: "s_novo" }),
      }),
    );
  });

  it("NÃO mexe se o lead já saiu de Ganho (humano moveu p/ outro estágio)", async () => {
    const tx = makeTx();
    tx.sale.findUnique.mockResolvedValue({ leadId: "lead_1" });
    // lead atualmente NÃO está em isWon
    tx.lead.findFirst.mockResolvedValue({ id: "lead_1", stage: { id: "s_atend", isWon: false, isLost: false, systemKey: null } });

    await reverseLeadWinForSaleInTx(tx, { saleId: "sale_1", companyId: "co_1" });

    expect(tx.leadStage.findFirst).not.toHaveBeenCalled();
    expect(tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it("NÃO mexe se humano moveu p/ um estágio comum não-terminal (nem isWon nem EXAM_DONE)", async () => {
    const tx = makeTx();
    tx.sale.findUnique.mockResolvedValue({ leadId: "lead_1" });
    // "Em atendimento": aberto, sem flag de sistema → decisão humana, respeita
    tx.lead.findFirst.mockResolvedValue({
      id: "lead_1",
      stage: { id: "s_atend", isWon: false, isLost: false, systemKey: null },
    });

    await reverseLeadWinForSaleInTx(tx, { saleId: "sale_1", companyId: "co_1" });

    expect(tx.leadStage.findFirst).not.toHaveBeenCalled();
    expect(tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it("NÃO mexe se o lead foi para Perdido depois (terminal isLost)", async () => {
    const tx = makeTx();
    tx.sale.findUnique.mockResolvedValue({ leadId: "lead_1" });
    tx.lead.findFirst.mockResolvedValue({ id: "lead_1", stage: { id: "s_lost", isWon: false, isLost: true, systemKey: null } });

    await reverseLeadWinForSaleInTx(tx, { saleId: "sale_1", companyId: "co_1" });

    expect(tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it("no-op (seguro) se a ótica não tem estágio não-terminal p/ onde voltar", async () => {
    const tx = makeTx();
    tx.sale.findUnique.mockResolvedValue({ leadId: "lead_1" });
    tx.lead.findFirst.mockResolvedValue({ id: "lead_1", stage: WON });
    tx.leadStage.findFirst.mockResolvedValue(null); // nenhum estágio aberto

    await reverseLeadWinForSaleInTx(tx, { saleId: "sale_1", companyId: "co_1" });

    expect(tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it("no-op se o lead vinculado não existe mais (deletado)", async () => {
    const tx = makeTx();
    tx.sale.findUnique.mockResolvedValue({ leadId: "lead_1" });
    tx.lead.findFirst.mockResolvedValue(null);

    await reverseLeadWinForSaleInTx(tx, { saleId: "sale_1", companyId: "co_1" });

    expect(tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it("fail-safe: erro NÃO propaga (não trava o cancelamento)", async () => {
    const tx = makeTx();
    tx.sale.findUnique.mockRejectedValue(new Error("db down"));

    await expect(
      reverseLeadWinForSaleInTx(tx, { saleId: "sale_1", companyId: "co_1" }),
    ).resolves.toBeUndefined();
  });
});
