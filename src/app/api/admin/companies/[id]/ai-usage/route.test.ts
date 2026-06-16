import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
  requireCompanyScope: vi.fn(),
}));
vi.mock("@/services/ai-config.service", () => ({
  getAiConfig: vi.fn(),
}));
vi.mock("@/services/ai-usage.service", () => ({
  getMonthlyUsage: vi.fn(),
  getDailyUsage: vi.fn(),
}));
vi.mock("@/services/ai-margin.service", () => ({
  getEffectiveMarkup: vi.fn(),
}));
// ai-pricing: usdToBrl mocked; priceForCompany runs unmocked (pure fn) for real math.
vi.mock("@/lib/ai-pricing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-pricing")>();
  return { ...actual, usdToBrl: vi.fn() };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    companySettings: {
      findUnique: vi.fn(),
    },
  },
}));

import { GET } from "./route";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { getAiConfig } from "@/services/ai-config.service";
import { getMonthlyUsage, getDailyUsage } from "@/services/ai-usage.service";
import { getEffectiveMarkup } from "@/services/ai-margin.service";
import { usdToBrl } from "@/lib/ai-pricing";
import { prisma } from "@/lib/prisma";

const mockGetAdminSession = vi.mocked(getAdminSession);
const mockRequireCompanyScope = vi.mocked(requireCompanyScope);
const mockGetAiConfig = vi.mocked(getAiConfig);
const mockGetMonthlyUsage = vi.mocked(getMonthlyUsage);
const mockGetDailyUsage = vi.mocked(getDailyUsage);
const mockGetEffectiveMarkup = vi.mocked(getEffectiveMarkup);
const mockUsdToBrl = vi.mocked(usdToBrl);
const mockFindUnique = vi.mocked(prisma.companySettings.findUnique);

