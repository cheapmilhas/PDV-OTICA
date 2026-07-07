import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    companySettings: { findMany: vi.fn() },
    aiTokenUsage: { groupBy: vi.fn() },
    aiGlobalConfig: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { prisma } from "@/lib/prisma";
import { getAllCompaniesAiOverview } from "./ai-companies-overview.service";

function mockGlobalConfig(over: Partial<{ usdBrlRate: number; markupPercent: number; creditTokenFactor: number }> = {}) {
  (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({
    id: "global",
    anthropicKeyEnc: null,
    openaiKeyEnc: null,
    usdBrlRate: String(over.usdBrlRate ?? 5),
    markupPercent: String(over.markupPercent ?? 100),
    creditTokenFactor: over.creditTokenFactor ?? 1000,
    qualifierModel: "claude-haiku-4-5",
    lensAdvisorModel: "claude-haiku-4-5",
    ocrModel: "claude-haiku-4-5",
  });
}

beforeEach(() => vi.clearAllMocks());

describe("getAllCompaniesAiOverview", () => {
  it("faz UMA query agregada (groupBy), não N+1 por ótica", async () => {
    mockGlobalConfig();
    (prisma.companySettings.findMany as any).mockResolvedValue([
      { companyId: "co1", iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: null, markupPercentOverride: null, company: { id: "co1", name: "Ótica A" } },
      { companyId: "co2", iaAvailable: true, iaEnabled: false, iaMonthlyTokenLimit: 1_000_000, markupPercentOverride: "50", company: { id: "co2", name: "Ótica B" } },
    ]);
    (prisma.aiTokenUsage.groupBy as any).mockResolvedValue([
      { companyId: "co1", _sum: { inputTokens: 1_000_000, outputTokens: 0, cacheTokens: 0, cacheWriteTokens: 0, costUsd: "3" } },
    ]);

    const rows = await getAllCompaniesAiOverview();

    // groupBy chamado exatamente uma vez (batch), não 1×/empresa
    expect((prisma.aiTokenUsage.groupBy as any).mock.calls.length).toBe(1);
    // findMany das settings chamado uma vez
    expect((prisma.companySettings.findMany as any).mock.calls.length).toBe(1);
    expect(rows).toHaveLength(2);
  });

  it("calcula custo/preço/lucro por ótica usando markup efetivo (override tem precedência)", async () => {
    // câmbio 5, markup global 100%
    mockGlobalConfig({ usdBrlRate: 5, markupPercent: 100 });
    (prisma.companySettings.findMany as any).mockResolvedValue([
      // co1 sem override → usa global 100%
      { companyId: "co1", iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: null, markupPercentOverride: null, company: { id: "co1", name: "Ótica A" } },
      // co2 com override 0% → preço = custo, lucro 0
      { companyId: "co2", iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: null, markupPercentOverride: "0", company: { id: "co2", name: "Ótica B" } },
    ]);
    (prisma.aiTokenUsage.groupBy as any).mockResolvedValue([
      { companyId: "co1", _sum: { inputTokens: 0, outputTokens: 0, cacheTokens: 0, cacheWriteTokens: 0, costUsd: "2" } },
      { companyId: "co2", _sum: { inputTokens: 0, outputTokens: 0, cacheTokens: 0, cacheWriteTokens: 0, costUsd: "2" } },
    ]);

    const rows = await getAllCompaniesAiOverview();
    const co1 = rows.find((r) => r.companyId === "co1")!;
    const co2 = rows.find((r) => r.companyId === "co2")!;

    // co1: custo 2 USD × 5 = R$10 real; preço = 2×5×(1+100/100)=R$20; lucro R$10
    expect(co1.costBrlReal).toBeCloseTo(10, 6);
    expect(co1.markupPercent).toBe(100);
    expect(co1.priceBrl).toBeCloseTo(20, 6);
    expect(co1.lucroBrl).toBeCloseTo(10, 6);

    // co2: override 0% → preço = custo, lucro 0
    expect(co2.markupPercent).toBe(0);
    expect(co2.costBrlReal).toBeCloseTo(10, 6);
    expect(co2.priceBrl).toBeCloseTo(10, 6);
    expect(co2.lucroBrl).toBeCloseTo(0, 6);
  });

  it("ótica sem uso no mês aparece com zeros (left join em memória)", async () => {
    mockGlobalConfig();
    (prisma.companySettings.findMany as any).mockResolvedValue([
      { companyId: "co1", iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: null, markupPercentOverride: null, company: { id: "co1", name: "Ótica A" } },
    ]);
    // groupBy não retorna co1 (nenhum uso)
    (prisma.aiTokenUsage.groupBy as any).mockResolvedValue([]);

    const rows = await getAllCompaniesAiOverview();
    expect(rows).toHaveLength(1);
    expect(rows[0].totalTokens).toBe(0);
    expect(rows[0].costBrlReal).toBe(0);
    expect(rows[0].priceBrl).toBe(0);
    expect(rows[0].lucroBrl).toBe(0);
  });

  it("soma todos os tipos de token (input+output+cache+cacheWrite)", async () => {
    mockGlobalConfig();
    (prisma.companySettings.findMany as any).mockResolvedValue([
      { companyId: "co1", iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: null, markupPercentOverride: null, company: { id: "co1", name: "Ótica A" } },
    ]);
    (prisma.aiTokenUsage.groupBy as any).mockResolvedValue([
      { companyId: "co1", _sum: { inputTokens: 100, outputTokens: 50, cacheTokens: 10, cacheWriteTokens: 5, costUsd: "0.01" } },
    ]);

    const rows = await getAllCompaniesAiOverview();
    expect(rows[0].totalTokens).toBe(165);
  });

  it("filtra por iaAvailable OU iaEnabled e restringe janela do mês no groupBy", async () => {
    mockGlobalConfig();
    (prisma.companySettings.findMany as any).mockResolvedValue([]);
    (prisma.aiTokenUsage.groupBy as any).mockResolvedValue([]);

    await getAllCompaniesAiOverview();

    const settingsWhere = (prisma.companySettings.findMany as any).mock.calls[0][0].where;
    expect(settingsWhere.OR).toEqual([{ iaAvailable: true }, { iaEnabled: true }]);

    const groupByArg = (prisma.aiTokenUsage.groupBy as any).mock.calls[0][0];
    expect(groupByArg.by).toEqual(["companyId"]);
    expect(groupByArg.where.createdAt.gte).toBeInstanceOf(Date);
    expect(groupByArg.where.createdAt.lte).toBeInstanceOf(Date);
  });

  it("ordena por lucro desc por padrão (quem dá mais lucro primeiro)", async () => {
    mockGlobalConfig({ usdBrlRate: 5, markupPercent: 100 });
    (prisma.companySettings.findMany as any).mockResolvedValue([
      { companyId: "co1", iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: null, markupPercentOverride: null, company: { id: "co1", name: "A" } },
      { companyId: "co2", iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: null, markupPercentOverride: null, company: { id: "co2", name: "B" } },
    ]);
    (prisma.aiTokenUsage.groupBy as any).mockResolvedValue([
      { companyId: "co1", _sum: { inputTokens: 0, outputTokens: 0, cacheTokens: 0, cacheWriteTokens: 0, costUsd: "1" } },
      { companyId: "co2", _sum: { inputTokens: 0, outputTokens: 0, cacheTokens: 0, cacheWriteTokens: 0, costUsd: "5" } },
    ]);

    const rows = await getAllCompaniesAiOverview();
    // co2 consome mais → mais lucro → vem primeiro
    expect(rows[0].companyId).toBe("co2");
    expect(rows[1].companyId).toBe("co1");
  });
});
