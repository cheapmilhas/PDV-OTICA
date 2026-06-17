import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testa a resolução das travas anti-bloqueio do WhatsApp:
 * override da ótica (se != null) → global (se existir) → default hardcoded.
 * Fail-safe: erro de banco → defaults (nunca quebra, nunca muda sozinho).
 */

const settingsFindUnique = vi.fn();
const globalFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    companySettings: { findUnique: (...a: unknown[]) => settingsFindUnique(...a) },
    whatsappGlobalConfig: { findUnique: (...a: unknown[]) => globalFindUnique(...a) },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}));

import { getWhatsappLimits, DEFAULT_WA_LIMITS } from "@/services/whatsapp-limits.service";

describe("getWhatsappLimits", () => {
  beforeEach(() => {
    settingsFindUnique.mockReset().mockResolvedValue(null);
    globalFindUnique.mockReset().mockResolvedValue(null);
  });

  it("sem config nenhuma → defaults hardcoded (comportamento idêntico ao da Fase 1)", async () => {
    const r = await getWhatsappLimits("co1");
    expect(r).toEqual(DEFAULT_WA_LIMITS);
    expect(r.openHour).toBe(8);
    expect(r.closeHour).toBe(18);
    expect(r.dailyCap).toBe(50);
    expect(r.skipSaturday).toBe(false);
    expect(r.staleMin).toBe(10);
  });

  it("global existe (sem override da ótica) → usa o global", async () => {
    globalFindUnique.mockResolvedValue({ openHour: 9, closeHour: 17, dailyCap: 30, skipSaturday: true, staleMin: 15 });
    const r = await getWhatsappLimits("co1");
    expect(r).toEqual({ openHour: 9, closeHour: 17, dailyCap: 30, skipSaturday: true, staleMin: 15 });
  });

  it("override da ótica vence o global, campo a campo", async () => {
    globalFindUnique.mockResolvedValue({ openHour: 9, closeHour: 17, dailyCap: 30, skipSaturday: true, staleMin: 15 });
    settingsFindUnique.mockResolvedValue({
      waOpenHourOverride: 7,
      waCloseHourOverride: null, // null → cai no global (17)
      waDailyCapOverride: 100,
      waSkipSaturdayOverride: null, // null → cai no global (true)
    });
    const r = await getWhatsappLimits("co1");
    expect(r.openHour).toBe(7);        // override
    expect(r.closeHour).toBe(17);      // global (override null)
    expect(r.dailyCap).toBe(100);      // override
    expect(r.skipSaturday).toBe(true); // global (override null)
    expect(r.staleMin).toBe(15);       // global (sem override de stale)
  });

  it("override da ótica com global ausente → override vence o default", async () => {
    settingsFindUnique.mockResolvedValue({
      waOpenHourOverride: 6,
      waCloseHourOverride: null,
      waDailyCapOverride: null,
      waSkipSaturdayOverride: true,
    });
    const r = await getWhatsappLimits("co1");
    expect(r.openHour).toBe(6);          // override
    expect(r.closeHour).toBe(18);        // default (sem global, sem override)
    expect(r.dailyCap).toBe(50);         // default
    expect(r.skipSaturday).toBe(true);   // override
  });

  it("skipSaturday=false no override é respeitado (não confundir false com null)", async () => {
    globalFindUnique.mockResolvedValue({ openHour: 8, closeHour: 18, dailyCap: 50, skipSaturday: true, staleMin: 10 });
    settingsFindUnique.mockResolvedValue({
      waOpenHourOverride: null, waCloseHourOverride: null, waDailyCapOverride: null,
      waSkipSaturdayOverride: false, // explicitamente false → vence o global true
    });
    const r = await getWhatsappLimits("co1");
    expect(r.skipSaturday).toBe(false);
  });

  it("fail-safe: erro de banco → defaults (nunca quebra)", async () => {
    globalFindUnique.mockRejectedValue(new Error("db down"));
    const r = await getWhatsappLimits("co1");
    expect(r).toEqual(DEFAULT_WA_LIMITS);
  });
});
