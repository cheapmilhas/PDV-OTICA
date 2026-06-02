import { describe, it, expect } from "vitest";
import { initialSubscriptionState } from "./checkout-status";

const now = new Date("2026-01-10T12:00:00Z");
const dueDate = new Date("2026-01-11T00:00:00Z");

describe("initialSubscriptionState", () => {
  it("CREDIT_CARD → ACTIVE imediato com activatedAt", () => {
    const s = initialSubscriptionState({ billingType: "CREDIT_CARD", billingCycle: "MONTHLY", now, dueDate });
    expect(s.status).toBe("ACTIVE");
    expect(s.activatedAt).toEqual(now);
    expect(s.trialEndsAt).toBeNull();
  });
  it("BOLETO → TRIAL, sem activatedAt, trialEndsAt = vencimento + 5 dias", () => {
    const s = initialSubscriptionState({ billingType: "BOLETO", billingCycle: "MONTHLY", now, dueDate });
    expect(s.status).toBe("TRIAL");
    expect(s.activatedAt).toBeNull();
    const expected = new Date(dueDate);
    expected.setDate(expected.getDate() + 5);
    expect(s.trialEndsAt).toEqual(expected);
  });
  it("PIX → TRIAL (mesmo tratamento de BOLETO)", () => {
    const s = initialSubscriptionState({ billingType: "PIX", billingCycle: "MONTHLY", now, dueDate });
    expect(s.status).toBe("TRIAL");
    expect(s.activatedAt).toBeNull();
  });
  it("currentPeriodEnd MENSAL = now + 1 mês", () => {
    const s = initialSubscriptionState({ billingType: "CREDIT_CARD", billingCycle: "MONTHLY", now, dueDate });
    const expected = new Date(now); expected.setMonth(expected.getMonth() + 1);
    expect(s.currentPeriodEnd).toEqual(expected);
  });
  it("currentPeriodEnd ANUAL = now + 1 ano", () => {
    const s = initialSubscriptionState({ billingType: "CREDIT_CARD", billingCycle: "YEARLY", now, dueDate });
    const expected = new Date(now); expected.setFullYear(expected.getFullYear() + 1);
    expect(s.currentPeriodEnd).toEqual(expected);
  });
});
