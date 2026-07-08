import { describe, it, expect } from "vitest";
import { cronMeta, frequencyLabelFor } from "./system-health-labels";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

describe("frequencyLabelFor", () => {
  it("usa o override quando presente", () => {
    expect(frequencyLabelFor(DAY, "1× por dia, de manhã")).toBe("1× por dia, de manhã");
  });
  it("deriva 1×/dia de DAY", () => {
    expect(frequencyLabelFor(DAY)).toMatch(/dia/);
  });
  it("deriva 'a cada hora' de HOUR", () => {
    expect(frequencyLabelFor(HOUR)).toMatch(/hora/);
  });
  it("deriva minutos de 5min", () => {
    expect(frequencyLabelFor(5 * MINUTE)).toMatch(/5 min/);
  });
});

describe("cronMeta — novos campos", () => {
  it("dunning tem ifStops preenchido", () => {
    expect(cronMeta("dunning").ifStops).toBeTruthy();
  });
  it("jobKey desconhecido: ifStops ausente (undefined), não quebra", () => {
    const m = cronMeta("inexistente-xyz");
    expect(m.label).toBe("inexistente-xyz");
    expect(m.ifStops).toBeUndefined();
  });
});
