import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const msgDeleteMany = vi.fn();
const convDeleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappMessage: { deleteMany: (...a: unknown[]) => msgDeleteMany(...a) },
    whatsappConversation: { deleteMany: (...a: unknown[]) => convDeleteMany(...a) },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { runWhatsappRetention } from "@/services/whatsapp-retention.service";

const NOW = new Date("2026-06-15T12:00:00Z");

describe("runWhatsappRetention", () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    msgDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    convDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    delete process.env.WHATSAPP_RETENTION_DAYS;
    delete process.env.WHATSAPP_MAX_RETENTION_DAYS;
  });
  afterEach(() => { process.env = { ...ORIG }; });

  it("apaga msgs analisadas > 3 dias (cutoff 3d) e teto > 7 dias", async () => {
    msgDeleteMany.mockResolvedValueOnce({ count: 5 }).mockResolvedValueOnce({ count: 2 });
    convDeleteMany.mockResolvedValueOnce({ count: 1 });
    const r = await runWhatsappRetention(NOW);

    expect(r.retentionDays).toBe(3);
    expect(r.maxRetentionDays).toBe(7);
    expect(r.deletedAnalyzed).toBe(5);
    expect(r.deletedMaxAge).toBe(2);
    expect(r.deletedEmptyConversations).toBe(1);

    // 1ª chamada: > cutoff 3d E conversa analisada
    const c1 = msgDeleteMany.mock.calls[0][0];
    expect(c1.where.conversation.analyzedAt).toEqual({ not: null });
    const cutoff3 = new Date(NOW.getTime() - 3 * 86400000);
    expect(c1.where.receivedAt.lt.getTime()).toBe(cutoff3.getTime());

    // 2ª chamada: teto 7d, sem filtro de analyzedAt
    const c2 = msgDeleteMany.mock.calls[1][0];
    expect(c2.where.conversation).toBeUndefined();
    const cutoff7 = new Date(NOW.getTime() - 7 * 86400000);
    expect(c2.where.receivedAt.lt.getTime()).toBe(cutoff7.getTime());

    // conversas sem mensagens
    expect(convDeleteMany.mock.calls[0][0].where.messages).toEqual({ none: {} });
  });

  it("respeita os limites configuráveis por env", async () => {
    process.env.WHATSAPP_RETENTION_DAYS = "1";
    process.env.WHATSAPP_MAX_RETENTION_DAYS = "5";
    const r = await runWhatsappRetention(NOW);
    expect(r.retentionDays).toBe(1);
    expect(r.maxRetentionDays).toBe(5);
    const cutoff1 = new Date(NOW.getTime() - 1 * 86400000);
    expect(msgDeleteMany.mock.calls[0][0].where.receivedAt.lt.getTime()).toBe(cutoff1.getTime());
  });

  it("não lança se o prisma falhar", async () => {
    msgDeleteMany.mockRejectedValueOnce(new Error("db down"));
    const r = await runWhatsappRetention(NOW);
    expect(r.deletedAnalyzed).toBe(0); // não quebrou
  });
});
