import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth-helpers BEFORE imports
const requireAuthMock = vi.fn();
const getCompanyIdMock = vi.fn();
const requirePermissionMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: (...a: unknown[]) => requireAuthMock(...a),
  getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a),
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}));

// Mock services
const getAiConfigMock = vi.fn();
vi.mock("@/services/ai-config.service", () => ({
  getAiConfig: (...a: unknown[]) => getAiConfigMock(...a),
}));

const getMonthlyUsageMock = vi.fn();
const getDailyUsageMock = vi.fn();
vi.mock("@/services/ai-usage.service", () => ({
  getMonthlyUsage: (...a: unknown[]) => getMonthlyUsageMock(...a),
  getDailyUsage: (...a: unknown[]) => getDailyUsageMock(...a),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    companySettings: {
      findUnique: vi.fn(),
    },
  },
}));

import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import { AppError, ERROR_CODES } from "@/lib/error-handler";

const mockFindUnique = vi.mocked(prisma.companySettings.findUnique);

const configFixture = { hasKey: true, usdBrlRate: 5.5, markupPercent: 20, creditTokenFactor: 1000 };
const monthlyFixture = { totalTokens: 5000, totalCostUsd: 0.015, byFeature: {} };
const dailyFixture = [
  { date: "2026-06-01", tokens: 2000, costUsd: 0.006 },
  { date: "2026-06-02", tokens: 3000, costUsd: 0.009 },
];
const settingsFixture = { iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: 100000 };

function makeRequest() {
  return new Request("http://localhost/api/company/ai-usage", { method: "GET" });
}

describe("GET /api/company/ai-usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ user: { id: "u1", companyId: "c1" } });
    getCompanyIdMock.mockResolvedValue("c1");
    requirePermissionMock.mockResolvedValue(undefined);
    getAiConfigMock.mockResolvedValue(configFixture);
    getMonthlyUsageMock.mockResolvedValue(monthlyFixture);
    getDailyUsageMock.mockResolvedValue(dailyFixture);
    mockFindUnique.mockResolvedValue(settingsFixture as never);
  });

  it("401 when requireAuth throws unauthorized", async () => {
    requireAuthMock.mockRejectedValue(new AppError(ERROR_CODES.UNAUTHORIZED, "não autenticado", 401));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("403 when requirePermission throws forbidden", async () => {
    requirePermissionMock.mockRejectedValue(new AppError(ERROR_CODES.FORBIDDEN, "sem permissão", 403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("200 returns iaAvailable, iaEnabled, creditsUsed, creditsLimit, daily in credits", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    const body = json.data;

    expect(body.iaAvailable).toBe(true);
    expect(body.iaEnabled).toBe(true);

    // credits = tokens / creditTokenFactor
    // creditsUsed = 5000 / 1000 = 5
    expect(body.creditsUsed).toBe(5);
    // creditsLimit = 100000 / 1000 = 100
    expect(body.creditsLimit).toBe(100);

    // daily mapped to credits (no costUsd field)
    expect(body.daily).toHaveLength(2);
    expect(body.daily[0]).toEqual({ date: "2026-06-01", credits: 2 });
    expect(body.daily[1]).toEqual({ date: "2026-06-02", credits: 3 });
    expect(body.daily[0]).not.toHaveProperty("costUsd");
    expect(body.daily[0]).not.toHaveProperty("tokens");
  });

  it("200 creditsLimit is null when iaMonthlyTokenLimit is null", async () => {
    mockFindUnique.mockResolvedValue({ iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: null } as never);
    const res = await GET();
    const json = await res.json();
    expect(json.data.creditsLimit).toBeNull();
  });

  it("200 defaults when settings row not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await GET();
    const json = await res.json();
    expect(json.data.iaAvailable).toBe(false);
    expect(json.data.iaEnabled).toBe(false);
    expect(json.data.creditsLimit).toBeNull();
  });

  it("CRITICAL: response JSON must contain NO cost/USD/BRL/R$ fields anywhere", async () => {
    const res = await GET();
    const body = await res.text();
    // Recursive assertion: no monetary field must leak through
    expect(body).not.toMatch(/usd|brl|cost|R\$/i);
  });

  it("CRITICAL: daily items must not have costUsd or tokens fields (only date+credits)", async () => {
    const res = await GET();
    const json = await res.json();
    for (const point of json.data.daily) {
      expect(Object.keys(point)).toEqual(["date", "credits"]);
    }
  });
});
