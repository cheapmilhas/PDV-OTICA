import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    leadStage: { findFirst: vi.fn() },
    lead: { create: vi.fn(), findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
}));
import { prisma } from "@/lib/prisma";
import { createLead, listLeads, moveLead } from "./lead.service";

beforeEach(() => vi.clearAllMocks());

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
