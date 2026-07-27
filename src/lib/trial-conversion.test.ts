/**
 * N4 — conversão de trial. Testes da lógica PURA.
 *
 * Cada bloco aqui trava um DEFEITO REAL encontrado no painel adversarial ou no
 * challenge do Codex (2026-07-27). Não são casos hipotéticos: são as formas
 * conhecidas de esta métrica mentir.
 */
import { describe, it, expect } from "vitest";

import {
  isTrialConversion,
  isTrialEligible,
  computeTrialConversion,
  daysUntil,
  type SubscriptionForTrial,
} from "./trial-conversion";

/** Helper: assinatura mínima, sobrescrevendo só o que o caso testa. */
function sub(over: Partial<SubscriptionForTrial> = {}): SubscriptionForTrial {
  return {
    id: "s1",
    companyId: "c1",
    trialStartedAt: new Date("2026-06-01T12:00:00Z"),
    trialEndsAt: new Date("2026-06-15T12:00:00Z"),
    activatedAt: null,
    ...over,
  };
}

const NOW = new Date("2026-07-01T12:00:00Z");

describe("isTrialConversion — quem entra no NUMERADOR", () => {
  it("conta quem teve trial e ativou", () => {
    expect(
      isTrialConversion(sub({ activatedAt: new Date("2026-06-10T12:00:00Z") }))
    ).toBe(true);
  });

  it("NÃO conta quem ativou sem nunca ter tido trial", () => {
    // 🔥 DEFEITO REAL: checkout-status.ts:35 grava activatedAt em signup de
    // CARTÃO, que nasce ACTIVE com trialStartedAt null. Contar isso infla a
    // taxa — justamente o número que esta entrega existe para produzir.
    expect(
      isTrialConversion(
        sub({ trialStartedAt: null, trialEndsAt: null, activatedAt: new Date("2026-06-10T12:00:00Z") })
      )
    ).toBe(false);
  });

  it("NÃO conta trial que nunca ativou", () => {
    expect(isTrialConversion(sub({ activatedAt: null }))).toBe(false);
  });

  it("NÃO conta ativação ANTERIOR ao início do trial (dado incoerente)", () => {
    // Ativar antes de começar o trial não é conversão daquele trial. Deixar
    // passar produziria tempo-até-converter NEGATIVO na média.
    expect(
      isTrialConversion(
        sub({
          trialStartedAt: new Date("2026-06-10T12:00:00Z"),
          activatedAt: new Date("2026-06-01T12:00:00Z"),
        })
      )
    ).toBe(false);
  });
});

describe("isTrialEligible — quem entra no DENOMINADOR", () => {
  it("conta quem converteu, mesmo com trial ainda correndo", () => {
    // Converteu antes de o trial acabar: é resultado fechado, entra.
    expect(
      isTrialEligible(
        sub({
          trialEndsAt: new Date("2026-08-01T12:00:00Z"),
          activatedAt: new Date("2026-06-10T12:00:00Z"),
        }),
        NOW
      )
    ).toBe(true);
  });

  it("conta trial que já terminou sem converter (perdido)", () => {
    expect(isTrialEligible(sub({ trialEndsAt: new Date("2026-06-15T12:00:00Z") }), NOW)).toBe(true);
  });

  it("NÃO conta trial AINDA EM ANDAMENTO que não converteu", () => {
    // 🔥 DEFEITO REAL: incluir trial em andamento derruba a taxa a cada signup
    // novo — o cliente ainda nem teve chance de converter.
    expect(
      isTrialEligible(sub({ trialEndsAt: new Date("2026-08-01T12:00:00Z") }), NOW)
    ).toBe(false);
  });

  it("NÃO conta quem nunca teve trial", () => {
    expect(isTrialEligible(sub({ trialStartedAt: null, trialEndsAt: null }), NOW)).toBe(false);
  });

  it("trata trial sem data de fim como ainda em andamento (não elegível)", () => {
    expect(isTrialEligible(sub({ trialEndsAt: null }), NOW)).toBe(false);
  });
});

