import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    leadStage: { findFirst: vi.fn() },
    lead: { create: vi.fn(), findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    customer: { findFirst: vi.fn() },
    quote: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));
import { prisma } from "@/lib/prisma";
import { createLead, listLeads, moveLead, getLeadStats, updateLead } from "./lead.service";

beforeEach(() => {
  vi.clearAllMocks();
  // Por padrão, FKs válidas (da mesma empresa) — testes cross-tenant sobrescrevem.
  (prisma.customer.findFirst as any).mockResolvedValue({ id: "cust_ok" });
  (prisma.quote.findFirst as any).mockResolvedValue({ id: "quote_ok" });
  (prisma.user.findFirst as any).mockResolvedValue({ id: "user_ok" });
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
});

describe("getLeadStats", () => {
  it("calcula conversão = ganhos / total e agrega lostReason e source", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { stage: { isWon: true, isLost: false }, source: "WHATSAPP", lostReason: null },
      { stage: { isWon: false, isLost: true }, source: "INSTAGRAM", lostReason: "Preço" },
      { stage: { isWon: false, isLost: false }, source: "WHATSAPP", lostReason: null },
    ]);
    const s = await getLeadStats("co_1", null);
    expect(s.total).toBe(3);
    expect(s.won).toBe(1);
    expect(s.conversionRate).toBeCloseTo(1 / 3);
    expect(s.byLostReason["Preço"]).toBe(1);
    expect(s.bySource["WHATSAPP"]).toBe(2);
  });
});
