import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappConversation: { findMany: vi.fn() },
    whatsappMessage: { groupBy: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { computeNeedsReplyLeadIds } from "./lead-needs-reply.service";

beforeEach(() => {
  vi.clearAllMocks();
  // Por padrão nenhuma inbound (o segundo groupBy). Cada teste que liga o
  // "precisa responder" sobrescreve com a última msg do cliente.
  (prisma.whatsappMessage.groupBy as any).mockResolvedValue([]);
});

const T = (iso: string) => new Date(iso);

/**
 * Ajuda os testes que precisam distinguir os DOIS groupBy sobre WhatsappMessage:
 * o 1º filtra outbound (existência de resposta), o 2º agrega inbound (max
 * receivedAt = quando o cliente escreveu por último). Discrimina pela direction.
 */
function mockMessages(opts: {
  outbound?: { conversationId: string }[];
  lastInbound?: { conversationId: string; at: Date }[];
}) {
  (prisma.whatsappMessage.groupBy as any).mockImplementation((args: any) => {
    if (args.where.direction === "outbound") {
      return Promise.resolve(
        (opts.outbound ?? []).map((o) => ({ conversationId: o.conversationId, _count: { _all: 1 } })),
      );
    }
    // inbound: _max.receivedAt por conversa
    return Promise.resolve(
      (opts.lastInbound ?? []).map((i) => ({ conversationId: i.conversationId, _max: { receivedAt: i.at } })),
    );
  });
}

describe("computeNeedsReplyLeadIds — bola com a ótica (Item 5)", () => {
  it("lead com conversa SEM outbound → precisa responder, waitingSince = última inbound", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", leadId: "L1" }]);
    mockMessages({ outbound: [], lastInbound: [{ conversationId: "c1", at: T("2026-07-01T10:00:00Z") }] });
    const m = await computeNeedsReplyLeadIds("co1", ["L1"]);
    expect(m.has("L1")).toBe(true);
    expect(m.get("L1")).toEqual(T("2026-07-01T10:00:00Z"));
  });

  it("lead com conversa COM outbound → NÃO precisa (ótica já respondeu)", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", leadId: "L1" }]);
    mockMessages({ outbound: [{ conversationId: "c1" }] });
    const m = await computeNeedsReplyLeadIds("co1", ["L1"]);
    expect(m.has("L1")).toBe(false);
  });

  it("lead SEM conversa de WhatsApp → fora (sinal indisponível)", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([]);
    const m = await computeNeedsReplyLeadIds("co1", ["L1"]);
    expect(m.has("L1")).toBe(false);
    expect(prisma.whatsappMessage.groupBy).not.toHaveBeenCalled();
  });

  it("lead com 2 conversas, UMA respondida → NÃO precisa (qualquer resposta basta)", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([
      { id: "c1", leadId: "L1" }, { id: "c2", leadId: "L1" },
    ]);
    mockMessages({ outbound: [{ conversationId: "c2" }] });
    const m = await computeNeedsReplyLeadIds("co1", ["L1"]);
    expect(m.has("L1")).toBe(false);
  });

  it("lead com 2 conversas SEM resposta → waitingSince = a inbound MAIS ANTIGA (espera há mais tempo)", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([
      { id: "c1", leadId: "L1" }, { id: "c2", leadId: "L1" },
    ]);
    mockMessages({
      outbound: [],
      lastInbound: [
        { conversationId: "c1", at: T("2026-07-01T08:00:00Z") },
        { conversationId: "c2", at: T("2026-07-02T09:00:00Z") },
      ],
    });
    const m = await computeNeedsReplyLeadIds("co1", ["L1"]);
    // A dor = o cliente que espera há MAIS tempo → a inbound mais antiga sem resposta.
    expect(m.get("L1")).toEqual(T("2026-07-01T08:00:00Z"));
  });

  it("multi-tenant: filtra por companyId em todas as queries", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", leadId: "L1" }]);
    mockMessages({ lastInbound: [{ conversationId: "c1", at: T("2026-07-01T10:00:00Z") }] });
    await computeNeedsReplyLeadIds("co1", ["L1"]);
    expect((prisma.whatsappConversation.findMany as any).mock.calls[0][0].where.companyId).toBe("co1");
    for (const call of (prisma.whatsappMessage.groupBy as any).mock.calls) {
      expect(call[0].where.companyId).toBe("co1");
    }
  });

  it("lista vazia → não consulta o banco", async () => {
    const m = await computeNeedsReplyLeadIds("co1", []);
    expect(m.size).toBe(0);
    expect(prisma.whatsappConversation.findMany).not.toHaveBeenCalled();
  });
});
