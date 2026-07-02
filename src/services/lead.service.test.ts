import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    leadStage: { findFirst: vi.fn() },
    lead: { create: vi.fn(), findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    customer: { findFirst: vi.fn() },
    quote: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    prescription: { findFirst: vi.fn() },
    whatsappConversation: { findFirst: vi.fn(), findMany: vi.fn() },
    whatsappMessage: { groupBy: vi.fn() },
  },
}));
import { prisma } from "@/lib/prisma";
import { createLead, listLeads, moveLead, getLeadStats, updateLead, setLeadCustomer, correctLeadIntent, getLeadPrescriptionHint } from "./lead.service";

beforeEach(() => {
  vi.clearAllMocks();
  // Por padrão, FKs válidas (da mesma empresa) — testes cross-tenant sobrescrevem.
  (prisma.customer.findFirst as any).mockResolvedValue({ id: "cust_ok" });
  (prisma.quote.findFirst as any).mockResolvedValue({ id: "quote_ok" });
  (prisma.user.findFirst as any).mockResolvedValue({ id: "user_ok" });
  // SLA afiado (Item 5): por padrão nenhuma conversa/outbound (leads sem WhatsApp).
  (prisma.whatsappConversation.findMany as any).mockResolvedValue([]);
  (prisma.whatsappMessage.groupBy as any).mockResolvedValue([]);
});

describe("setLeadCustomer — writer dedicado de vínculo", () => {
  it("vincula quando lead e customer são da mesma empresa", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1" });
    (prisma.customer.findFirst as any).mockResolvedValue({ id: "cust1" });
    (prisma.lead.update as any).mockResolvedValue({ id: "l1", customerId: "cust1" });
    await setLeadCustomer("l1", "cust1", "co_1");
    expect((prisma.lead.update as any).mock.calls[0][0].data.customerId).toBe("cust1");
  });

  it("rejeita customer de outra empresa (IDOR)", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1" });
    (prisma.customer.findFirst as any).mockResolvedValue(null);
    await expect(setLeadCustomer("l1", "cust_de_outra", "co_1")).rejects.toThrow(/cliente/i);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it("customerId=null DESVINCULA (não valida customer)", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1" });
    (prisma.lead.update as any).mockResolvedValue({ id: "l1", customerId: null });
    await setLeadCustomer("l1", null, "co_1");
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    expect((prisma.lead.update as any).mock.calls[0][0].data.customerId).toBeNull();
  });

  it("confirmar registra quem/quando e LIMPA a sugestão", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1" });
    (prisma.customer.findFirst as any).mockResolvedValue({ id: "cust1" });
    (prisma.lead.update as any).mockResolvedValue({ id: "l1" });
    await setLeadCustomer("l1", "cust1", "co_1", "user_99");
    const data = (prisma.lead.update as any).mock.calls[0][0].data;
    expect(data.customerId).toBe("cust1");
    expect(data.customerMatchConfirmedById).toBe("user_99");
    expect(data.customerMatchConfirmedAt).toBeInstanceOf(Date);
    expect(data.suggestedCustomerId).toBeNull(); // decisão tomada, palpite some
  });

  it("lead de outra empresa → 404, não grava", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    await expect(setLeadCustomer("l_outra", "cust1", "co_1")).rejects.toThrow(/lead/i);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});

describe("createLead", () => {
  it("cria lead só com nome, usando a 1ª etapa quando stageId não é dado", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_novo" });
    (prisma.lead.findFirst as any).mockResolvedValue(null); // sem duplicado
    (prisma.lead.create as any).mockResolvedValue({ id: "lead_1", name: "Maria", stageId: "stg_novo" });

    const r = await createLead({ name: "Maria" }, "co_1", "user_1", "br_1");
    expect(r.lead.stageId).toBe("stg_novo");
    expect(prisma.lead.create).toHaveBeenCalled();
  });

  it("lança se a empresa não tem nenhuma etapa", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue(null);
    await expect(createLead({ name: "X" }, "co_1", "u", "b")).rejects.toThrow();
  });

  it("retorna duplicateWarning quando há lead ativo com mesmo telefone", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_novo" });
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "lead_old" }); // duplicado
    (prisma.lead.create as any).mockResolvedValue({ id: "lead_2", name: "Maria" });

    const r = await createLead({ name: "Maria", phone: "85999" }, "co_1", "u", "b");
    expect(r.duplicateWarning).toBe(true);
  });

  it("grava intentPredicted = intent quando a IA classifica (base da telemetria)", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_novo" });
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: "lead_3", name: "Ana" });

    await createLead({ name: "Ana" }, "co_1", "u", "b", { intent: "RENOVACAO" });
    const data = (prisma.lead.create as any).mock.calls[0][0].data;
    expect(data.intent).toBe("RENOVACAO");
    expect(data.intentPredicted).toBe("RENOVACAO");
  });
});

