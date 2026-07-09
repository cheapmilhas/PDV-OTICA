import { describe, it, expect, vi, beforeEach } from "vitest";

const aiTokenUsageFindFirst = vi.fn();
const companySettingsFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiTokenUsage: { findFirst: (...a: unknown[]) => aiTokenUsageFindFirst(...a) },
    companySettings: { findFirst: (...a: unknown[]) => companySettingsFindFirst(...a) },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}));

import { summarizeAiQualification } from "./system-health.service";

const NOW = new Date("2026-07-08T12:00:00.000Z");

describe("summarizeAiQualification", () => {
  beforeEach(() => {
    aiTokenUsageFindFirst.mockReset();
    companySettingsFindFirst.mockReset();
  });

  it("sem nenhuma ótica com IA ligada → unknown (cinza), sem alarme", async () => {
    companySettingsFindFirst.mockResolvedValue(null);
    aiTokenUsageFindFirst.mockResolvedValue(null);
    const s = await summarizeAiQualification(NOW);
    expect(s.key).toBe("ai");
    expect(s.state).toBe("unknown");
  });

  it("IA ligada + nunca qualificou (null) → critical", async () => {
    companySettingsFindFirst.mockResolvedValue({ companyId: "c1" });
    aiTokenUsageFindFirst.mockResolvedValue(null);
    const s = await summarizeAiQualification(NOW);
    expect(s.state).toBe("critical");
  });

  it("IA ligada + última há 30h → critical (menciona a data)", async () => {
    companySettingsFindFirst.mockResolvedValue({ companyId: "c1" });
    aiTokenUsageFindFirst.mockResolvedValue({ createdAt: new Date("2026-07-07T06:00:00.000Z") });
    const s = await summarizeAiQualification(NOW);
    expect(s.state).toBe("critical");
    expect(s.detail).toMatch(/desde/);
  });

  it("IA ligada + última há 2h → healthy", async () => {
    companySettingsFindFirst.mockResolvedValue({ companyId: "c1" });
    aiTokenUsageFindFirst.mockResolvedValue({ createdAt: new Date("2026-07-08T10:00:00.000Z") });
    const s = await summarizeAiQualification(NOW);
    expect(s.state).toBe("healthy");
  });

  it("fail-safe: erro de leitura → unknown (não derruba o snapshot)", async () => {
    companySettingsFindFirst.mockRejectedValue(new Error("db down"));
    const s = await summarizeAiQualification(NOW);
    expect(s.state).toBe("unknown");
  });
});
