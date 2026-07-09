import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { linkLeadAndMaybeWinInTx } from "@/services/sale-side-effects.service";
import { LEAD_STAGE_KEYS } from "@/lib/lead-stage-keys";

/**
 * Funil Inteligente — Fatia 1: elo determinístico Lead↔Sale + auto-Ganho.
 *
 * Decisões de produto:
 * - Elo por customerId no momento da venda (na tx, fail-safe igual ao ledger).
 * - Casa o lead ABERTO (não-terminal) mais recente por lastActivityAt.
 * - Move p/ o LeadStage isWon=true (maior order) da ótica.
 * - Lead terminal: NÃO mexe no card (só grava o vínculo p/ rastreio).
 * - Sem estágio isWon na ótica: só grava o vínculo + loga (não inventa estágio).
 * - Falha NÃO quebra a venda (fail-safe).
 */
describe("linkLeadAndMaybeWinInTx — elo Lead↔Sale + auto-Ganho", () => {
  function makeTx(overrides: Record<string, any> = {}) {
    return {
      lead: { findFirst: vi.fn(), updateMany: vi.fn() },
      leadStage: { findFirst: vi.fn() },
      sale: { updateMany: vi.fn() },
      saleItem: { findMany: vi.fn().mockResolvedValue([]) }, // default: sem itens
      ...overrides,
    } as any;
  }

  const WON_STAGE = { id: "stage_won", isWon: true, isLost: false };
  const OPEN_STAGE = { id: "stage_open", isWon: false, isLost: false };

  // O helper consulta o lead em até 2 passos: 1º o ABERTO mais recente, 2º (se
  // não houver aberto) o mais recente geral. Estas helpers configuram o mock.
  function leadFound(tx: any, lead: any) {
    // 1ª query (aberto) já retorna → fallback não roda.
    tx.lead.findFirst.mockResolvedValueOnce(lead);
  }
  function noOpenButFallback(tx: any, fallbackLead: any) {
    // 1ª query (aberto) = null; 2ª query (geral) = o lead terminal.
    tx.lead.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(fallbackLead);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-op quando não há customerId (não consulta nem grava)", async () => {
    const tx = makeTx();
    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: undefined,
      companyId: "company_1",
    });
    expect(tx.lead.findFirst).not.toHaveBeenCalled();
    expect(tx.sale.updateMany).not.toHaveBeenCalled();
  });

  it("no-op quando o cliente não tem nenhum lead", async () => {
    const tx = makeTx();
    // 1ª query (aberto) e 2ª (fallback) ambas null → cliente sem lead.
    tx.lead.findFirst.mockResolvedValue(null);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    expect(tx.sale.updateMany).not.toHaveBeenCalled();
    expect(tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it("casa lead ABERTO e move p/ o estágio isWon (maior order)", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    tx.leadStage.findFirst.mockResolvedValue(WON_STAGE);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    // grava o vínculo na venda (com companyId no where — multi-tenant)
    expect(tx.sale.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sale_1", companyId: "company_1" },
        data: expect.objectContaining({ leadId: "lead_1" }),
      }),
    );
    // move o lead p/ o estágio Ganho (com companyId no where)
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead_1", companyId: "company_1" },
        data: expect.objectContaining({ stageId: "stage_won" }),
      }),
    );
  });

  it("PREFERE o lead aberto: a 1ª query filtra estágio não-terminal por companyId/lastActivityAt", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    tx.leadStage.findFirst.mockResolvedValue(WON_STAGE);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    const firstQuery = tx.lead.findFirst.mock.calls[0][0];
    expect(firstQuery.where).toMatchObject({
      customerId: "cust_1",
      companyId: "company_1",
      stage: { isWon: false, isLost: false },
    });
    expect(firstQuery.orderBy).toMatchObject({ lastActivityAt: "desc" });
    // achou aberto na 1ª → não roda o fallback
    expect(tx.lead.findFirst).toHaveBeenCalledOnce();
  });

  it("SEM lead aberto, mas há um terminal: fallback casa o terminal e SÓ vincula (não move)", async () => {
    const tx = makeTx();
    noOpenButFallback(tx, { id: "lead_won", stage: { id: "s_won", isWon: true, isLost: false } });

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    // rodou as 2 queries (aberto → null, fallback → terminal)
    expect(tx.lead.findFirst).toHaveBeenCalledTimes(2);
    // grava o vínculo no terminal (rastreio)
    expect(tx.sale.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadId: "lead_won" }) }),
    );
    // NÃO move card terminal, nem resolve estágio Ganho
    expect(tx.lead.updateMany).not.toHaveBeenCalled();
    expect(tx.leadStage.findFirst).not.toHaveBeenCalled();
  });

  it("lead aberto cujo fallback seria TERMINAL (isLost): aberto vence e move", async () => {
    const tx = makeTx();
    // aberto existe → fallback nem é consultado
    leadFound(tx, { id: "lead_open", stage: OPEN_STAGE });
    tx.leadStage.findFirst.mockResolvedValue(WON_STAGE);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stageId: "stage_won" }) }),
    );
  });

  it("fallback TERMINAL (isLost): só grava vínculo, NÃO move", async () => {
    const tx = makeTx();
    noOpenButFallback(tx, { id: "lead_lost", stage: { id: "s_lost", isWon: false, isLost: true } });

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    expect(tx.sale.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadId: "lead_lost" }) }),
    );
    expect(tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it("ótica SEM estágio isWon: grava vínculo mas NÃO move (não inventa estágio)", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    tx.leadStage.findFirst.mockResolvedValue(null); // ótica sem estágio Ganho

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    expect(tx.sale.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadId: "lead_1" }) }),
    );
    expect(tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it("resolve o estágio Ganho de MAIOR order (orderBy desc) filtrado por companyId", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    tx.leadStage.findFirst.mockResolvedValue(WON_STAGE);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    const stageQuery = tx.leadStage.findFirst.mock.calls[0][0];
    expect(stageQuery.where).toMatchObject({ companyId: "company_1", isWon: true });
    expect(stageQuery.orderBy).toMatchObject({ order: "desc" });
  });

  it("fail-safe: erro ao consultar lead NÃO propaga (venda não quebra)", async () => {
    const tx = makeTx();
    tx.lead.findFirst.mockRejectedValue(new Error("db down"));

    await expect(
      linkLeadAndMaybeWinInTx(tx, {
        saleId: "sale_1",
        customerId: "cust_1",
        companyId: "company_1",
      }),
    ).resolves.toBeUndefined();
  });

  it("fail-safe: erro ao gravar a venda NÃO propaga", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    tx.leadStage.findFirst.mockResolvedValue(WON_STAGE);
    tx.sale.updateMany.mockRejectedValue(new Error("write conflict"));

    await expect(
      linkLeadAndMaybeWinInTx(tx, {
        saleId: "sale_1",
        customerId: "cust_1",
        companyId: "company_1",
      }),
    ).resolves.toBeUndefined();
  });

  const EXAM_DONE_STAGE = { id: "stage_exam_done", isWon: false, isLost: false };

  it("venda SÓ de exame: move p/ 'Exame feito' (EXAM_DONE), não p/ Fechado", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    tx.saleItem.findMany.mockResolvedValue([{ product: { isEyeExam: true } }]);
    tx.leadStage.findFirst.mockResolvedValue(EXAM_DONE_STAGE);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    const stageQuery = tx.leadStage.findFirst.mock.calls[0][0];
    expect(stageQuery.where).toMatchObject({
      companyId: "company_1",
      systemKey: LEAD_STAGE_KEYS.EXAM_DONE,
    });
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead_1", companyId: "company_1" },
        data: expect.objectContaining({ stageId: "stage_exam_done" }),
      }),
    );
  });

  it("venda de exame + óculos: move p/ Fechado (comportamento atual), NÃO p/ Exame", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    tx.saleItem.findMany.mockResolvedValue([
      { product: { isEyeExam: true } },
      { product: { isEyeExam: false } },
    ]);
    tx.leadStage.findFirst.mockResolvedValue(WON_STAGE);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    const stageQuery = tx.leadStage.findFirst.mock.calls[0][0];
    expect(stageQuery.where).toMatchObject({ companyId: "company_1", isWon: true });
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stageId: "stage_won" }) }),
    );
  });

  it("venda de exame mas ótica SEM estágio EXAM_DONE: cai no Fechado (fallback)", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    tx.saleItem.findMany.mockResolvedValue([{ product: { isEyeExam: true } }]);
    tx.leadStage.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(WON_STAGE);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stageId: "stage_won" }) }),
    );
  });

  it("venda sem itens de exame: não consulta EXAM_DONE, vai p/ Fechado", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    tx.saleItem.findMany.mockResolvedValue([{ product: { isEyeExam: false } }]);
    tx.leadStage.findFirst.mockResolvedValue(WON_STAGE);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    const usedExamKey = tx.leadStage.findFirst.mock.calls.some(
      (c: any[]) => c[0]?.where?.systemKey === LEAD_STAGE_KEYS.EXAM_DONE,
    );
    expect(usedExamKey).toBe(false);
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stageId: "stage_won" }) }),
    );
  });
});