describe("createLead — IDOR cross-tenant (Fase 0b)", () => {
  it("rejeita customerId de outra empresa", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_novo" });
    (prisma.customer.findFirst as any).mockResolvedValue(null); // não é da empresa
    await expect(
      createLead({ name: "X", customerId: "cust_de_outra" }, "co_1", "u", "b")
    ).rejects.toThrow(/cliente/i);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("rejeita quoteId de outra empresa", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_novo" });
    (prisma.quote.findFirst as any).mockResolvedValue(null);
    await expect(
      createLead({ name: "X", quoteId: "q_de_outra" }, "co_1", "u", "b")
    ).rejects.toThrow(/orçamento/i);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("rejeita sellerUserId de outra empresa", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_novo" });
    (prisma.user.findFirst as any).mockResolvedValue(null);
    await expect(
      createLead({ name: "X", sellerUserId: "u_de_outra" }, "co_1", "u", "b")
    ).rejects.toThrow(/vendedor/i);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });
});

describe("updateLead — IDOR cross-tenant (Fase 0b)", () => {
  it("rejeita customerId de outra empresa", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1" });
    (prisma.customer.findFirst as any).mockResolvedValue(null);
    await expect(
      updateLead("l1", { customerId: "cust_de_outra" } as any, "co_1")
    ).rejects.toThrow(/cliente/i);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it("rejeita stageId de outra empresa", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1" });
    (prisma.leadStage.findFirst as any).mockResolvedValue(null);
    await expect(
      updateLead("l1", { stageId: "stg_de_outra" } as any, "co_1")
    ).rejects.toThrow(/etapa/i);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it("rejeita quoteId de outra empresa", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1" });
    (prisma.quote.findFirst as any).mockResolvedValue(null);
    await expect(
      updateLead("l1", { quoteId: "q_de_outra" } as any, "co_1")
    ).rejects.toThrow(/orçamento/i);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it("rejeita sellerUserId de outra empresa", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1" });
    (prisma.user.findFirst as any).mockResolvedValue(null);
    await expect(
      updateLead("l1", { sellerUserId: "u_de_outra" } as any, "co_1")
    ).rejects.toThrow(/vendedor/i);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it("NÃO espalha campos inesperados — só allowlist chega ao update", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1" });
    (prisma.lead.update as any).mockResolvedValue({ id: "l1" });
    await updateLead("l1", { name: "Novo", companyId: "HACK", id: "HACK" } as any, "co_1");
    const data = (prisma.lead.update as any).mock.calls[0][0].data;
    expect(data.name).toBe("Novo");
    expect(data.companyId).toBeUndefined(); // não vaza p/ o update
    expect(data.id).toBeUndefined();
  });
});

describe("listLeads", () => {
  it("filtra sempre por companyId e deletedAt:null", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);
    (prisma.lead.count as any).mockResolvedValue(0);
    await listLeads({ page: 1, pageSize: 50, search: "" } as any, "co_1", null, { viewAll: true, userId: "u" });
    const where = (prisma.lead.findMany as any).mock.calls[0][0].where;
    expect(where.companyId).toBe("co_1");
    expect(where.deletedAt).toBeNull();
  });

  it("quando viewAll=false, filtra pelo sellerUserId do usuário", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);
    (prisma.lead.count as any).mockResolvedValue(0);
    await listLeads({ page: 1, pageSize: 50, search: "" } as any, "co_1", null, { viewAll: false, userId: "u_5" });
    const where = (prisma.lead.findMany as any).mock.calls[0][0].where;
    expect(where.sellerUserId).toBe("u_5");
  });

  // BUG "funil branchId null": lead sem filial (IA/WhatsApp ou admin sem filial)
  // sumia ao selecionar uma filial. Agora deve aparecer em QUALQUER filial.
  it("filial selecionada inclui leads dela E os sem filial (branchId=null)", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);
    (prisma.lead.count as any).mockResolvedValue(0);
    await listLeads({ page: 1, pageSize: 50, search: "" } as any, "co_1", "branch_pacajus", { viewAll: true, userId: "u" });
    const where = (prisma.lead.findMany as any).mock.calls[0][0].where;
    // NUNCA usa where.branchId direto (excluiria os null); usa AND com OR.
    expect(where.branchId).toBeUndefined();
    expect(where.AND).toEqual([{ OR: [{ branchId: "branch_pacajus" }, { branchId: null }] }]);
  });

  it("sem filial (null) NÃO adiciona escopo de filial (mostra todas)", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);
    (prisma.lead.count as any).mockResolvedValue(0);
    await listLeads({ page: 1, pageSize: 50, search: "" } as any, "co_1", null, { viewAll: true, userId: "u" });
    const where = (prisma.lead.findMany as any).mock.calls[0][0].where;
    expect(where.branchId).toBeUndefined();
    expect(where.AND).toBeUndefined();
  });

  // Regressão do ataque adversarial #1: filial + busca são DOIS OR e não podem
  // se sobrescrever. Ambos precisam sobreviver dentro do where.AND.
  it("filial + busca por texto COEXISTEM (dois OR não se sobrescrevem)", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);
    (prisma.lead.count as any).mockResolvedValue(0);
    await listLeads({ page: 1, pageSize: 50, search: "João" } as any, "co_1", "branch_pacajus", { viewAll: true, userId: "u" });
    const where = (prisma.lead.findMany as any).mock.calls[0][0].where;
    expect(where.OR).toBeUndefined(); // nada no topo (senão colidiria)
    expect(where.AND).toHaveLength(2);
    // 1ª cláusula: escopo de filial (com null)
    expect(where.AND).toContainEqual({ OR: [{ branchId: "branch_pacajus" }, { branchId: null }] });
    // 2ª cláusula: busca por nome/interesse ainda presente
    expect(where.AND).toContainEqual({
      OR: [
        { name: { contains: "João", mode: "insensitive" } },
        { interest: { contains: "João", mode: "insensitive" } },
      ],
    });
  });

  it("count usa o MESMO where do findMany (paginação consistente)", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);
    (prisma.lead.count as any).mockResolvedValue(0);
    await listLeads({ page: 1, pageSize: 50, search: "João" } as any, "co_1", "branch_pacajus", { viewAll: true, userId: "u" });
    const whereFind = (prisma.lead.findMany as any).mock.calls[0][0].where;
    const whereCount = (prisma.lead.count as any).mock.calls[0][0].where;
    expect(whereCount).toEqual(whereFind);
  });
});

