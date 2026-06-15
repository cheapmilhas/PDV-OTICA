import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    companySettings: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
const getMonthlyUsageMock = vi.fn();
vi.mock("@/services/ai-usage.service", () => ({
  getMonthlyUsage: (...a: unknown[]) => getMonthlyUsageMock(...a),
}));

import { prisma } from "@/lib/prisma";
import { assertAiAllowed } from "./ai-guard";

beforeEach(() => {
  vi.clearAllMocks();
  getMonthlyUsageMock.mockResolvedValue({ totalTokens: 0, totalCostUsd: 0, byFeature: {} });
});

describe("assertAiAllowed", () => {
  it("bloqueia se iaAvailable=false (403)", async () => {
    (prisma.companySettings.findUnique as any).mockResolvedValue({ iaAvailable: false, iaEnabled: true, iaMonthlyTokenLimit: null });
    await expect(assertAiAllowed("co1")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("bloqueia se iaEnabled=false (403)", async () => {
    (prisma.companySettings.findUnique as any).mockResolvedValue({ iaAvailable: true, iaEnabled: false, iaMonthlyTokenLimit: null });
    await expect(assertAiAllowed("co1")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("bloqueia se uso do mês >= cota (400)", async () => {
    (prisma.companySettings.findUnique as any).mockResolvedValue({ iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: 1000 });
    getMonthlyUsageMock.mockResolvedValue({ totalTokens: 1000, totalCostUsd: 0.5, byFeature: {} });
    await expect(assertAiAllowed("co1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("permite se available+enabled e uso < cota (não lança)", async () => {
    (prisma.companySettings.findUnique as any).mockResolvedValue({ iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: 1000 });
    getMonthlyUsageMock.mockResolvedValue({ totalTokens: 500, totalCostUsd: 0.1, byFeature: {} });
    await expect(assertAiAllowed("co1")).resolves.toBeUndefined();
  });

  it("permite se cota null (ilimitado) e available+enabled", async () => {
    (prisma.companySettings.findUnique as any).mockResolvedValue({ iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: null });
    getMonthlyUsageMock.mockResolvedValue({ totalTokens: 9_999_999, totalCostUsd: 5, byFeature: {} });
    await expect(assertAiAllowed("co1")).resolves.toBeUndefined();
  });

  it("bloqueia se NÃO há CompanySettings (sem registro = IA indisponível, 403)", async () => {
    (prisma.companySettings.findUnique as any).mockResolvedValue(null);
    await expect(assertAiAllowed("co1")).rejects.toMatchObject({ statusCode: 403 });
  });
});
