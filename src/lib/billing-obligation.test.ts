import { describe, expect, it } from "vitest";
import {
  periodsOverlap,
  resolveNextObligationPlan,
  resolveObligationPriceCents,
} from "@/lib/billing-obligation";

const NOW = new Date("2026-09-01T12:00:00Z");
const LEAD = 5;

function plan(over: Partial<Parameters<typeof resolveNextObligationPlan>[0]> = {}) {
  return resolveNextObligationPlan({
    lastObligation: null,
    maxSequence: null,
    firstPeriodStart: null,
    cycle: "MONTHLY",
    now: NOW,
    issueLeadDays: LEAD,
    ...over,
  });
}

describe("resolveNextObligationPlan — âncora inicial", () => {
  it("sem histórico e SEM âncora explícita exige bootstrap (não inventa data)", () => {
    // `currentPeriodEnd` é escrito por sete caminhos e nenhum significa "pagou
    // até aqui" — `mark_paid` confirma pagamento à mão e nem o avança. Inferir
    // aqui cobraria de novo um período já pago.
    expect(plan()).toEqual({ kind: "needs_bootstrap" });
  });

  it("sem histórico e COM âncora explícita cria a sequence 1 começando na âncora", () => {
    const r = plan({ firstPeriodStart: new Date("2026-09-03T00:00:00Z") });

    expect(r).toEqual({
      kind: "plan",
      sequence: 1,
      periodStart: new Date("2026-09-03T00:00:00Z"),
      periodEnd: new Date("2026-10-03T00:00:00Z"),
    });
  });

  it("primeiro período usa a MESMA regra de fim de mês do encadeamento", () => {
    // 31/01 + 1 mês = 28/02 (clampeado), nunca 03/03 como `setMonth` cru faria.
    const r = plan({
      now: new Date("2026-01-30T00:00:00Z"),
      firstPeriodStart: new Date("2026-01-31T00:00:00Z"),
    });

    expect(r).toMatchObject({
      kind: "plan",
      periodEnd: new Date("2026-02-28T00:00:00Z"),
    });
  });
});

describe("resolveNextObligationPlan — encadeamento", () => {
  it("encadeia do FIM do período anterior, nunca de agora", () => {
    // Se usasse `now` (01/09), o período começaria em 01/09 e o cliente perderia
    // os dias entre 05/09 e 01/09 — deriva de calendário a cada rodada do cron.
    const r = plan({
      lastObligation: { sequence: 1, periodEnd: new Date("2026-09-05T00:00:00Z") },
      maxSequence: 1,
    });

    expect(r).toEqual({
      kind: "plan",
      sequence: 2,
      periodStart: new Date("2026-09-05T00:00:00Z"),
      periodEnd: new Date("2026-10-05T00:00:00Z"),
    });
  });

  it("ciclo ANUAL avança 12 meses, não 1", () => {
    const r = plan({
      cycle: "YEARLY",
      lastObligation: { sequence: 3, periodEnd: new Date("2026-09-02T00:00:00Z") },
      maxSequence: 3,
    });

    expect(r).toMatchObject({
      kind: "plan",
      periodEnd: new Date("2027-09-02T00:00:00Z"),
    });
  });
});

describe("resolveNextObligationPlan — HORIZONTE (anti-avalanche)", () => {
  it("período que começa além do horizonte NÃO é materializado", () => {
    // 🔑 Sem esta regra o cron cria uma obrigação POR DIA: hoje nasce a 1, amanhã
    // a 2 (porque já existe uma anterior), e em um mês a assinatura tem ANOS de
    // períodos futuros com preço congelado numa data arbitrária.
    const r = plan({
      lastObligation: { sequence: 1, periodEnd: new Date("2026-10-05T00:00:00Z") },
      maxSequence: 1,
    });

    expect(r).toEqual({
      kind: "outside_horizon",
      periodStart: new Date("2026-10-05T00:00:00Z"),
    });
  });

  it("período dentro do horizonte (a menos de issueLeadDays) É materializado", () => {
    const r = plan({
      lastObligation: { sequence: 1, periodEnd: new Date("2026-09-06T00:00:00Z") },
      maxSequence: 1,
    });

    expect(r).toMatchObject({ kind: "plan", sequence: 2 });
  });

  it("período JÁ vencido (começou no passado) é materializado — backlog não é ignorado", () => {
    const r = plan({
      lastObligation: { sequence: 1, periodEnd: new Date("2026-07-01T00:00:00Z") },
      maxSequence: 1,
    });

    expect(r).toMatchObject({ kind: "plan", sequence: 2 });
  });

  it("a fronteira do horizonte é INCLUSIVA (exatamente no limite ainda entra)", () => {
    const r = plan({
      lastObligation: {
        sequence: 1,
        periodEnd: new Date(NOW.getTime() + LEAD * 86_400_000),
      },
      maxSequence: 1,
    });

    expect(r).toMatchObject({ kind: "plan" });
  });
});

