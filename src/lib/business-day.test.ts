import { describe, it, expect } from "vitest";
import { nextBusinessDay } from "./business-day";

describe("nextBusinessDay", () => {
  it("sábado vira segunda", () => {
    // 2026-07-11 é sábado
    const out = nextBusinessDay(new Date("2026-07-11T12:00:00Z"));
    expect(out.getUTCDay()).toBe(1); // segunda
    expect(out.toISOString().slice(0, 10)).toBe("2026-07-13");
  });
  it("domingo vira segunda", () => {
    const out = nextBusinessDay(new Date("2026-07-12T12:00:00Z")); // domingo
    expect(out.toISOString().slice(0, 10)).toBe("2026-07-13");
  });
  it("dia útil inalterado", () => {
    const out = nextBusinessDay(new Date("2026-07-10T12:00:00Z")); // sexta
    expect(out.toISOString().slice(0, 10)).toBe("2026-07-10");
  });
});
