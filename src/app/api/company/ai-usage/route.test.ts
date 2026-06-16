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

const getEffectiveMarkupMock = vi.fn();
vi.mock("@/services/ai-margin.service", () => ({
  getEffectiveMarkup: (...a: unknown[]) => getEffectiveMarkupMock(...a),
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
import { priceForCompany } from "@/lib/ai-pricing";
import { AppError, ERROR_CODES } from "@/lib/error-handler";

const mockFindUnique = vi.mocked(prisma.companySettings.findUnique);

const RATE = 5.5;
const MARKUP = 50;
const configFixture = { hasKey: true, usdBrlRate: RATE, markupPercent: 20, creditTokenFactor: 1000 };
const monthlyFixture = { totalTokens: 5000, totalCostUsd: 0.015, byFeature: {} };
const dailyFixture = [
  { date: "2026-06-01", tokens: 2000, costUsd: 0.006 },
  { date: "2026-06-02", tokens: 3000, costUsd: 0.009 },
];
const settingsFixture = { iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: 100000 };

/**
 * Forbidden keys that must NEVER appear anywhere in the response — they would
 * leak the real cost or the markup the ótica is being charged.
 */
const FORBIDDEN_KEYS = [
  "costUsd",
  "totalCostUsd",
  "markupPercent",
  "markupPercentOverride",
  "lucro",
  "lucroBrl",
] as const;

/** Recursively collect every object key found anywhere in a JSON value. */
function collectKeys(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      acc.add(k);
      collectKeys(v, acc);
    }
  }
  return acc;
}

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
    getEffectiveMarkupMock.mockResolvedValue(MARKUP);
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

  it("200 returns iaAvailable, iaEnabled, credits and R$ (margin embedded)", async () => {
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

    // priceBrl = total R$ this month, margin embedded
    // priceForCompany(0.015, 5.5, 50) = 0.015 * 5.5 * 1.5 = 0.12375
    expect(body.priceBrl).toBe(priceForCompany(0.015, RATE, MARKUP));
    expect(body.priceBrl).toBeCloseTo(0.12375, 6);
  });

  it("200 daily items carry credits + priceBrl (margin embedded), and ONLY date/credits/priceBrl", async () => {
    const res = await GET();
    const json = await res.json();
    const body = json.data;

    expect(body.daily).toHaveLength(2);

    expect(body.daily[0]).toEqual({
      date: "2026-06-01",
      credits: 2, // 2000 / 1000
      priceBrl: priceForCompany(0.006, RATE, MARKUP), // 0.006 * 5.5 * 1.5 = 0.0495
    });
    expect(body.daily[1]).toEqual({
      date: "2026-06-02",
      credits: 3, // 3000 / 1000
      priceBrl: priceForCompany(0.009, RATE, MARKUP), // 0.009 * 5.5 * 1.5 = 0.07425
    });

    // Each daily point exposes exactly these keys — no costUsd, no tokens
    for (const point of body.daily) {
      expect(Object.keys(point).sort()).toEqual(["credits", "date", "priceBrl"]);
    }
  });

  it("200 priceBrl follows the per-company effective markup (uses companyId)", async () => {
    getEffectiveMarkupMock.mockResolvedValue(0); // no markup -> just cost * rate
    const res = await GET();
    const json = await res.json();

    expect(getEffectiveMarkupMock).toHaveBeenCalledWith("c1");
    expect(json.data.priceBrl).toBe(priceForCompany(0.015, RATE, 0));
    expect(json.data.daily[0].priceBrl).toBe(priceForCompany(0.006, RATE, 0));
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

  it("CRITICAL (by-key): response must NEVER contain cost/markup/lucro keys, but MAY contain priceBrl", async () => {
    const res = await GET();
    const json = await res.json();

    const keys = collectKeys(json);

    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys.has(forbidden), `forbidden key leaked: ${forbidden}`).toBe(false);
    }

    // priceBrl is the legitimate, margin-embedded R$ the ótica pays
    expect(keys.has("priceBrl")).toBe(true);
  });

  it("CRITICAL (by-key): forbidden keys absent even when settings row not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await GET();
    const json = await res.json();

    const keys = collectKeys(json);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys.has(forbidden), `forbidden key leaked: ${forbidden}`).toBe(false);
    }
  });
});
