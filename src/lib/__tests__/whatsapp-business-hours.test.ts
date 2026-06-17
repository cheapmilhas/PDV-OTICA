import { describe, it, expect } from "vitest";
import { isWithinBusinessHours, spDayRange } from "@/lib/whatsapp-business-hours";

// Datas em UTC; 8h-18h BRT = 11h-21h UTC.
describe("isWithinBusinessHours", () => {
  it("dentro da janela (10h BRT seg) → true", () => {
    expect(isWithinBusinessHours(new Date("2026-06-15T13:00:00Z"))).toBe(true); // seg 10h BRT
  });
  it("antes das 8h BRT → false", () => {
    expect(isWithinBusinessHours(new Date("2026-06-15T10:59:00Z"))).toBe(false); // 7h59 BRT
  });
  it("depois das 18h BRT → false", () => {
    expect(isWithinBusinessHours(new Date("2026-06-15T21:01:00Z"))).toBe(false); // 18h01 BRT
  });
  it("domingo → false", () => {
    expect(isWithinBusinessHours(new Date("2026-06-14T13:00:00Z"))).toBe(false); // dom 10h BRT
  });
  it("feriado nacional fixo (25/12) → false", () => {
    expect(isWithinBusinessHours(new Date("2026-12-25T13:00:00Z"))).toBe(false);
  });

  // --- Fase 2: limites configuráveis (sem limites = comportamento idêntico) ---

  it("sábado é dia útil por padrão (skipSaturday default false)", () => {
    // 2026-06-13 é sábado; 10h BRT = 13:00Z
    expect(isWithinBusinessHours(new Date("2026-06-13T13:00:00Z"))).toBe(true);
  });

  it("skipSaturday=true → sábado vira false", () => {
    expect(isWithinBusinessHours(new Date("2026-06-13T13:00:00Z"), { skipSaturday: true })).toBe(false);
  });

  it("janela custom 9-17h: 8h BRT (antes da abertura custom) → false", () => {
    // 8h BRT = 11:00Z; com openHour 9 fica fora
    expect(isWithinBusinessHours(new Date("2026-06-15T11:00:00Z"), { openHour: 9, closeHour: 17 })).toBe(false);
  });

  it("janela custom 9-17h: 16h BRT → true; 17h BRT (fechamento exclusivo) → false", () => {
    expect(isWithinBusinessHours(new Date("2026-06-15T19:00:00Z"), { openHour: 9, closeHour: 17 })).toBe(true);  // 16h BRT
    expect(isWithinBusinessHours(new Date("2026-06-15T20:00:00Z"), { openHour: 9, closeHour: 17 })).toBe(false); // 17h BRT
  });

  it("janela estendida 8-20h: 19h BRT (fora do default, dentro do custom) → true", () => {
    expect(isWithinBusinessHours(new Date("2026-06-15T22:00:00Z"), { openHour: 8, closeHour: 20 })).toBe(true); // 19h BRT
  });
});

describe("spDayRange (dia civil em BRT, UTC-3)", () => {
  it("um instante às 10h BRT → janela 03:00Z do mesmo dia a 03:00Z do dia seguinte", () => {
    const { start, end } = spDayRange(new Date("2026-06-15T13:00:00Z")); // seg 10h BRT
    expect(start.toISOString()).toBe("2026-06-15T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-16T03:00:00.000Z");
  });
  it("23h BRT (já 02h UTC do dia seguinte) ainda cai no dia civil BRT correto", () => {
    // 2026-06-15 23:00 BRT = 2026-06-16 02:00 UTC → dia civil BRT = 15/06
    const { start } = spDayRange(new Date("2026-06-16T02:00:00Z"));
    expect(start.toISOString()).toBe("2026-06-15T03:00:00.000Z");
  });
});
