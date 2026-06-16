import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/prisma", () => ({
  prisma: {
    companySettings: { findUnique: vi.fn() },
    aiGlobalConfig: { findUnique: vi.fn() },
  },
}));
const { warnMock } = vi.hoisted(() => ({ warnMock: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ warn: warnMock }) } }));
import { prisma } from "@/lib/prisma";
import { getEffectiveMarkup } from "./ai-margin.service";

beforeEach(() => vi.clearAllMocks());

// Decimal-like: o Prisma Decimal real tem .toString(); reproduzo o shape.
const decimal = (v: string) => ({ toString: () => v });

describe("ai-margin.service getEffectiveMarkup", () => {
  it("usa o override da ótica quando presente (global é ignorado)", async () => {
    (prisma.companySettings.findUnique as any).mockResolvedValue({ markupPercentOverride: decimal("25.50") });
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue({ markupPercent: decimal("99") });
    expect(await getEffectiveMarkup("co-1")).toBe(25.5);
    // global não deve influenciar o resultado
    expect(prisma.aiGlobalConfig.findUnique).not.toHaveBeenCalled();
  });

  it("cai no global quando o override é null", async () => {
    (prisma.companySettings.findUnique as any).mockResolvedValue({ markupPercentOverride: null });
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue({ markupPercent: decimal("10") });
    expect(await getEffectiveMarkup("co-1")).toBe(10);
  });

  it("cai no global quando não existe linha de settings", async () => {
    (prisma.companySettings.findUnique as any).mockResolvedValue(null);
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue({ markupPercent: decimal("15") });
    expect(await getEffectiveMarkup("co-1")).toBe(15);
  });

  it("retorna 0 quando override e global estão ausentes", async () => {
    (prisma.companySettings.findUnique as any).mockResolvedValue({ markupPercentOverride: null });
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue(null);
    expect(await getEffectiveMarkup("co-1")).toBe(0);
  });

  it("fail-safe: retorna 0 e loga warn quando o prisma lança", async () => {
    (prisma.companySettings.findUnique as any).mockRejectedValue(new Error("db flake"));
    expect(await getEffectiveMarkup("co-1")).toBe(0);
    expect(warnMock).toHaveBeenCalled();
  });
});