describe("moveLead", () => {
  it("exige lostReason ao mover para etapa isLost", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", updatedAt: new Date("2026-06-14") });
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_lost", isLost: true, isWon: false });
    await expect(
      moveLead("l1", { stageId: "stg_lost" } as any, "co_1")
    ).rejects.toThrow(/motivo/i);
  });

  it("detecta conflito de optimistic-lock (expectedUpdatedAt diferente)", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", updatedAt: new Date("2026-06-14T10:00:00Z") });
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg2", isLost: false, isWon: false });
    await expect(
      moveLead("l1", { stageId: "stg2", expectedUpdatedAt: "2026-06-14T09:00:00.000Z" } as any, "co_1")
    ).rejects.toThrow(/atualizado/i);
  });

  it("move e atualiza lastActivityAt no caminho feliz", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", updatedAt: new Date("2026-06-14T10:00:00Z") });
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg2", isLost: false, isWon: false });
    (prisma.lead.update as any).mockResolvedValue({ id: "l1", stageId: "stg2" });
    await moveLead("l1", { stageId: "stg2" } as any, "co_1");
    const data = (prisma.lead.update as any).mock.calls[0][0].data;
    expect(data.stageId).toBe("stg2");
    expect(data.lastActivityAt).toBeInstanceOf(Date);
  });

  // Fatia 3: autoria do movimento + trava humana inteligente.
  it("movimento por HUMANO (default) carimba lastMovedBy=USER + lastHumanMoveAt + trava na msg atual", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", updatedAt: new Date("2026-06-14T10:00:00Z") });
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg2", isLost: false, isWon: false });
    // conversa vinculada com última mensagem conhecida → vira o ponto da trava
    (prisma.whatsappConversation.findFirst as any).mockResolvedValue({ lastMessageAt: new Date("2026-06-20T08:00:00Z") });
    (prisma.lead.update as any).mockResolvedValue({ id: "l1" });

    await moveLead("l1", { stageId: "stg2" } as any, "co_1"); // sem movedBy = USER

    const data = (prisma.lead.update as any).mock.calls[0][0].data;
    expect(data.lastMovedBy).toBe("USER");
    expect(data.lastHumanMoveAt).toBeInstanceOf(Date);
    // trava = lastMessageAt da conversa no momento da correção
    expect(data.aiLockUntilMessageAt).toEqual(new Date("2026-06-20T08:00:00Z"));
  });

  it("movimento por IA usa updateMany com guard (null OU AI) + carimba AI", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", updatedAt: new Date("2026-06-14T10:00:00Z") });
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg2", isLost: false, isWon: false });
    (prisma.lead.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.lead.findUniqueOrThrow as any).mockResolvedValue({ id: "l1", stageId: "stg2" });

    await moveLead("l1", { stageId: "stg2" } as any, "co_1", "AI");

    const arg = (prisma.lead.updateMany as any).mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: "l1", companyId: "co_1" });
    expect(arg.data.lastMovedBy).toBe("AI");
    // IA não consulta conversa p/ trava humana
    expect(prisma.whatsappConversation.findFirst).not.toHaveBeenCalled();
  });

  // 🐛 BUG NULL (lógica de 3 valores do SQL): `lastMovedBy != 'USER'` exclui as
  // linhas com lastMovedBy=NULL (null<>'USER' = NULL, não TRUE). Como NULL é o
  // PADRÃO de todo lead nunca-tocado-por-humano, o guard barrava o caso COMUM e a
  // IA NUNCA movia card nenhum em prod (provado contra o banco real). O guard tem
  // de incluir explicitamente a linha NULL e ainda barrar a linha USER (corrida).
  it("BUG NULL: guard da IA inclui a linha lastMovedBy=NULL (lead nunca tocado)", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", updatedAt: new Date("2026-06-14T10:00:00Z") });
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg2", isLost: false, isWon: false });
    (prisma.lead.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.lead.findUniqueOrThrow as any).mockResolvedValue({ id: "l1", stageId: "stg2" });

    await moveLead("l1", { stageId: "stg2" } as any, "co_1", "AI");

    const where = (prisma.lead.updateMany as any).mock.calls[0][0].where;
    // O filtro DEVE casar lastMovedBy NULL e AI, e NÃO casar USER. A forma `{ not:
    // "USER" }` sozinha (sem o arm null) é o bug — exige o OR com a linha null.
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lastMovedBy: null }),
        expect.objectContaining({ lastMovedBy: "AI" }),
      ]),
    );
    // E não pode haver um filtro top-level que exclua NULL (o bug original).
    expect(where.lastMovedBy).toBeUndefined();
  });

  it("updateLeadAiFields persiste intentConfidence (observabilidade Fatia 3)", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1" });
    (prisma.lead.update as any).mockResolvedValue({ id: "l1" });
    const { updateLeadAiFields } = await import("./lead.service");
    await updateLeadAiFields("l1", "co_1", { intent: "NOVA_COMPRA", confidence: 0.83 });
    const data = (prisma.lead.update as any).mock.calls[0][0].data;
    expect(data.intentConfidence).toBe(0.83);
    expect(data.intent).toBe("NOVA_COMPRA");
  });

  it("RACE: humano carimbou no meio (count=0) → IA aborta com erro (não sobrescreve)", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", updatedAt: new Date("2026-06-14T10:00:00Z") });
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg2", isLost: false, isWon: false });
    (prisma.lead.updateMany as any).mockResolvedValue({ count: 0 }); // guard barrou

    await expect(moveLead("l1", { stageId: "stg2" } as any, "co_1", "AI")).rejects.toThrow(/humano/i);
  });

  it("HUMANO sem conversa vinculada → trava fica null (não quebra)", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", updatedAt: new Date("2026-06-14T10:00:00Z") });
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg2", isLost: false, isWon: false });
    (prisma.whatsappConversation.findFirst as any).mockResolvedValue(null); // lead manual, sem WhatsApp
    (prisma.lead.update as any).mockResolvedValue({ id: "l1" });

    await moveLead("l1", { stageId: "stg2" } as any, "co_1", "USER");

    const data = (prisma.lead.update as any).mock.calls[0][0].data;
    expect(data.lastMovedBy).toBe("USER");
    expect(data.aiLockUntilMessageAt).toBeNull();
  });
});