describe("resolveNextObligationPlan — sequence contra obrigação anulada", () => {
  it("conta do maior sequence INCLUINDO as anuladas (número contábil não recicla)", () => {
    // A anulada 4 continua ocupando o número: a unique (subscriptionId, sequence)
    // vale para ela também. Reusar o 4 colidiria em P2002 a cada rodada, pra sempre.
    const r = plan({
      lastObligation: { sequence: 3, periodEnd: new Date("2026-09-04T00:00:00Z") },
      maxSequence: 4,
    });

    expect(r).toMatchObject({ kind: "plan", sequence: 5 });
  });

  it("a ÂNCORA de período vem da última não-anulada, mesmo com sequence maior anulada", () => {
    const r = plan({
      lastObligation: { sequence: 3, periodEnd: new Date("2026-09-04T00:00:00Z") },
      maxSequence: 9,
    });

    expect(r).toMatchObject({
      kind: "plan",
      sequence: 10,
      periodStart: new Date("2026-09-04T00:00:00Z"),
    });
  });
});

describe("resolveNextObligationPlan — dado corrompido falha alto", () => {
  it("periodEnd anterior inválido LANÇA (não vira período NaN)", () => {
    expect(() =>
      plan({
        lastObligation: { sequence: 1, periodEnd: new Date("nada") },
        maxSequence: 1,
      }),
    ).toThrow();
  });

  it("âncora inicial inválida LANÇA", () => {
    expect(() => plan({ firstPeriodStart: new Date("nada") })).toThrow();
  });
});

