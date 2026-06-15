import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappMessage: { findUnique: vi.fn(), create: vi.fn() },
    whatsappConversation: { upsert: vi.fn() },
  },
}));
import { prisma } from "@/lib/prisma";
import { persistInboundMessage } from "./whatsapp-message.service";
import type { InboundMessage } from "@/lib/validations/whatsapp-inbound";

const base: InboundMessage = {
  evolutionId: "EV1",
  contactNumber: "5585999",
  contactName: "Maria",
  direction: "inbound",
  type: "text",
  text: "oi",
  mediaUrl: null,
  receivedAt: new Date("2026-06-15T12:00:00Z"),
};

beforeEach(() => vi.clearAllMocks());

describe("persistInboundMessage", () => {
  it("é idempotente: se evolutionId já existe, não cria de novo", async () => {
    (prisma.whatsappMessage.findUnique as any).mockResolvedValue({ id: "m_old" });
    const r = await persistInboundMessage("co_1", base);
    expect(r.created).toBe(false);
    expect(prisma.whatsappConversation.upsert).not.toHaveBeenCalled();
    expect(prisma.whatsappMessage.create).not.toHaveBeenCalled();
  });

  it("upserta a conversa por (companyId, contactNumber) e cria a mensagem", async () => {
    (prisma.whatsappMessage.findUnique as any).mockResolvedValue(null);
    (prisma.whatsappConversation.upsert as any).mockResolvedValue({ id: "conv_1" });
    (prisma.whatsappMessage.create as any).mockResolvedValue({ id: "m_new" });

    const r = await persistInboundMessage("co_1", base);

    expect(r.created).toBe(true);
    const upsertArg = (prisma.whatsappConversation.upsert as any).mock.calls[0][0];
    expect(upsertArg.where).toEqual({ companyId_contactNumber: { companyId: "co_1", contactNumber: "5585999" } });
    expect(upsertArg.update.lastMessageAt).toEqual(base.receivedAt);
    expect(upsertArg.create.companyId).toBe("co_1");

    const createArg = (prisma.whatsappMessage.create as any).mock.calls[0][0];
    expect(createArg.data.conversationId).toBe("conv_1");
    expect(createArg.data.companyId).toBe("co_1");
    expect(createArg.data.evolutionId).toBe("EV1");
    expect(createArg.data.type).toBe("text");
  });

  it("sem evolutionId, ainda cria (não dá pra deduplicar)", async () => {
    (prisma.whatsappConversation.upsert as any).mockResolvedValue({ id: "conv_2" });
    (prisma.whatsappMessage.create as any).mockResolvedValue({ id: "m2" });
    const r = await persistInboundMessage("co_1", { ...base, evolutionId: "" });
    expect(r.created).toBe(true);
    expect(prisma.whatsappMessage.findUnique).not.toHaveBeenCalled();
  });
});
