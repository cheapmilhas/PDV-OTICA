import { describe, it, expect } from "vitest";
import { addSlaHours, isTerminalStatus, SLA_FALLBACK_HOURS } from "./support.service";

describe("addSlaHours", () => {
  it("soma horas corretamente à data base", () => {
    const base = new Date("2026-06-02T10:00:00.000Z");
    expect(addSlaHours(base, 4).toISOString()).toBe("2026-06-02T14:00:00.000Z");
    expect(addSlaHours(base, 24).toISOString()).toBe("2026-06-03T10:00:00.000Z");
  });

  it("não muta a data base", () => {
    const base = new Date("2026-06-02T10:00:00.000Z");
    addSlaHours(base, 48);
    expect(base.toISOString()).toBe("2026-06-02T10:00:00.000Z");
  });
});

describe("SLA_FALLBACK_HOURS", () => {
  it("define um deadline mais curto para prioridades maiores", () => {
    expect(SLA_FALLBACK_HOURS.URGENT).toBeLessThan(SLA_FALLBACK_HOURS.HIGH);
    expect(SLA_FALLBACK_HOURS.HIGH).toBeLessThan(SLA_FALLBACK_HOURS.MEDIUM);
    expect(SLA_FALLBACK_HOURS.MEDIUM).toBeLessThan(SLA_FALLBACK_HOURS.LOW);
  });
});

describe("isTerminalStatus", () => {
  it("RESOLVED e CLOSED são terminais (cliente não responde)", () => {
    expect(isTerminalStatus("RESOLVED")).toBe(true);
    expect(isTerminalStatus("CLOSED")).toBe(true);
  });

  it("OPEN, IN_PROGRESS e WAITING_CUSTOMER não são terminais", () => {
    expect(isTerminalStatus("OPEN")).toBe(false);
    expect(isTerminalStatus("IN_PROGRESS")).toBe(false);
    expect(isTerminalStatus("WAITING_CUSTOMER")).toBe(false);
  });
});
