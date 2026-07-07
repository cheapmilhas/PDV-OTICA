import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiGlobalConfig: { upsert: vi.fn() },
    aiTokenUsage: { groupBy: vi.fn(), aggregate: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock("@/services/ai-companies-overview.service", () => ({
  getAllCompaniesAiOverview: vi.fn(),
}));
vi.mock("@/services/ai-usage.service", () => ({
  getInternalMonthlyUsage: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getAllCompaniesAiOverview } from "@/services/ai-companies-overview.service";
import { getInternalMonthlyUsage } from "@/services/ai-usage.service";
import { getAiCostOverview, getAiCostTrend } from "./ai-cost-overview.service";

const mockOverview = vi.mocked(getAllCompaniesAiOverview);
const mockInternal = vi.mocked(getInternalMonthlyUsage);

function mockConfig(over: Partial<{ usdBrlRate: number; markupPercent: number }> = {}) {
  (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({
    id: "global",
    usdBrlRate: String(over.usdBrlRate ?? 5),
    markupPercent: String(over.markupPercent ?? 100),
    creditTokenFactor: 1000,
  });
}

const NOW = new Date("2026-06-15T15:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("getAiCostOverview", () => {
  it("soma as linhas do mês (fonte única = aba Óticas) e conta adoção", async () => {
    mockConfig({ usdBrlRate: 5, markupPercent: 100 });
    mockOverview.mockResolvedValue([
      { companyId: "co1", companyName: "A", iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: null, markupPercentOverride: null, totalTokens: 100, totalCostUsd: 1, costBrlReal: 5, markupPercent: 100, priceBrl: 10, lucroBrl: 5 },
      { companyId: "co2", companyName: "B", iaAvailable: true, iaEnabled: false, iaMonthlyTokenLimit: null, markupPercentOverride: null, totalTokens: 50, totalCostUsd: 0.5, costBrlReal: 2.5, markupPercent: 100, priceBrl: 5, lucroBrl: 2.5 },
    ] as any);
    mockInternal.mockResolvedValue({ totalTokens: 10, totalCostUsd: 0.1, byFeature: {} });
    (prisma.aiTokenUsage.groupBy as any).mockResolvedValue([
      { feature: "lead_qualification", _sum: { inputTokens: 100, outputTokens: 50, cacheTokens: 0, cacheWriteTokens: 0, costUsd: "1.5" } },
    ]);
    (prisma.aiTokenUsage.aggregate as any).mockResolvedValue({ _sum: { costUsd: "0" } });

    const r = await getAiCostOverview(NOW);

    expect(r.costBrlReal).toBeCloseTo(7.5, 6); // 5 + 2.5
    expect(r.priceBrl).toBeCloseTo(15, 6); // 10 + 5
    expect(r.profitBrl).toBeCloseTo(7.5, 6); // 5 + 2.5
    expect(r.activeShops).toBe(1); // só co1 iaEnabled
    expect(r.availableShops).toBe(2);
    expect(r.internal.costBrl).toBeCloseTo(0.5, 6); // 0.1 × 5
    expect(r.byFeature[0].feature).toBe("lead_qualification");
    expect(r.byFeature[0].totalTokens).toBe(150);
  });

  it("byFeature inclui o interno (groupBy SEM filtro de companyId) e ordena por custo desc", async () => {
    mockConfig();
    mockOverview.mockResolvedValue([]);
    mockInternal.mockResolvedValue({ totalTokens: 0, totalCostUsd: 0, byFeature: {} });
    (prisma.aiTokenUsage.groupBy as any).mockResolvedValue([
      { feature: "ocr_prescription", _sum: { inputTokens: 10, outputTokens: 0, cacheTokens: 0, cacheWriteTokens: 0, costUsd: "0.1" } },
      { feature: "lead_qualification", _sum: { inputTokens: 20, outputTokens: 0, cacheTokens: 0, cacheWriteTokens: 0, costUsd: "0.9" } },
    ]);
    (prisma.aiTokenUsage.aggregate as any).mockResolvedValue({ _sum: { costUsd: "0" } });

    const r = await getAiCostOverview(NOW);

    // ordena por custo desc → qualification (0.9) antes de ocr (0.1)
    expect(r.byFeature.map((f) => f.feature)).toEqual(["lead_qualification", "ocr_prescription"]);
    // groupBy chamado SEM filtro de companyId (inclui interno)
    const gbWhere = (prisma.aiTokenUsage.groupBy as any).mock.calls[0][0].where;
    expect(gbWhere.companyId).toBeUndefined();
    expect(gbWhere.createdAt.gte).toBeInstanceOf(Date);
    expect(gbWhere.createdAt.lte).toBeInstanceOf(Date);
  });

  it("tendência: compara mês atual vs anterior (agg do mês anterior filtra companyId not null)", async () => {
    mockConfig({ usdBrlRate: 5, markupPercent: 100 });
    mockOverview.mockResolvedValue([
      { companyId: "co1", companyName: "A", iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: null, markupPercentOverride: null, totalTokens: 0, totalCostUsd: 2, costBrlReal: 10, markupPercent: 100, priceBrl: 20, lucroBrl: 10 },
    ] as any);
    mockInternal.mockResolvedValue({ totalTokens: 0, totalCostUsd: 0, byFeature: {} });
    (prisma.aiTokenUsage.groupBy as any).mockResolvedValue([]);
    // mês anterior custou 1 USD → custoBrl anterior = 5
    (prisma.aiTokenUsage.aggregate as any).mockResolvedValue({ _sum: { costUsd: "1" } });

    const r = await getAiCostOverview(NOW);

    // custo atual 10 vs anterior 5 → +100%
    expect(r.costTrend.current).toBeCloseTo(10, 6);
    expect(r.costTrend.previous).toBeCloseTo(5, 6);
    expect(r.costTrend.direction).toBe("up");

    const aggWhere = (prisma.aiTokenUsage.aggregate as any).mock.calls[0][0].where;
    expect(aggWhere.companyId).toEqual({ not: null });
    expect(aggWhere.createdAt.gte).toBeInstanceOf(Date);
    expect(aggWhere.createdAt.lte).toBeInstanceOf(Date);
  });

  it("virada de mês em UTC: 01/jul 01:00Z (= 30/jun 22h BRT) → mês anterior é MAIO, não junho", async () => {
    mockConfig();
    mockOverview.mockResolvedValue([]);
    mockInternal.mockResolvedValue({ totalTokens: 0, totalCostUsd: 0, byFeature: {} });
    (prisma.aiTokenUsage.groupBy as any).mockResolvedValue([]);
    (prisma.aiTokenUsage.aggregate as any).mockResolvedValue({ _sum: { costUsd: "0" } });

    // 2026-07-01T01:00Z ainda é 30/jun em BRT → mês corrente = junho, anterior = maio.
    const rollover = new Date("2026-07-01T01:00:00Z");
    await getAiCostOverview(rollover);

    const aggWhere = (prisma.aiTokenUsage.aggregate as any).mock.calls[0][0].where;
    // janela do mês anterior (maio/2026): início ~2026-05-01 03:00Z, fim antes de junho.
    // Bug (fuso servidor) apontaria para junho. Checamos que gte cai em maio (BRT).
    const gteIso = aggWhere.createdAt.gte.toISOString();
    expect(gteIso.startsWith("2026-05")).toBe(true);
  });
});

describe("getAiCostTrend", () => {
  it("faz UMA query $queryRaw e devolve `months` pontos", async () => {
    mockConfig({ usdBrlRate: 5, markupPercent: 100 });
    (prisma.$queryRaw as any).mockResolvedValue([
      { key: "2026-06", cost_usd: "2" },
      { key: "2026-04", cost_usd: "1" },
    ]);

    const series = await getAiCostTrend(NOW, 6);

    expect((prisma.$queryRaw as any).mock.calls.length).toBe(1);
    expect(series).toHaveLength(6);
    // junho: custo 2×5 = 10, lucro (markup 100%) = 10
    const jun = series.find((p) => p.key === "2026-06")!;
    expect(jun.costBrl).toBeCloseTo(10, 6);
    expect(jun.profitBrl).toBeCloseTo(10, 6);
    // abril: custo 1×5 = 5
    const abr = series.find((p) => p.key === "2026-04")!;
    expect(abr.costBrl).toBeCloseTo(5, 6);
    // meses sem linha → 0
    const mai = series.find((p) => p.key === "2026-05")!;
    expect(mai.costBrl).toBe(0);
  });

  it("virada de mês em UTC: janela de 6m ancorada em BRT (não desliza um mês)", async () => {
    mockConfig();
    (prisma.$queryRaw as any).mockResolvedValue([]);

    // 01/jul 01:00Z = 30/jun 22h BRT → mês corrente = junho; 6 meses = jan..jun.
    const rollover = new Date("2026-07-01T01:00:00Z");
    const series = await getAiCostTrend(rollover, 6);

    expect(series.map((p) => p.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });
});
