import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: { findFirst: vi.fn() },
    whatsappConversation: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    whatsappMessage: { findMany: vi.fn() },
    leadStage: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
const moveLeadMock = vi.fn();
vi.mock("@/services/lead.service", () => ({ moveLead: (...a: unknown[]) => moveLeadMock(...a) }));
const traceMock = vi.fn();
vi.mock("@/services/funnel-automove-trace.service", () => ({
  recordAutoMoveTrace: (...a: unknown[]) => traceMock(...a),
}));

import { prisma } from "@/lib/prisma";
import { maybeAutoAdvanceLead, processFunnelReevals } from "./funnel-automove.service";

const STAGES = [
  { id: "s_novo", order: 0, isWon: false, isLost: false },
  { id: "s_atend", order: 1, isWon: false, isLost: false },
  { id: "s_orc", order: 2, isWon: false, isLost: false },
  { id: "s_fechado", order: 3, isWon: true, isLost: false },
];

const ORIG = process.env.FUNNEL_AUTOMOVE_COMPANIES;

function setup(over: {
  lead?: any; conv?: any; messages?: any[]; stages?: any[];
} = {}) {
  (prisma.lead.findFirst as any).mockResolvedValue(
    over.lead ?? { id: "lead_1", stageId: "s_novo", lastMovedBy: null, aiLockUntilMessageAt: null },
  );
  (prisma.whatsappConversation.findFirst as any).mockResolvedValue(
    over.conv ?? { id: "conv_1", lastMessageAt: new Date("2026-06-30T10:00:00Z") },
  );
  (prisma.whatsappMessage.findMany as any).mockResolvedValue(
    over.messages ?? [
      { direction: "inbound", type: "text", text: "quero óculos de grau" },
      { direction: "outbound", type: "text", text: "claro! me passa seu grau?" }, // ótica respondeu
    ],
  );
  (prisma.leadStage.findMany as any).mockResolvedValue(over.stages ?? STAGES);
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks zera as CHAMADAS mas não as IMPLEMENTAÇÕES — reseta os mocks
  // que recebem mockRejectedValue/mockResolvedValue noutros testes p/ não vazar.
  moveLeadMock.mockReset().mockResolvedValue(undefined);
  traceMock.mockReset().mockResolvedValue(undefined);
  process.env.FUNNEL_AUTOMOVE_COMPANIES = "co_1"; // ligado p/ a ótica de teste
});
afterEach(() => { process.env.FUNNEL_AUTOMOVE_COMPANIES = ORIG; });

const call = (over: any = {}) =>
  maybeAutoAdvanceLead({ conversationId: "conv_1", leadId: "lead_1", companyId: "co_1", intent: "NOVA_COMPRA", confidence: 0.9, ...over });

