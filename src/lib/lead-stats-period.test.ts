import { describe, it, expect } from "vitest";
import { parseLeadStatsPeriod, periodToRange } from "./lead-stats-period";
import { startOfLocalDay } from "./date-utils";

describe("parseLeadStatsPeriod", () => {
  it("aceita presets válidos", () => {
    expect(parseLeadStatsPeriod("today")).toBe("today");
    expect(parseLeadStatsPeriod("7d")).toBe("7d");
    expect(parseLeadStatsPeriod("all")).toBe("all");
  });

  it("cai no padrão (30d) para valor desconhecido, null ou vazio", () => {
    expect(parseLeadStatsPeriod("xyz")).toBe("30d");
    expect(parseLeadStatsPeriod(null)).toBe("30d");
    expect(parseLeadStatsPeriod(undefined)).toBe("30d");
    expect(parseLeadStatsPeriod("")).toBe("30d");
  });
});

describe("periodToRange", () => {
  const NOW = new Date("2026-07-02T15:30:00Z");

  it("all = sem borda", () => {
    expect(periodToRange("all", NOW)).toEqual({});
  });

  it("today = início do dia NO FUSO DA ÓTICA (BRT), não do servidor", () => {
    const { from } = periodToRange("today", NOW);
    expect(from).toBeInstanceOf(Date);
    // NOW = 2026-07-02T15:30:00Z = 12:30 BRT → início do dia BRT = 2026-07-02T03:00:00Z.
    expect(from!.toISOString()).toBe("2026-07-02T03:00:00.000Z");
    // E casa com o helper canônico do projeto (independe do TZ do runner de teste).
    expect(from!.getTime()).toBe(startOfLocalDay(NOW).getTime());
  });

  it("30d = 30 dias antes de now", () => {
    const { from } = periodToRange("30d", NOW);
    expect(from!.getTime()).toBe(NOW.getTime() - 30 * 24 * 3600_000);
  });

  it("nunca retorna 'to' (janela aberta até agora)", () => {
    expect(periodToRange("7d", NOW)).not.toHaveProperty("to");
    expect(periodToRange("90d", NOW)).not.toHaveProperty("to");
  });
});