const adminPayload = { id: "admin-1", email: "a@a.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true };
const scopedAdmin = { id: "admin-1", role: "SUPER_ADMIN" };

const configFixture = {
  hasKey: true,
  usdBrlRate: 5.5,
  markupPercent: 20,
  creditTokenFactor: 1000,
  qualifierModel: "claude-haiku-4-5",
  hasOpenaiKey: false,
};

const monthlyFixture = {
  totalTokens: 10000,
  totalCostUsd: 0.05,
  byFeature: { lead_qualify: { tokens: 10000, costUsd: 0.05 } },
};

const dailyFixture = [
  { date: "2026-06-01", tokens: 5000, costUsd: 0.025 },
  { date: "2026-06-02", tokens: 5000, costUsd: 0.025 },
];

const settingsFixture = {
  iaAvailable: true,
  iaEnabled: true,
  iaMonthlyTokenLimit: 100000,
};

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makeGetRequest() {
  return new Request("http://localhost/api/admin/companies/c1/ai-usage", { method: "GET" });
}

describe("GET /api/admin/companies/[id]/ai-usage", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockRequireCompanyScope.mockReset();
    mockGetAiConfig.mockReset();
    mockGetMonthlyUsage.mockReset();
    mockGetDailyUsage.mockReset();
    mockGetEffectiveMarkup.mockReset();
    mockUsdToBrl.mockReset();
    mockFindUnique.mockReset();
  });

  it("401 when getAdminSession returns null", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), makeParams("c1"));
    expect(res.status).toBe(401);
    expect(mockGetMonthlyUsage).not.toHaveBeenCalled();
  });

  it("403 when requireCompanyScope returns null", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockRequireCompanyScope.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), makeParams("c1"));
    expect(res.status).toBe(403);
    expect(mockGetMonthlyUsage).not.toHaveBeenCalled();
  });

  it("200 expõe os 4 números (custo real, margem efetiva, preço, lucro) com margem por empresa", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockRequireCompanyScope.mockResolvedValue(scopedAdmin);
    mockGetAiConfig.mockResolvedValue(configFixture);
    mockGetMonthlyUsage.mockResolvedValue(monthlyFixture);
    mockGetDailyUsage.mockResolvedValue(dailyFixture);
    // Margem efetiva por empresa = 50 (override), NÃO o markup global (20) da config.
    mockGetEffectiveMarkup.mockResolvedValue(50);
    // usdToBrl(0.05, 5.5) = 0.275 (custo real em R$, sem margem).
    mockUsdToBrl.mockReturnValue(0.275);
    mockFindUnique.mockResolvedValue(settingsFixture as never);

    const res = await GET(makeGetRequest(), makeParams("c1"));
    expect(res.status).toBe(200);

    expect(mockGetEffectiveMarkup).toHaveBeenCalledWith("c1");
    expect(mockUsdToBrl).toHaveBeenCalledWith(monthlyFixture.totalCostUsd, configFixture.usdBrlRate);

    const json = await res.json();
    expect(json.data).toMatchObject({
      usage: monthlyFixture,
      daily: dailyFixture,
      creditTokenFactor: configFixture.creditTokenFactor,
      settings: settingsFixture,
    });
    // Não expõe mais o campo legado costBrl.
    expect(json.data).not.toHaveProperty("costBrl");
    // costBrlReal = usdToBrl(0.05, 5.5) = 0.275 (sem margem)
    expect(json.data.costBrlReal).toBeCloseTo(0.275, 6);
    // markupPercent = margem efetiva por empresa
    expect(json.data.markupPercent).toBe(50);
    // priceBrl = priceForCompany(0.05, 5.5, 50) = 0.05*5.5*1.5 = 0.4125
    expect(json.data.priceBrl).toBeCloseTo(0.4125, 6);
    // lucroBrl = priceBrl - costBrlReal = 0.4125 - 0.275 = 0.1375
    expect(json.data.lucroBrl).toBeCloseTo(0.1375, 6);
  });

  it("200 lucroBrl negativo quando a margem efetiva é subsídio (negativa)", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockRequireCompanyScope.mockResolvedValue(scopedAdmin);
    mockGetAiConfig.mockResolvedValue(configFixture);
    mockGetMonthlyUsage.mockResolvedValue(monthlyFixture);
    mockGetDailyUsage.mockResolvedValue(dailyFixture);
    // Subsídio: margem -50 → preço abaixo do custo real.
    mockGetEffectiveMarkup.mockResolvedValue(-50);
    mockUsdToBrl.mockReturnValue(0.275);
    mockFindUnique.mockResolvedValue(settingsFixture as never);

    const res = await GET(makeGetRequest(), makeParams("c1"));
    expect(res.status).toBe(200);

    const json = await res.json();
    // priceBrl = priceForCompany(0.05, 5.5, -50) = 0.05*5.5*0.5 = 0.1375
    expect(json.data.priceBrl).toBeCloseTo(0.1375, 6);
    // lucroBrl = 0.1375 - 0.275 = -0.1375 (subsídio)
    expect(json.data.lucroBrl).toBeCloseTo(-0.1375, 6);
  });

  it("200 calls services with companyId from params", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockRequireCompanyScope.mockResolvedValue(scopedAdmin);
    mockGetAiConfig.mockResolvedValue(configFixture);
    mockGetMonthlyUsage.mockResolvedValue(monthlyFixture);
    mockGetDailyUsage.mockResolvedValue(dailyFixture);
    mockGetEffectiveMarkup.mockResolvedValue(20);
    mockUsdToBrl.mockReturnValue(0.275);
    mockFindUnique.mockResolvedValue(settingsFixture as never);

    await GET(makeGetRequest(), makeParams("company-xyz"));

    expect(mockGetMonthlyUsage).toHaveBeenCalledWith("company-xyz");
    expect(mockGetDailyUsage).toHaveBeenCalledWith("company-xyz");
    expect(mockGetEffectiveMarkup).toHaveBeenCalledWith("company-xyz");
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: "company-xyz" } })
    );
  });
});
