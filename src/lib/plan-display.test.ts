import { describe, it, expect } from "vitest";
import { formatPlanPrice, isComingSoon } from "./plan-display";

describe("formatPlanPrice", () => {
  it("converte centavos → reais formatado (espaço normal, não NBSP)", () => {
    expect(formatPlanPrice(14990)).toBe("R$ 149,90");
    expect(formatPlanPrice(18990)).toBe("R$ 189,90");
  });
  it("retorna null quando não há preço (0) — plano Em breve sem valor", () => {
    expect(formatPlanPrice(0)).toBeNull();
    expect(formatPlanPrice(null)).toBeNull();
  });
});

describe("isComingSoon", () => {
  it("true quando status COMING_SOON", () => {
    expect(isComingSoon({ status: "COMING_SOON" })).toBe(true);
  });
  it("false quando ACTIVE ou ausente", () => {
    expect(isComingSoon({ status: "ACTIVE" })).toBe(false);
    expect(isComingSoon({})).toBe(false);
  });
});