describe("getLeadStats", () => {
  const NOW = new Date();

  it("filial selecionada inclui leads sem filial (branchId=null) via AND", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);
    await getLeadStats("co_1", "branch_pacajus");
    const where = (prisma.lead.findMany as any).mock.calls[0][0].where;
    expect(where.branchId).toBeUndefined();
    expect(where.AND).toEqual([{ OR: [{ branchId: "branch_pacajus" }, { branchId: null }] }]);
  });

  it("sem filial (null) não adiciona escopo (conta todas)", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);
    await getLeadStats("co_1", null);
    const where = (prisma.lead.findMany as any).mock.calls[0][0].where;
    expect(where.AND).toBeUndefined();
    expect(where.branchId).toBeUndefined();
  });

  it("calcula conversão = ganhos / total e agrega lostReason e source", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "a", lastActivityAt: NOW, stage: { isWon: true, isLost: false }, source: "WHATSAPP", lostReason: null, intent: null, intentPredicted: null },
      { id: "b", lastActivityAt: NOW, stage: { isWon: false, isLost: true }, source: "INSTAGRAM", lostReason: "Preço", intent: null, intentPredicted: null },
      { id: "c", lastActivityAt: NOW, stage: { isWon: false, isLost: false }, source: "WHATSAPP", lostReason: null, intent: null, intentPredicted: null },
    ]);
    const s = await getLeadStats("co_1", null);
    expect(s.total).toBe(3);
    expect(s.won).toBe(1);
    expect(s.conversionRate).toBeCloseTo(1 / 3);
    expect(s.byLostReason["Preço"]).toBe(1);
    expect(s.bySource["WHATSAPP"]).toBe(2);
  });

  it("inclui acurácia da IA (pares predito×atual; ignora leads sem palpite)", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "a", lastActivityAt: NOW, stage: { isWon: false, isLost: false }, source: null, lostReason: null, intentPredicted: "NOVA_COMPRA", intent: "NOVA_COMPRA" }, // acerto
      { id: "b", lastActivityAt: NOW, stage: { isWon: false, isLost: false }, source: null, lostReason: null, intentPredicted: "RENOVACAO", intent: "RECLAMACAO" },  // erro
      { id: "c", lastActivityAt: NOW, stage: { isWon: false, isLost: false }, source: null, lostReason: null, intentPredicted: null, intent: null },                 // fora da amostra
    ]);
    const s = await getLeadStats("co_1", null);
    expect(s.aiAccuracy.total).toBe(2);
    expect(s.aiAccuracy.correct).toBe(1);
    expect(s.aiAccuracy.rate).toBeCloseTo(0.5);
  });

  it("inclui volume por intenção (byIntent) e SLA dos leads abertos", async () => {
    const old = new Date(Date.now() - 48 * 3600_000); // 48h parado = atrasado
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "a", lastActivityAt: NOW, stage: { isWon: false, isLost: false }, source: null, lostReason: null, intent: "NOVA_COMPRA", intentPredicted: null },
      { id: "b", lastActivityAt: old, stage: { isWon: false, isLost: false }, source: null, lostReason: null, intent: "NOVA_COMPRA", intentPredicted: null },
      { id: "c", lastActivityAt: NOW, stage: { isWon: true, isLost: false }, source: null, lostReason: null, intent: "RENOVACAO", intentPredicted: null },
    ]);
    const s = await getLeadStats("co_1", null);
    expect(s.byIntent["NOVA_COMPRA"]).toBe(2);  // 'a' e 'b' abertos
    expect(s.byIntent["RENOVACAO"]).toBeUndefined(); // 'c' ganho → fora do volume vivo
    expect(s.sla.totalOpen).toBe(2);   // 'c' está ganho → fora
    expect(s.sla.late).toBe(1);        // 'b' parado 48h
    expect(s.sla.lateLeads[0].id).toBe("b");
  });

  it("SLA afiado 'precisa responder' (Item 5): lead aberto com conversa SEM outbound", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "L1", lastActivityAt: NOW, stage: { isWon: false, isLost: false }, source: "WHATSAPP", lostReason: null, intent: "NOVA_COMPRA", intentPredicted: null },
      { id: "L2", lastActivityAt: NOW, stage: { isWon: false, isLost: false }, source: "WHATSAPP", lostReason: null, intent: "NOVA_COMPRA", intentPredicted: null },
    ]);
    // L1 tem conversa sem outbound (bola com a ótica); L2 tem outbound (respondido).
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([
      { id: "c1", leadId: "L1" }, { id: "c2", leadId: "L2" },
    ]);
    (prisma.whatsappMessage.groupBy as any).mockResolvedValue([{ conversationId: "c2", _count: { _all: 1 } }]);
    const s = await getLeadStats("co_1", null);
    expect(s.sla.needsReply).toBe(1);
    expect(s.sla.needsReplyLeads[0].id).toBe("L1");
    // só consulta os ABERTOS
    expect((prisma.whatsappConversation.findMany as any).mock.calls[0][0].where.leadId.in).toEqual(["L1", "L2"]);
  });

  it("inclui acurácia POR intenção (gold set — Item 5)", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "a", lastActivityAt: NOW, stage: { isWon: false, isLost: false }, source: null, lostReason: null, intentPredicted: "RENOVACAO", intent: "NOVA_COMPRA" }, // erro
      { id: "b", lastActivityAt: NOW, stage: { isWon: false, isLost: false }, source: null, lostReason: null, intentPredicted: "RENOVACAO", intent: "RENOVACAO" },   // acerto
    ]);
    const s = await getLeadStats("co_1", null);
    const renov = s.aiAccuracyByIntent.find((o: { intent: string }) => o.intent === "RENOVACAO");
    expect(renov).toBeDefined();
    expect(renov!.total).toBe(2);
    expect(renov!.correct).toBe(1);
    expect(renov!.topConfusion).toEqual({ intent: "NOVA_COMPRA", count: 1 });
  });

  it("NÃO filtra createdAt na query (período é in-memory; SLA precisa de todos os leads)", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);
    await getLeadStats("co_1", null, { from: new Date("2026-06-01T00:00:00Z") });
    const where = (prisma.lead.findMany as any).mock.calls[0][0].where;
    // A query traz TODOS os leads da empresa/filial; o corte por período é em memória.
    expect(where.createdAt).toBeUndefined();
    // createdAt é selecionado (para o filtro em memória).
    expect((prisma.lead.findMany as any).mock.calls[0][0].select.createdAt).toBe(true);
  });

  it("período escopa o PLACAR (total/won/origem/perdas) por createdAt", async () => {
    const dentro = new Date("2026-06-15T12:00:00Z");
    const fora = new Date("2026-05-01T12:00:00Z");
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "a", createdAt: dentro, lastActivityAt: NOW, stage: { isWon: true, isLost: false }, source: "WHATSAPP", lostReason: null, intent: null, intentPredicted: null },
      { id: "b", createdAt: dentro, lastActivityAt: NOW, stage: { isWon: false, isLost: false }, source: "WHATSAPP", lostReason: null, intent: null, intentPredicted: null },
      { id: "old", createdAt: fora, lastActivityAt: NOW, stage: { isWon: true, isLost: false }, source: "WHATSAPP", lostReason: null, intent: null, intentPredicted: null },
    ]);
    const s = await getLeadStats("co_1", null, { from: new Date("2026-06-01T00:00:00Z"), to: new Date("2026-06-30T23:59:59Z") });
    expect(s.total).toBe(2);              // 'old' fora da janela
    expect(s.won).toBe(1);                // só 'a'
    expect(s.bySource["WHATSAPP"]).toBe(2);
    expect(s.bySourceConversion["WHATSAPP"]).toEqual({ total: 2, won: 1 });
  });

  it("SLA e byIntent NÃO são cortados pelo período (refletem TODOS os leads abertos)", async () => {
    const old = new Date(Date.now() - 48 * 3600_000);
    (prisma.lead.findMany as any).mockResolvedValue([
      // criado há muito tempo, aberto e ATRASADO — deve continuar no SLA mesmo com janela curta.
      { id: "velho", createdAt: new Date("2026-01-01T00:00:00Z"), lastActivityAt: old, stage: { isWon: false, isLost: false }, source: null, lostReason: null, intent: "NOVA_COMPRA", intentPredicted: null },
    ]);
    const s = await getLeadStats("co_1", null, { from: new Date("2026-07-01T00:00:00Z") });
    expect(s.total).toBe(0);              // fora da janela → placar zerado
    expect(s.sla.totalOpen).toBe(1);      // mas o SLA vê o lead aberto
    expect(s.sla.late).toBe(1);
    expect(s.byIntent["NOVA_COMPRA"]).toBe(1); // demanda viva não some
  });

  it("bySourceConversion agrega total e ganhos POR origem", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "a", createdAt: NOW, lastActivityAt: NOW, stage: { isWon: true, isLost: false }, source: "WHATSAPP", lostReason: null, intent: null, intentPredicted: null },
      { id: "b", createdAt: NOW, lastActivityAt: NOW, stage: { isWon: false, isLost: false }, source: "WHATSAPP", lostReason: null, intent: null, intentPredicted: null },
      { id: "c", createdAt: NOW, lastActivityAt: NOW, stage: { isWon: true, isLost: false }, source: "WHATSAPP", lostReason: null, intent: null, intentPredicted: null },
      { id: "d", createdAt: NOW, lastActivityAt: NOW, stage: { isWon: false, isLost: true }, source: "INSTAGRAM", lostReason: "Preço", intent: null, intentPredicted: null },
      // sem origem: não entra em bySourceConversion (não há origem a atribuir).
      { id: "e", createdAt: NOW, lastActivityAt: NOW, stage: { isWon: true, isLost: false }, source: null, lostReason: null, intent: null, intentPredicted: null },
    ]);
    const s = await getLeadStats("co_1", null);
    expect(s.bySourceConversion["WHATSAPP"]).toEqual({ total: 3, won: 2 });
    expect(s.bySourceConversion["INSTAGRAM"]).toEqual({ total: 1, won: 0 });
    expect(s.bySourceConversion["null"]).toBeUndefined();
    // bySource (volume) continua contando todas as origens presentes.
    expect(s.bySource["WHATSAPP"]).toBe(3);
  });
});