describe("maybeAutoAdvanceLead — motor de auto-move (travas + régua)", () => {
  it("kill-switch OFF (ótica fora da lista) → não faz nada", async () => {
    process.env.FUNNEL_AUTOMOVE_COMPANIES = "outra_co";
    setup();
    const r = await call();
    expect(r.moved).toBe(false);
    expect(moveLeadMock).not.toHaveBeenCalled();
  });

  it("caminho feliz: Novo + compra + cliente engajou → move p/ Em atendimento via moveLead(AI)", async () => {
    setup();
    const r = await call();
    expect(r.moved).toBe(true);
    expect(moveLeadMock).toHaveBeenCalledWith("lead_1", { stageId: "s_atend" }, "co_1", "AI");
  });

  it("TRAVA HUMANA: humano moveu e NÃO chegou msg nova → não move", async () => {
    setup({
      lead: { id: "lead_1", stageId: "s_novo", lastMovedBy: "USER", aiLockUntilMessageAt: new Date("2026-06-30T10:00:00Z") },
      conv: { id: "conv_1", lastMessageAt: new Date("2026-06-30T10:00:00Z") }, // == trava, sem msg nova
    });
    const r = await call();
    expect(r.moved).toBe(false);
    expect(r.reason).toMatch(/trava|humano/i);
    expect(moveLeadMock).not.toHaveBeenCalled();
  });

  it("TRAVA HUMANA expira: humano moveu MAS chegou msg nova → pode mover", async () => {
    setup({
      lead: { id: "lead_1", stageId: "s_novo", lastMovedBy: "USER", aiLockUntilMessageAt: new Date("2026-06-30T10:00:00Z") },
      conv: { id: "conv_1", lastMessageAt: new Date("2026-06-30T12:00:00Z") }, // msg MAIS nova
    });
    const r = await call();
    expect(r.moved).toBe(true);
    expect(moveLeadMock).toHaveBeenCalled();
  });

  it("régua diz HOLD (cliente não engajou) → não move", async () => {
    setup({ messages: [{ direction: "inbound", type: "text", text: "oi" }] });
    const r = await call();
    expect(r.moved).toBe(false);
    expect(moveLeadMock).not.toHaveBeenCalled();
  });

  it("régua diz MOVE p/ Orçamento (Em atendimento + ótica mandou R$)", async () => {
    setup({
      lead: { id: "lead_1", stageId: "s_atend", lastMovedBy: "AI", aiLockUntilMessageAt: null },
      messages: [{ direction: "inbound", type: "text", text: "e o preço?" }, { direction: "outbound", type: "text", text: "fica R$ 890" }],
    });
    const r = await call({ intent: "ORCAMENTO_PRECO" });
    expect(r.moved).toBe(true);
    expect(moveLeadMock).toHaveBeenCalledWith("lead_1", { stageId: "s_orc" }, "co_1", "AI");
  });

  it("RECLAMACAO → flag, não move (motor não levanta exceção)", async () => {
    setup();
    const r = await call({ intent: "RECLAMACAO" });
    expect(r.moved).toBe(false);
    expect(r.action).toBe("flag");
    expect(moveLeadMock).not.toHaveBeenCalled();
  });

  it("lead inexistente → no-op seguro", async () => {
    setup();
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    const r = await call();
    expect(r.moved).toBe(false);
    expect(moveLeadMock).not.toHaveBeenCalled();
  });

  it("fail-safe: erro ao mover NÃO propaga", async () => {
    setup();
    moveLeadMock.mockRejectedValue(new Error("db down"));
    await expect(call()).resolves.toMatchObject({ moved: false });
  });

  it("multi-tenant: consulta o lead filtrando por companyId", async () => {
    setup();
    await call();
    const where = (prisma.lead.findFirst as any).mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "lead_1", companyId: "co_1" });
  });

  describe("régua nova: exige ótica respondida p/ Novo→Em atendimento", () => {
    it("cliente engajou MAS ótica NÃO respondeu (só inbound) → NÃO move (lead recém-nascido)", async () => {
      setup({ messages: [{ direction: "inbound", type: "text", text: "quero um orçamento" }] });
      const r = await call();
      expect(r.moved).toBe(false);
      expect(moveLeadMock).not.toHaveBeenCalled();
    });

    it("cliente engajou E ótica respondeu → move (mesmo com confiança 0)", async () => {
      setup({
        messages: [
          { direction: "inbound", type: "text", text: "quero um orçamento" },
          { direction: "outbound", type: "text", text: "claro, me manda seu grau" },
        ],
      });
      const r = await call({ confidence: 0 }); // confiança não trava o trecho 0
      expect(r.moved).toBe(true);
      expect(moveLeadMock).toHaveBeenCalledWith("lead_1", { stageId: "s_atend" }, "co_1", "AI");
    });
  });

  describe("trilha de telemetria (gated)", () => {
    it("MOVE → grava trilha com action=move e envSeen=set", async () => {
      setup();
      await call();
      expect(traceMock).toHaveBeenCalledTimes(1);
      expect(traceMock.mock.calls[0][0]).toMatchObject({
        companyId: "co_1", leadId: "lead_1", action: "move", moved: true, killSwitchOn: true, envSeen: "set",
      });
    });

    it("kill-switch OFF → NÃO grava trilha (evita amplificação)", async () => {
      process.env.FUNNEL_AUTOMOVE_COMPANIES = "outra_co";
      setup();
      await call();
      expect(traceMock).not.toHaveBeenCalled();
    });

    it("hold trivial (cliente não engajou) → NÃO grava trilha", async () => {
      setup({ messages: [{ direction: "inbound", type: "text", text: "oi" }] });
      await call();
      expect(traceMock).not.toHaveBeenCalled();
    });

    it("flag (RECLAMACAO) → grava trilha (relevante p/ inbox/acurácia)", async () => {
      setup();
      await call({ intent: "RECLAMACAO" });
      expect(traceMock).toHaveBeenCalledTimes(1);
      expect(traceMock.mock.calls[0][0]).toMatchObject({ action: "flag", moved: false });
    });

    it("trava humana ativa → grava trilha (humano-vs-IA = sinal de acurácia)", async () => {
      setup({
        lead: { id: "lead_1", stageId: "s_novo", lastMovedBy: "USER", aiLockUntilMessageAt: new Date("2026-06-30T10:00:00Z") },
        conv: { id: "conv_1", lastMessageAt: new Date("2026-06-30T10:00:00Z") },
      });
      await call();
      expect(traceMock).toHaveBeenCalledTimes(1);
      expect(traceMock.mock.calls[0][0]).toMatchObject({ moved: false });
    });

    it("erro no move → grava trilha action=error com a mensagem", async () => {
      setup();
      moveLeadMock.mockRejectedValue(new Error("db down"));
      await call();
      const errCall = traceMock.mock.calls.find((c) => c[0].action === "error");
      expect(errCall).toBeTruthy();
      expect(errCall![0]).toMatchObject({ action: "error", error: "db down", envSeen: "set" });
    });
  });
});

