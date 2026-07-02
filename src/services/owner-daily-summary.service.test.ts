import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappMessage: { groupBy: vi.fn() },
    whatsappConversation: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getOwnerDailySummary } from "./owner-daily-summary.service";

// NOW = 2026-07-02 12:00 BRT (15:00Z). Início do dia BRT = 2026-07-02T03:00:00Z.
const NOW = new Date("2026-07-02T15:00:00Z");
const at = (iso: string) => new Date(iso);

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.whatsappMessage.groupBy as any).mockResolvedValue([]);
  (prisma.whatsappConversation.findMany as any).mockResolvedValue([]);
});

/** 1º groupBy = inbound de hoje; 2º = outbound das conversas em jogo. */
function mockMessages(inboundToday: any[], lastOutbound: any[]) {
  (prisma.whatsappMessage.groupBy as any).mockImplementation((args: any) =>
    args.where.direction === "inbound"
      ? Promise.resolve(inboundToday)
      : Promise.resolve(lastOutbound),
  );
}

describe("getOwnerDailySummary — resumo do dono (#12)", () => {
  it("sem inbound hoje → tudo zero, não consulta conversas", async () => {
    (prisma.whatsappMessage.groupBy as any).mockResolvedValueOnce([]); // inbound vazio
    const s = await getOwnerDailySummary("co_1", null, NOW);
    expect(s).toEqual({ conversations: 0, replied: 0, awaiting: 0, complaints: 0 });
    expect(prisma.whatsappConversation.findMany).not.toHaveBeenCalled();
  });

  it("'hoje' usa o início do dia no fuso da ótica (BRT), não do servidor", async () => {
    await getOwnerDailySummary("co_1", null, NOW);
    const where = (prisma.whatsappMessage.groupBy as any).mock.calls[0][0].where;
    expect(where.companyId).toBe("co_1");
    expect(where.direction).toBe("inbound");
    // início do dia BRT de 2026-07-02 = 2026-07-02T03:00:00Z
    expect(where.receivedAt.gte.toISOString()).toBe("2026-07-02T03:00:00.000Z");
  });

  it("respondida = outbound após a última inbound; sem resposta = sem outbound depois", async () => {
    mockMessages(
      [
        { conversationId: "c1", _max: { receivedAt: at("2026-07-02T10:00:00Z") } }, // cliente falou 10h
        { conversationId: "c2", _max: { receivedAt: at("2026-07-02T11:00:00Z") } }, // cliente falou 11h
      ],
      [
        { conversationId: "c1", _max: { receivedAt: at("2026-07-02T10:30:00Z") } }, // ótica respondeu 10:30 → respondida
        // c2 sem outbound → sem resposta
      ],
    );
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([
      { id: "c1", needsHumanAttention: false },
      { id: "c2", needsHumanAttention: false },
    ]);
    const s = await getOwnerDailySummary("co_1", null, NOW);
    expect(s.conversations).toBe(2);
    expect(s.replied).toBe(1);
    expect(s.awaiting).toBe(1);
  });

  it("outbound ANTES da última inbound não conta como respondida (cliente re-perguntou)", async () => {
    mockMessages(
      [{ conversationId: "c1", _max: { receivedAt: at("2026-07-02T12:00:00Z") } }], // última inbound 12h
      [{ conversationId: "c1", _max: { receivedAt: at("2026-07-02T09:00:00Z") } }], // outbound às 9h (antes) → não respondida
    );
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", needsHumanAttention: false }]);
    const s = await getOwnerDailySummary("co_1", null, NOW);
    expect(s.replied).toBe(0);
    expect(s.awaiting).toBe(1);
  });

  it("conta reclamações (needsHumanAttention) entre as conversas de hoje", async () => {
    mockMessages(
      [
        { conversationId: "c1", _max: { receivedAt: at("2026-07-02T10:00:00Z") } },
        { conversationId: "c2", _max: { receivedAt: at("2026-07-02T11:00:00Z") } },
      ],
      [],
    );
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([
      { id: "c1", needsHumanAttention: true },
      { id: "c2", needsHumanAttention: false },
    ]);
    const s = await getOwnerDailySummary("co_1", null, NOW);
    expect(s.complaints).toBe(1);
  });

  it("multi-tenant: companyId em todas as queries", async () => {
    mockMessages([{ conversationId: "c1", _max: { receivedAt: at("2026-07-02T10:00:00Z") } }], []);
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", needsHumanAttention: false }]);
    await getOwnerDailySummary("co_1", null, NOW);
    for (const call of (prisma.whatsappMessage.groupBy as any).mock.calls) {
      expect(call[0].where.companyId).toBe("co_1");
    }
    expect((prisma.whatsappConversation.findMany as any).mock.calls[0][0].where.companyId).toBe("co_1");
  });
});
