import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappConversation: { findMany: vi.fn() },
    whatsappMessage: { groupBy: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { computeNeedsReplyLeadIds } from "./lead-needs-reply.service";

beforeEach(() => vi.clearAllMocks());

describe("computeNeedsReplyLeadIds — bola com a ótica (Item 5)", () => {
  it("lead com conversa SEM outbound → precisa responder", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", leadId: "L1" }]);
    (prisma.whatsappMessage.groupBy as any).mockResolvedValue([]); // nenhuma outbound
    const s = await computeNeedsReplyLeadIds("co1", ["L1"]);
    expect(s.has("L1")).toBe(true);
  });

  it("lead com conversa COM outbound → NÃO precisa (ótica já respondeu)", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", leadId: "L1" }]);
    (prisma.whatsappMessage.groupBy as any).mockResolvedValue([{ conversationId: "c1", _count: { _all: 2 } }]);
    const s = await computeNeedsReplyLeadIds("co1", ["L1"]);
    expect(s.has("L1")).toBe(false);
  });

  it("lead SEM conversa de WhatsApp → fora (sinal indisponível)", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([]);
    const s = await computeNeedsReplyLeadIds("co1", ["L1"]);
    expect(s.has("L1")).toBe(false);
    expect(prisma.whatsappMessage.groupBy).not.toHaveBeenCalled();
  });

  it("lead com 2 conversas, UMA respondida → NÃO precisa (qualquer resposta basta)", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([
      { id: "c1", leadId: "L1" }, { id: "c2", leadId: "L1" },
    ]);
    (prisma.whatsappMessage.groupBy as any).mockResolvedValue([{ conversationId: "c2", _count: { _all: 1 } }]);
    const s = await computeNeedsReplyLeadIds("co1", ["L1"]);
    expect(s.has("L1")).toBe(false);
  });

  it("multi-tenant: filtra por companyId nas duas queries", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", leadId: "L1" }]);
    (prisma.whatsappMessage.groupBy as any).mockResolvedValue([]);
    await computeNeedsReplyLeadIds("co1", ["L1"]);
    expect((prisma.whatsappConversation.findMany as any).mock.calls[0][0].where.companyId).toBe("co1");
    expect((prisma.whatsappMessage.groupBy as any).mock.calls[0][0].where.companyId).toBe("co1");
  });

  it("lista vazia → não consulta o banco", async () => {
    const s = await computeNeedsReplyLeadIds("co1", []);
    expect(s.size).toBe(0);
    expect(prisma.whatsappConversation.findMany).not.toHaveBeenCalled();
  });
});
