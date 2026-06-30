import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { funnelAutoMoveLog: { create: vi.fn() } },
}));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));

import { prisma } from "@/lib/prisma";
import { recordAutoMoveTrace } from "./funnel-automove-trace.service";

const createMock = prisma.funnelAutoMoveLog.create as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("recordAutoMoveTrace — trilha append-only do auto-move", () => {
  it("grava 1 linha com os campos da decisão", async () => {
    createMock.mockResolvedValue({ id: "x" });
    await recordAutoMoveTrace({
      companyId: "co_1", leadId: "lead_1", action: "move", moved: true,
      reason: "interesse de compra (NOVA_COMPRA)", killSwitchOn: true,
      intent: "NOVA_COMPRA", confidence: 0.85, envSeen: "set",
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0][0].data;
    expect(data).toMatchObject({
      companyId: "co_1", leadId: "lead_1", action: "move", moved: true,
      killSwitchOn: true, intent: "NOVA_COMPRA", confidence: 0.85, envSeen: "set",
    });
  });

  it("grava o erro quando action='error'", async () => {
    createMock.mockResolvedValue({ id: "x" });
    await recordAutoMoveTrace({
      companyId: "co_1", leadId: "lead_1", action: "error", moved: false,
      reason: "exceção no fluxo", error: "boom",
    });
    const data = createMock.mock.calls[0][0].data;
    expect(data.action).toBe("error");
    expect(data.error).toBe("boom");
  });

  it("AWAIT-BUT-SWALLOW: erro na escrita NÃO propaga (não quebra o cron fail-safe)", async () => {
    createMock.mockRejectedValue(new Error("db down"));
    await expect(
      recordAutoMoveTrace({ companyId: "co_1", leadId: "lead_1", action: "move", moved: true, reason: "x" }),
    ).resolves.toBeUndefined();
  });

  it("multi-tenant: sempre grava companyId", async () => {
    createMock.mockResolvedValue({ id: "x" });
    await recordAutoMoveTrace({ companyId: "co_42", leadId: "lead_1", action: "hold", moved: false, reason: "x" });
    expect(createMock.mock.calls[0][0].data.companyId).toBe("co_42");
  });
});
