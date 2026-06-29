import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappConversation: { findMany: vi.fn(), findUnique: vi.fn() },
    whatsappMessage: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  listInboxConversations,
  getConversationMessages,
} from "./whatsapp-inbox.service";

const findMany = prisma.whatsappConversation.findMany as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.whatsappConversation.findUnique as unknown as ReturnType<typeof vi.fn>;
const msgFindMany = prisma.whatsappMessage.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("listInboxConversations", () => {
  it("sempre filtra por companyId e exclui grupos por padrão", async () => {
    findMany.mockResolvedValue([]);
    await listInboxConversations("co1");
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.companyId).toBe("co1");
    expect(arg.where.isGroup).toBe(false);
    expect(arg.orderBy).toEqual({ lastMessageAt: "desc" });
  });

  it("status=pending filtra analyzedAt null OU needsAnalysis", async () => {
    findMany.mockResolvedValue([]);
    await listInboxConversations("co1", { status: "pending" });
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ analyzedAt: null }, { needsAnalysis: true }]);
  });

  it("status=analyzed filtra analyzedAt not null e needsAnalysis false", async () => {
    findMany.mockResolvedValue([]);
    await listInboxConversations("co1", { status: "analyzed" });
    const where = findMany.mock.calls[0][0].where;
    expect(where.analyzedAt).toEqual({ not: null });
    expect(where.needsAnalysis).toBe(false);
  });

  it("includeGroups=true não filtra isGroup", async () => {
    findMany.mockResolvedValue([]);
    await listInboxConversations("co1", { includeGroups: true });
    expect(findMany.mock.calls[0][0].where.isGroup).toBeUndefined();
  });

  it("mapeia messageCount e lastMessageText", async () => {
    findMany.mockResolvedValue([
      {
        id: "c1",
        contactNumber: "5585999",
        contactName: "Maria",
        lastMessageAt: new Date("2026-06-29T00:00:00Z"),
        analyzedAt: null,
        needsAnalysis: false,
        leadId: null,
        _count: { messages: 3 },
        messages: [{ text: "oi quanto custa" }],
      },
    ]);
    const out = await listInboxConversations("co1");
    expect(out[0].messageCount).toBe(3);
    expect(out[0].lastMessageText).toBe("oi quanto custa");
    expect(out[0].contactName).toBe("Maria");
  });

  it("lastMessageText null quando não há mensagem inbound", async () => {
    findMany.mockResolvedValue([
      {
        id: "c1", contactNumber: "x", contactName: null,
        lastMessageAt: new Date(), analyzedAt: null, needsAnalysis: false, leadId: null,
        _count: { messages: 0 }, messages: [],
      },
    ]);
    const out = await listInboxConversations("co1");
    expect(out[0].lastMessageText).toBeNull();
  });

  it("clampa o take entre 1 e 200", async () => {
    findMany.mockResolvedValue([]);
    await listInboxConversations("co1", { take: 9999 });
    expect(findMany.mock.calls[0][0].take).toBe(200);
    await listInboxConversations("co1", { take: 0 });
    expect(findMany.mock.calls[1][0].take).toBe(1);
  });
});

describe("getConversationMessages", () => {
  it("retorna null se a conversa não é da empresa (tenant-guard)", async () => {
    findUnique.mockResolvedValue({ id: "c1", companyId: "OUTRA" });
    const out = await getConversationMessages("co1", "c1");
    expect(out).toBeNull();
    expect(msgFindMany).not.toHaveBeenCalled();
  });

  it("retorna null se a conversa não existe", async () => {
    findUnique.mockResolvedValue(null);
    const out = await getConversationMessages("co1", "cX");
    expect(out).toBeNull();
  });

  it("retorna mensagens ordenadas asc quando é da empresa", async () => {
    findUnique.mockResolvedValue({ id: "c1", companyId: "co1" });
    msgFindMany.mockResolvedValue([
      { id: "m1", direction: "inbound", type: "text", text: "oi", receivedAt: new Date() },
    ]);
    const out = await getConversationMessages("co1", "c1");
    expect(out).toHaveLength(1);
    expect(msgFindMany.mock.calls[0][0].orderBy).toEqual({ receivedAt: "asc" });
    expect(msgFindMany.mock.calls[0][0].where).toEqual({ conversationId: "c1" });
  });
});
