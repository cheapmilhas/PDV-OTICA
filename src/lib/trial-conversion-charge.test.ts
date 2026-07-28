import { describe, expect, it } from "vitest";

import {
  decideOnExistingCharge,
  resolveConversionPeriod,
  resolveConversionPriceCents,
  trialConversionSource,
} from "@/lib/trial-conversion-charge";

const NOW = new Date("2026-08-01T12:00:00Z");

describe("resolveConversionPeriod", () => {
  it("em TRIAL: o período pago começa quando o trial ACABA", () => {
    // Cobrar a partir de "agora" faria o cliente pagar por dias de teste que
    // já são dele — quem antecipa seria punido por antecipar.
    const trialEndsAt = new Date("2026-08-07T11:01:20Z");
    const p = resolveConversionPeriod({
      status: "TRIAL",
      trialEndsAt,
      billingCycle: "MONTHLY",
      now: NOW,
    });

    expect(p.periodStart).toEqual(trialEndsAt);
    expect(p.periodEnd).toEqual(new Date("2026-09-07T11:01:20Z"));
  });

  it("TRIAL_EXPIRED: começa AGORA, não na data em que expirou", () => {
    // O tempo bloqueado não é serviço prestado.
    const p = resolveConversionPeriod({
      status: "TRIAL_EXPIRED",
      trialEndsAt: new Date("2026-07-01T00:00:00Z"),
      billingCycle: "MONTHLY",
      now: NOW,
    });

    expect(p.periodStart).toEqual(NOW);
    expect(p.periodEnd).toEqual(new Date("2026-09-01T12:00:00Z"));
  });

  it("trial cuja data já passou é tratado como expirado, mesmo com status TRIAL", () => {
    const p = resolveConversionPeriod({
      status: "TRIAL",
      trialEndsAt: new Date("2026-07-20T00:00:00Z"),
      billingCycle: "MONTHLY",
      now: NOW,
    });

    expect(p.periodStart).toEqual(NOW);
  });

  it("YEARLY avança um ANO de calendário (não 12x30 dias)", () => {
    const p = resolveConversionPeriod({
      status: "TRIAL_EXPIRED",
      trialEndsAt: null,
      billingCycle: "YEARLY",
      now: NOW,
    });

    expect(p.periodEnd).toEqual(new Date("2027-08-01T12:00:00Z"));
  });
});

describe("resolveConversionPriceCents", () => {
  const base = {
    priceMonthly: 18990,
    priceYearly: 189900,
    discountPercent: null,
    discountExpiresAt: null,
    now: NOW,
  };

  it("usa o preço do ciclo contratado", () => {
    expect(resolveConversionPriceCents({ ...base, billingCycle: "MONTHLY" })).toBe(18990);
    expect(resolveConversionPriceCents({ ...base, billingCycle: "YEARLY" })).toBe(189900);
  });

  it("aplica desconto VIGENTE, arredondando a favor do cliente", () => {
    const v = resolveConversionPriceCents({
      ...base,
      billingCycle: "MONTHLY",
      discountPercent: 10,
      discountExpiresAt: new Date("2026-12-01T00:00:00Z"),
    });
    expect(v).toBe(17091);
  });

  it("IGNORA desconto expirado — cobrar a menos sairia do bolso do operador", () => {
    const v = resolveConversionPriceCents({
      ...base,
      billingCycle: "MONTHLY",
      discountPercent: 50,
      discountExpiresAt: new Date("2026-07-01T00:00:00Z"),
    });
    expect(v).toBe(18990);
  });

  it("desconto sem validade é permanente (vigente)", () => {
    const v = resolveConversionPriceCents({
      ...base,
      billingCycle: "MONTHLY",
      discountPercent: 50,
      discountExpiresAt: null,
    });
    expect(v).toBe(9495);
  });

  it("preço zero ou negativo FALHA — não emite cobrança de R$ 0", () => {
    // O plano "Interno — Domus" tem priceMonthly = 0 em produção: sem esta
    // guarda, tentaríamos criar uma cobrança de R$ 0 no gateway.
    expect(() =>
      resolveConversionPriceCents({ ...base, billingCycle: "MONTHLY", priceMonthly: 0 }),
    ).toThrow(/inválido/);
  });

  it("desconto de 100% FALHA em vez de liberar de graça", () => {
    expect(() =>
      resolveConversionPriceCents({
        ...base,
        billingCycle: "MONTHLY",
        discountPercent: 100,
        discountExpiresAt: null,
      }),
    ).toThrow();
  });
});

describe("decideOnExistingCharge", () => {
  it("PENDING/OVERDUE → REUSA (dois cliques não geram duas cobranças)", () => {
    expect(decideOnExistingCharge("PENDING")).toEqual({ action: "reuse" });
    expect(decideOnExistingCharge("OVERDUE")).toEqual({ action: "reuse" });
  });

  it("PAID → já pago, não cobra de novo", () => {
    expect(decideOnExistingCharge("PAID")).toEqual({ action: "already_paid" });
  });

  it("CANCELED/REFUNDED → revisão humana, nunca emite por cima", () => {
    expect(decideOnExistingCharge("CANCELED").action).toBe("needs_review");
    expect(decideOnExistingCharge("REFUNDED").action).toBe("needs_review");
  });
});

describe("trialConversionSource", () => {
  it("é estável por assinatura (é a chave de idempotência)", () => {
    expect(trialConversionSource("sub-1")).toBe("medical-trial-conversion:sub-1");
    expect(trialConversionSource("sub-1")).toBe(trialConversionSource("sub-1"));
    expect(trialConversionSource("sub-2")).not.toBe(trialConversionSource("sub-1"));
  });
});