describe("resolveObligationPriceCents", () => {
  const base = {
    cycle: "MONTHLY" as const,
    priceMonthly: 18990,
    priceYearly: 189900,
    discountPercent: null,
    discountExpiresAt: null,
    now: NOW,
  };

  it("INTERNAL vale 0 (e não estoura no preço zero do plano interno)", () => {
    expect(
      resolveObligationPriceCents({
        ...base,
        disposition: "INTERNAL",
        priceMonthly: 0,
        priceYearly: 0,
      }),
    ).toBe(0);
  });

  it("INTERNAL vale 0 mesmo com plano MEIO cadastrado (mensal 0, anual positivo)", () => {
    // Não é hipótese: nada no schema garante que `priceMonthly = 0` implique
    // `priceYearly = 0`. `resolveObligationDisposition` olha só o mensal, então
    // este plano é classificado INTERNAL — e o schema exige `priceCents = 0` em
    // INTERNAL, senão a conta interna do dono entraria na receita não faturada.
    expect(
      resolveObligationPriceCents({
        ...base,
        disposition: "INTERNAL",
        priceMonthly: 0,
        priceYearly: 299900,
      }),
    ).toBe(0);
  });

  it("INTERNAL vale 0 mesmo no ciclo ANUAL de plano meio cadastrado", () => {
    expect(
      resolveObligationPriceCents({
        ...base,
        disposition: "INTERNAL",
        cycle: "YEARLY",
        priceMonthly: 0,
        priceYearly: 299900,
      }),
    ).toBe(0);
  });

  it("COURTESY grava o preço CHEIO, SEM aplicar desconto (é receita não faturada)", () => {
    // Aplicar o desconto aqui subdeclararia a concessão: a tela que soma
    // "quanto de cortesia eu dei" mostraria menos do que se deixou de faturar.
    expect(
      resolveObligationPriceCents({
        ...base,
        disposition: "COURTESY",
        discountPercent: 50,
      }),
    ).toBe(18990);
  });

  it("COURTESY no ciclo ANUAL usa o preço anual cheio", () => {
    expect(
      resolveObligationPriceCents({ ...base, disposition: "COURTESY", cycle: "YEARLY" }),
    ).toBe(189900);
  });

  it("CHARGE aplica o desconto vigente (é o que o cliente paga de verdade)", () => {
    expect(
      resolveObligationPriceCents({
        ...base,
        disposition: "CHARGE",
        discountPercent: 10,
        discountExpiresAt: new Date("2026-12-01T00:00:00Z"),
      }),
    ).toBe(17091);
  });

  it("CHARGE ignora desconto EXPIRADO (cobrar a menos sairia do bolso do dono)", () => {
    expect(
      resolveObligationPriceCents({
        ...base,
        disposition: "CHARGE",
        discountPercent: 10,
        discountExpiresAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toBe(18990);
  });

  it("CHARGE no ciclo ANUAL cobra o anual, não o mensal", () => {
    expect(
      resolveObligationPriceCents({ ...base, disposition: "CHARGE", cycle: "YEARLY" }),
    ).toBe(189900);
  });

  it("CHARGE com preço zero LANÇA em vez de emitir cobrança de R$ 0", () => {
    expect(() =>
      resolveObligationPriceCents({
        ...base,
        disposition: "CHARGE",
        priceMonthly: 0,
        priceYearly: 0,
      }),
    ).toThrow();
  });

  it("LEGACY_WAIVED não é emissível pelo motor (é escrita de bootstrap)", () => {
    expect(() =>
      resolveObligationPriceCents({ ...base, disposition: "LEGACY_WAIVED" }),
    ).toThrow(/não emissível/);
  });
});

describe("periodsOverlap", () => {
  const set = { periodStart: new Date("2026-09-01T00:00:00Z"), periodEnd: new Date("2026-10-01T00:00:00Z") };

  it("período IDÊNTICO se sobrepõe", () => {
    expect(periodsOverlap(set, set)).toBe(true);
  });

  it("período ADJACENTE não se sobrepõe (é o encadeamento normal da sequência)", () => {
    // Fronteira exclusiva: tratar isto como conflito faria o motor recusar toda
    // obrigação legítima.
    expect(
      periodsOverlap(set, {
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-11-01T00:00:00Z"),
      }),
    ).toBe(false);
  });

  it("sobreposição PARCIAL é detectada (o caso da conversão de trial)", () => {
    expect(
      periodsOverlap(set, {
        periodStart: new Date("2026-09-15T00:00:00Z"),
        periodEnd: new Date("2026-10-15T00:00:00Z"),
      }),
    ).toBe(true);
  });

  it("período CONTIDO é detectado", () => {
    expect(
      periodsOverlap(set, {
        periodStart: new Date("2026-09-10T00:00:00Z"),
        periodEnd: new Date("2026-09-20T00:00:00Z"),
      }),
    ).toBe(true);
  });

  it("período totalmente ANTERIOR não se sobrepõe", () => {
    expect(
      periodsOverlap(set, {
        periodStart: new Date("2026-07-01T00:00:00Z"),
        periodEnd: new Date("2026-08-01T00:00:00Z"),
      }),
    ).toBe(false);
  });

  it("data inválida LANÇA em vez de responder `false` (que liberaria a cobrança)", () => {
    expect(() =>
      periodsOverlap(set, { periodStart: new Date("nada"), periodEnd: new Date("nada") }),
    ).toThrow();
  });

  it("intervalo INVERTIDO LANÇA (senão liberaria segunda cobrança do mesmo mês)", () => {
    // Fatura legada com os campos trocados: a comparação normal devolveria
    // `false` ("não se sobrepõe") e a guarda de cobrança dupla deixaria passar.
    expect(() =>
      periodsOverlap(set, {
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-09-01T00:00:00Z"),
      }),
    ).toThrow(/intervalo inválido/);
  });

  it("intervalo VAZIO (fim == início) LANÇA", () => {
    expect(() =>
      periodsOverlap(set, {
        periodStart: new Date("2026-09-15T00:00:00Z"),
        periodEnd: new Date("2026-09-15T00:00:00Z"),
      }),
    ).toThrow(/intervalo inválido/);
  });
});