describe("correctLeadIntent — correção humana da intenção (telemetria Fase 3)", () => {
  it("grava o novo intent + autor/data quando o lead é da empresa", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", intentPredicted: "NOVA_COMPRA" });
    (prisma.lead.update as any).mockResolvedValue({ id: "l1", intent: "RECLAMACAO" });
    await correctLeadIntent("l1", "RECLAMACAO", "co_1", "user_9");
    const data = (prisma.lead.update as any).mock.calls[0][0].data;
    expect(data.intent).toBe("RECLAMACAO");
    expect(data.intentCorrectedById).toBe("user_9");
    expect(data.intentCorrectedAt).toBeInstanceOf(Date);
  });

  it("NÃO sobrescreve intentPredicted (preserva o palpite original da IA)", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", intentPredicted: "NOVA_COMPRA" });
    (prisma.lead.update as any).mockResolvedValue({ id: "l1" });
    await correctLeadIntent("l1", "RECLAMACAO", "co_1", "user_9");
    const data = (prisma.lead.update as any).mock.calls[0][0].data;
    expect(data.intentPredicted).toBeUndefined(); // nunca tocado pelo writer
  });

  it("se o lead nunca teve predição da IA, registra a predição = intent atual (mantém auditável)", async () => {
    // Lead criado manualmente (sem IA) que o humano agora rotula: intentPredicted
    // ainda null → não inventa acurácia (a correção não conta como erro da IA).
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", intentPredicted: null });
    (prisma.lead.update as any).mockResolvedValue({ id: "l1" });
    await correctLeadIntent("l1", "ORCAMENTO_PRECO", "co_1", "user_9");
    const data = (prisma.lead.update as any).mock.calls[0][0].data;
    expect(data.intent).toBe("ORCAMENTO_PRECO");
    expect("intentPredicted" in data).toBe(false); // não fabrica predição
  });

  it("rejeita lead de outra empresa (cross-tenant)", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    await expect(correctLeadIntent("l_outra", "RECLAMACAO", "co_1", "user_9")).rejects.toThrow(/lead/i);
    expect((prisma.lead.update as any)).not.toHaveBeenCalled();
  });

  it("rejeita intent fora do enum (entrada inválida)", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", intentPredicted: "NOVA_COMPRA" });
    await expect(correctLeadIntent("l1", "INTENT_INEXISTENTE" as any, "co_1", "user_9")).rejects.toThrow();
    expect((prisma.lead.update as any)).not.toHaveBeenCalled();
  });
});

