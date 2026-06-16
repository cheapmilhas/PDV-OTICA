import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiTokenUsage: { create: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { prisma } from "@/lib/prisma";
import { logAiUsage, getMonthlyUsage, getDailyUsage } from "./ai-usage.service";

beforeEach(() => vi.clearAllMocks());

describe("logAiUsage", () => {
  it("grava AiTokenUsage com costUsd calculado", async () => {
    (prisma.aiTokenUsage.create as any).mockResolvedValue({ id: "u1" });

    await logAiUsage({
      companyId: "co1",
      feature: "ocr_prescription",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      inputTokens: 1_000_000,
      outputTokens: 0,
    });

    const arg = (prisma.aiTokenUsage.create as any).mock.calls[0][0];
    expect(arg.data.companyId).toBe("co1");
    expect(arg.data.feature).toBe("ocr_prescription");
    expect(arg.data.inputTokens).toBe(1_000_000);
    // costUsd = $3 (1M input sonnet-4). Gravado como Decimal → comparar string.
    expect(Number(arg.data.costUsd.toString())).toBeCloseTo(3, 4);
  });

  it("é fail-safe: erro do prisma NÃO propaga (retorna sem lançar)", async () => {
    (prisma.aiTokenUsage.create as any).mockRejectedValue(new Error("db down"));
    await expect(
      logAiUsage({
        companyId: "co1",
        feature: "ocr_prescription",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        inputTokens: 100,
      })
    ).resolves.toBeUndefined();
  });
});

describe("getMonthlyUsage", () => {
  it("soma tokens + custo do mês e quebra por feature", async () => {
    (prisma.aiTokenUsage.findMany as any).mockResolvedValue([
      { feature: "ocr_prescription", inputTokens: 100, outputTokens: 50, cacheTokens: 0, costUsd: "0.001" },
      { feature: "ocr_prescription", inputTokens: 200, outputTokens: 30, cacheTokens: 10, costUsd: "0.002" },
      { feature: "lead_qualification", inputTokens: 500, outputTokens: 100, cacheTokens: 0, costUsd: "0.005" },
    ]);

    const r = await getMonthlyUsage("co1");

    expect(r.totalTokens).toBe(100 + 50 + 200 + 30 + 10 + 500 + 100);
    expect(r.totalCostUsd).toBeCloseTo(0.008, 6);
    expect(r.byFeature.ocr_prescription.tokens).toBe(100 + 50 + 200 + 30 + 10);
    expect(r.byFeature.lead_qualification.tokens).toBe(600);

    // multi-tenant: WHERE filtra companyId + janela do mês
    const where = (prisma.aiTokenUsage.findMany as any).mock.calls[0][0].where;
    expect(where.companyId).toBe("co1");
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });

  it("mês sem uso → zeros", async () => {
    (prisma.aiTokenUsage.findMany as any).mockResolvedValue([]);
    const r = await getMonthlyUsage("co1");
    expect(r.totalTokens).toBe(0);
    expect(r.totalCostUsd).toBe(0);
    expect(r.byFeature).toEqual({});
  });
});

describe("getDailyUsage", () => {
  it("agrupa tokens e custo por dia do mês corrente", async () => {
    (prisma.aiTokenUsage.findMany as any).mockResolvedValue([
      { createdAt: new Date("2026-06-16T10:00:00Z"), inputTokens: 100, outputTokens: 50, cacheTokens: 0, costUsd: "0.01" },
      { createdAt: new Date("2026-06-16T15:00:00Z"), inputTokens: 200, outputTokens: 0, cacheTokens: 0, costUsd: "0.02" },
      { createdAt: new Date("2026-06-17T09:00:00Z"), inputTokens: 50, outputTokens: 50, cacheTokens: 0, costUsd: "0.005" },
    ]);
    const r = await getDailyUsage("co1");
    expect(r.find(d => d.date === "2026-06-16")?.tokens).toBe(350);
    expect(r.find(d => d.date === "2026-06-16")?.costUsd).toBeCloseTo(0.03, 6);
    expect(r.find(d => d.date === "2026-06-17")?.tokens).toBe(100);
    expect(Array.isArray(r)).toBe(true);
    // multi-tenant + janela do mês no WHERE
    const where = (prisma.aiTokenUsage.findMany as any).mock.calls[0][0].where;
    expect(where.companyId).toBe("co1");
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });
});
