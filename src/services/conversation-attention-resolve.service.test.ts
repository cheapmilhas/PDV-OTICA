import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappConversation: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { resolveConversationAttention } from "./conversation-attention-resolve.service";

beforeEach(() => vi.clearAllMocks());

describe("resolveConversationAttention — baixa HUMANA do guardrail (auditada)", () => {
  it("dá baixa: needsHumanAttention=false + resolvedAt/ById (trilha)", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ id: "c1", companyId: "co1", needsHumanAttention: true });
    (prisma.whatsappConversation.update as any).mockResolvedValue({});
    const ok = await resolveConversationAttention("co1", "c1", "user-9");
    expect(ok).toBe(true);
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.where.id).toBe("c1");
    expect(upd.data.needsHumanAttention).toBe(false);
    expect(upd.data.attentionResolvedById).toBe("user-9");
    expect(upd.data.attentionResolvedAt).toBeInstanceOf(Date);
  });

  it("multi-tenant: conversa de OUTRA empresa → null, NÃO atualiza", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ id: "c1", companyId: "outra", needsHumanAttention: true });
    const r = await resolveConversationAttention("co1", "c1", "user-9");
    expect(r).toBeNull();
    expect(prisma.whatsappConversation.update).not.toHaveBeenCalled();
  });

  it("conversa inexistente → null", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue(null);
    const r = await resolveConversationAttention("co1", "nope", "user-9");
    expect(r).toBeNull();
    expect(prisma.whatsappConversation.update).not.toHaveBeenCalled();
  });
});