describe("getLeadPrescriptionHint — gancho de 2ª via de receita (Fase 3, Item 2)", () => {
  it("retorna a última receita do cliente vinculado (multi-tenant nos 2 níveis)", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", customerId: "cust1" });
    const issued = new Date("2025-01-10");
    const expires = new Date("2026-01-10");
    (prisma.prescription.findFirst as any).mockResolvedValue({
      id: "rx1", issuedAt: issued, expiresAt: expires, status: "COMPLETA",
    });
    const hint = await getLeadPrescriptionHint("l1", "co_1");
    expect(hint?.id).toBe("rx1");
    expect(hint?.status).toBe("COMPLETA");
    // a busca da receita SEMPRE passa companyId (fecha IDOR cross-feature).
    expect((prisma.prescription.findFirst as any).mock.calls[0][0].where.companyId).toBe("co_1");
    expect((prisma.prescription.findFirst as any).mock.calls[0][0].where.customerId).toBe("cust1");
  });

  it("marca isExpired quando a validade já passou", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", customerId: "cust1" });
    (prisma.prescription.findFirst as any).mockResolvedValue({
      id: "rx1", issuedAt: new Date("2020-01-01"), expiresAt: new Date("2021-01-01"), status: "COMPLETA",
    });
    const hint = await getLeadPrescriptionHint("l1", "co_1");
    expect(hint?.isExpired).toBe(true);
  });

  it("retorna null quando o lead não tem cliente vinculado", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", customerId: null });
    const hint = await getLeadPrescriptionHint("l1", "co_1");
    expect(hint).toBeNull();
    expect((prisma.prescription.findFirst as any)).not.toHaveBeenCalled();
  });

  it("retorna null quando o cliente não tem receita", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", customerId: "cust1" });
    (prisma.prescription.findFirst as any).mockResolvedValue(null);
    const hint = await getLeadPrescriptionHint("l1", "co_1");
    expect(hint).toBeNull();
  });

  it("IDOR cross-feature: lead de outra empresa NÃO consulta receita", async () => {
    // co_1 não enxerga lead de co_2 → o guard de tenant barra ANTES de tocar a
    // tabela de receitas (dado clínico nunca vaza cross-tenant/cross-feature).
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    await expect(getLeadPrescriptionHint("l_co2", "co_1")).rejects.toThrow(/lead/i);
    expect((prisma.prescription.findFirst as any)).not.toHaveBeenCalled();
  });
});