describe("computeTrialConversion", () => {
  it("calcula a taxa sobre os elegíveis, não sobre todos", () => {
    const r = computeTrialConversion(
      [
        sub({ id: "a", activatedAt: new Date("2026-06-05T12:00:00Z") }), // converteu
        sub({ id: "b" }), // trial terminou, não converteu
        sub({ id: "c", trialEndsAt: new Date("2026-08-01T12:00:00Z") }), // em andamento → fora
      ],
      NOW
    );
    expect(r.converted).toBe(1);
    expect(r.eligible).toBe(2);
    expect(r.rate).toBeCloseTo(0.5);
    expect(r.inProgress).toBe(1);
  });

  it("rate é null (não 0) quando não há elegível — desconhecido ≠ zero", () => {
    // Mostrar "0% de conversão" sem nenhum trial fechado é mentira: não houve
    // nada para converter. A UI precisa distinguir "ninguém converteu" de
    // "ainda não dá para saber".
    const r = computeTrialConversion([sub({ trialEndsAt: new Date("2026-08-01T12:00:00Z") })], NOW);
    expect(r.eligible).toBe(0);
    expect(r.rate).toBeNull();
  });

  it("ignora assinatura sem trial no cálculo inteiro", () => {
    const r = computeTrialConversion(
      [sub({ trialStartedAt: null, trialEndsAt: null, activatedAt: new Date("2026-06-10T12:00:00Z") })],
      NOW
    );
    expect(r.converted).toBe(0);
    expect(r.eligible).toBe(0);
    expect(r.rate).toBeNull();
  });

  it("tempo médio até converter usa só quem converteu, em dias", () => {
    const r = computeTrialConversion(
      [
        sub({
          id: "a",
          trialStartedAt: new Date("2026-06-01T00:00:00Z"),
          activatedAt: new Date("2026-06-03T00:00:00Z"), // 2 dias
        }),
        sub({
          id: "b",
          trialStartedAt: new Date("2026-06-01T00:00:00Z"),
          activatedAt: new Date("2026-06-05T00:00:00Z"), // 4 dias
        }),
        sub({ id: "c" }), // não converteu → não entra na média
      ],
      NOW
    );
    expect(r.avgDaysToConvert).toBeCloseTo(3);
  });

  it("média é null quando ninguém converteu", () => {
    const r = computeTrialConversion([sub()], NOW);
    expect(r.avgDaysToConvert).toBeNull();
  });

  it("conversão CANCELADA depois continua sendo conversão histórica", () => {
    // O status ATUAL não filtra: quem converteu e depois cancelou converteu.
    // Filtrar por status apagaria conversões reais do histórico.
    const r = computeTrialConversion(
      [sub({ activatedAt: new Date("2026-06-05T12:00:00Z") })],
      NOW
    );
    expect(r.converted).toBe(1);
  });

  it("conta por ASSINATURA, não por empresa (decisão do dono 2026-07-27)", () => {
    // Mesma empresa, dois trials: o primeiro falhou, o segundo converteu.
    // Por empresa isso seria "1 conversão" e esconderia a tentativa perdida.
    const r = computeTrialConversion(
      [
        sub({ id: "a", companyId: "mesma" }), // falhou
        sub({ id: "b", companyId: "mesma", activatedAt: new Date("2026-06-10T12:00:00Z") }),
      ],
      NOW
    );
    expect(r.eligible).toBe(2);
    expect(r.converted).toBe(1);
    expect(r.rate).toBeCloseTo(0.5);
  });
});

describe("corte de coorte — o que impede a taxa de mentir com dado legado", () => {
  const CORTE = new Date("2026-07-27T00:00:00Z");

  it("exclui trial INICIADO antes do corte e conta quantos ficaram de fora", () => {
    // 🔥 DEFEITO REAL (achado pelo Codex): `trialEndsAt` SOBREVIVE à expiração —
    // os dois caminhos que expiram trial só mudam `status`. Sem corte, todo
    // trial antigo entraria na conta. E como conversão manual por fatura não
    // gravava activatedAt antes desta entrega, entrariam TODOS como perda.
    const r = computeTrialConversion(
      [
        sub({ id: "velho", trialStartedAt: new Date("2026-05-01T12:00:00Z"), trialEndsAt: new Date("2026-05-15T12:00:00Z") }),
        sub({ id: "novo", trialStartedAt: new Date("2026-07-28T12:00:00Z"), trialEndsAt: new Date("2026-08-11T12:00:00Z"), activatedAt: new Date("2026-07-30T12:00:00Z") }),
      ],
      new Date("2026-08-20T12:00:00Z"),
      CORTE
    );
    expect(r.excludedLegacy).toBe(1);
    expect(r.eligible).toBe(1);
    expect(r.converted).toBe(1);
    expect(r.rate).toBe(1); // sem o corte seria 50% — perda falsa do trial velho
  });

  it("o trial legado NÃO entra em nenhum balde (nem elegível, nem em andamento)", () => {
    const r = computeTrialConversion(
      [sub({ trialStartedAt: new Date("2026-01-01T12:00:00Z"), trialEndsAt: new Date("2026-01-15T12:00:00Z") })],
      NOW,
      CORTE
    );
    expect(r.excludedLegacy).toBe(1);
    expect(r.eligible).toBe(0);
    expect(r.inProgress).toBe(0);
    expect(r.rate).toBeNull();
  });

  it("sem corte informado, conta o histórico inteiro (comportamento de teste)", () => {
    const r = computeTrialConversion(
      [sub({ trialStartedAt: new Date("2026-01-01T12:00:00Z"), trialEndsAt: new Date("2026-01-15T12:00:00Z") })],
      NOW
    );
    expect(r.excludedLegacy).toBe(0);
    expect(r.eligible).toBe(1);
  });

  it("trial que começa EXATAMENTE no corte entra (fronteira inclusiva)", () => {
    const r = computeTrialConversion(
      [sub({ trialStartedAt: CORTE, trialEndsAt: new Date("2026-08-10T12:00:00Z") })],
      new Date("2026-08-20T12:00:00Z"),
      CORTE
    );
    expect(r.excludedLegacy).toBe(0);
    expect(r.eligible).toBe(1);
  });
});

describe("daysUntil — a coluna 'expira em'", () => {
  it("conta dias inteiros restantes", () => {
    expect(daysUntil(new Date("2026-07-04T12:00:00Z"), NOW)).toBe(3);
  });

  it("é 0 no dia em que expira", () => {
    expect(daysUntil(new Date("2026-07-01T20:00:00Z"), NOW)).toBe(0);
  });

  it("é negativo depois de vencido", () => {
    expect(daysUntil(new Date("2026-06-29T12:00:00Z"), NOW)).toBe(-2);
  });

  it("null quando não há data", () => {
    expect(daysUntil(null, NOW)).toBeNull();
  });
});