describe("processFunnelReevals — re-avaliação por resposta da ótica (sem IA)", () => {
  function pending(convs: any[]) {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue(convs);
    (prisma.whatsappConversation.update as any).mockResolvedValue(undefined);
  }

  it("busca só conversas needsFunnelEval=true com lead, e limpa o flag após processar", async () => {
    pending([{ id: "conv_1", companyId: "co_1", leadId: "lead_1" }]);
    // lead com intenção JÁ salva (nenhuma chamada ao Claude)
    (prisma.lead.findFirst as any).mockImplementation((arg: any) =>
      arg.select?.intent
        ? Promise.resolve({ intent: "AGENDAMENTO_INFO", intentConfidence: 0.9 })
        : Promise.resolve({ id: "lead_1", stageId: "s_novo", lastMovedBy: null, aiLockUntilMessageAt: null }),
    );
    const r = await processFunnelReevals();
    // filtro correto
    const where = (prisma.whatsappConversation.findMany as any).mock.calls[0][0].where;
    expect(where.needsFunnelEval).toBe(true);
    expect(where.leadId).toEqual({ not: null });
    // moveu (Novo→Em atendimento, ótica respondeu no mock padrão) e limpou o flag
    expect(moveLeadMock).toHaveBeenCalledWith("lead_1", { stageId: "s_atend" }, "co_1", "AI");
    expect(r.moves).toBe(1);
    const clear = (prisma.whatsappConversation.update as any).mock.calls.find((c: any[]) => c[0].data?.needsFunnelEval === false);
    expect(clear).toBeTruthy();
    expect(clear[0].where).toEqual({ id: "conv_1" });
  });

  it("respeita o kill-switch: ótica desligada → não move, mas limpa o flag", async () => {
    process.env.FUNNEL_AUTOMOVE_COMPANIES = "outra_co";
    pending([{ id: "conv_1", companyId: "co_1", leadId: "lead_1" }]);
    (prisma.lead.findFirst as any).mockResolvedValue({ intent: "AGENDAMENTO_INFO", intentConfidence: 0.9 });
    const r = await processFunnelReevals();
    expect(moveLeadMock).not.toHaveBeenCalled();
    expect(r.moves).toBe(0);
    const clear = (prisma.whatsappConversation.update as any).mock.calls.find((c: any[]) => c[0].data?.needsFunnelEval === false);
    expect(clear).toBeTruthy();
  });

  it("lead sem intenção MAS conversa já analisada → não avalia e LIMPA (sem esperança)", async () => {
    pending([{ id: "conv_1", companyId: "co_1", leadId: "lead_1", analyzedAt: new Date("2026-06-10") }]);
    (prisma.lead.findFirst as any).mockResolvedValue({ intent: null, intentConfidence: null });
    const r = await processFunnelReevals();
    expect(moveLeadMock).not.toHaveBeenCalled();
    expect(r.moves).toBe(0);
    const clear = (prisma.whatsappConversation.update as any).mock.calls.find((c: any[]) => c[0].data?.needsFunnelEval === false);
    expect(clear).toBeTruthy();
  });

  // HIGH #1 do review: intent ainda não classificada + conversa AINDA NÃO analisada
  // → NÃO consome o flag "a seco"; espera a qualificação preencher o intent.
  it("lead sem intenção E conversa não analisada → NÃO limpa o flag (aguarda qualificação)", async () => {
    pending([{ id: "conv_1", companyId: "co_1", leadId: "lead_1", analyzedAt: null }]);
    (prisma.lead.findFirst as any).mockResolvedValue({ intent: null, intentConfidence: null });
    const r = await processFunnelReevals();
    expect(moveLeadMock).not.toHaveBeenCalled();
    expect(r.moves).toBe(0);
    const clear = (prisma.whatsappConversation.update as any).mock.calls.find((c: any[]) => c[0].data?.needsFunnelEval === false);
    expect(clear).toBeUndefined(); // flag preservado p/ o próximo ciclo
  });

  it("fail-safe: erro numa conversa NÃO trava as outras e ainda limpa o flag", async () => {
    pending([
      { id: "conv_err", companyId: "co_1", leadId: "lead_err" },
      { id: "conv_ok", companyId: "co_1", leadId: "lead_ok" },
    ]);
    (prisma.lead.findFirst as any)
      .mockRejectedValueOnce(new Error("db hiccup")) // 1ª conversa falha ao ler lead
      .mockImplementation((arg: any) =>
        arg.select?.intent
          ? Promise.resolve({ intent: "AGENDAMENTO_INFO", intentConfidence: 0.9 })
          : Promise.resolve({ id: "lead_ok", stageId: "s_novo", lastMovedBy: null, aiLockUntilMessageAt: null }),
      );
    const r = await processFunnelReevals();
    expect(r.errors).toBe(1);
    // a 2ª ainda processa e move
    expect(moveLeadMock).toHaveBeenCalledWith("lead_ok", { stageId: "s_atend" }, "co_1", "AI");
    // ambas limpam o flag (erro inclusive, no finally)
    const clears = (prisma.whatsappConversation.update as any).mock.calls.filter((c: any[]) => c[0].data?.needsFunnelEval === false);
    expect(clears).toHaveLength(2);
  });
});
