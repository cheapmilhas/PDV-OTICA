import { describe, expect, it } from "vitest";
import {
  decideObligationRecalc,
  keepDecision,
  KEEP_DECISION_PREFIX,
  type ContractChange,
  type ObligationForRecalc,
} from "@/lib/obligation-recalc";

/**
 * Testes da decisão PURA "o contrato mudou — o que fazer com a obrigação?"
 * (Task 9 do Plano B; spec §4.1.2 e §4.1.3).
 *
 * O foco não é cobertura de linha: é travar as decisões que, se invertidas,
 * cobram duas vezes no gateway sem sandbox ou param de cobrar em silêncio.
 */

const PLANO_ANTIGO = "plan-basico";
const PLANO_NOVO = "plan-pro";

/** Período de outubro, o que a emissão antecipada materializa no fim de setembro. */
const PERIODO_START = new Date("2026-10-04T00:00:00Z");
const PERIODO_END = new Date("2026-11-04T00:00:00Z");

function obligation(over: Partial<ObligationForRecalc> = {}): ObligationForRecalc {
  return {
    id: "obl-1",
    state: "PLANNED",
    disposition: "CHARGE",
    planId: PLANO_ANTIGO,
    periodStart: PERIODO_START,
    periodEnd: PERIODO_END,
    ...over,
  };
}

const TROCA_DE_PLANO: ContractChange = {
  kind: "plan_change",
  fromPlanId: PLANO_ANTIGO,
  toPlanId: PLANO_NOVO,
};

describe("decideObligationRecalc — troca de plano (§4.1.2)", () => {
  it("obrigação PLANNED é recalculada", () => {
    const decision = decideObligationRecalc({
      obligation: obligation(),
      change: TROCA_DE_PLANO,
    });

    expect(decision.action).toBe("recalculate");
  });

  it("🚨 obrigação ISSUED NÃO é recalculada — é mantida com decisão registrada", () => {
    // O caso do dinheiro. A cobrança já existe no Asaas com PIX vivo; recalcular
    // aqui mudaria o registro contábil sem mudar a cobrança do cliente, e anular
    // + reemitir geraria uma SEGUNDA cobrança real do mesmo período.
    const decision = decideObligationRecalc({
      obligation: obligation({ state: "ISSUED" }),
      change: TROCA_DE_PLANO,
    });

    expect(decision.action).toBe("keep_and_alert");
    if (decision.action !== "keep_and_alert") throw new Error("ramo errado");
    // O motivo tem que nomear os DOIS planos: é o que o operador precisa para
    // decidir se cancela no gateway ou cobra a diferença.
    expect(decision.voidReason).toContain(PLANO_ANTIGO);
    expect(decision.voidReason).toContain(PLANO_NOVO);
    // E tem que ser distinguível de uma anulação real na leitura da Task 10.
    expect(decision.voidReason.startsWith(KEEP_DECISION_PREFIX)).toBe(true);
  });

  it("obrigação PAID não é tocada", () => {
    const decision = decideObligationRecalc({
      obligation: obligation({ state: "PAID" }),
      change: TROCA_DE_PLANO,
    });

    expect(decision).toEqual({ action: "noop", reason: "settled" });
  });

  it("obrigação VOID não é tocada", () => {
    // Ressuscitar linha morta faria o pagamento cair sobre período anulado —
    // o caso que `decideObligationPromotion` trata como incidente.
    const decision = decideObligationRecalc({
      obligation: obligation({ state: "VOID" }),
      change: TROCA_DE_PLANO,
    });

    expect(decision).toEqual({ action: "noop", reason: "settled" });
  });

  it.each(["COURTESY", "INTERNAL", "LEGACY_WAIVED"] as const)(
    "obrigação %s (isenta) não é recalculada — isenta PLANNED trava a assinatura",
    (disposition) => {
      // Achado real da revisão da Task 5: uma isenta em PLANNED faz o motor
      // devolver `settled` a cada rodada, sem cobrar e SEM ALERTAR ninguém. Este
      // módulo nunca pode produzir nem manter esse estado.
      const decision = decideObligationRecalc({
        obligation: obligation({ disposition, state: "PLANNED" }),
        change: TROCA_DE_PLANO,
      });

      expect(decision).toEqual({ action: "noop", reason: "not_chargeable" });
    },
  );

  it("obrigação que JÁ está no plano-alvo é noop (dois cliques na mesma troca)", () => {
    const decision = decideObligationRecalc({
      obligation: obligation({ planId: PLANO_NOVO }),
      change: TROCA_DE_PLANO,
    });

    expect(decision).toEqual({ action: "noop", reason: "same_plan" });
  });

  it("ISSUED já no plano-alvo NÃO gera alerta (ruído treina o operador a ignorar)", () => {
    const decision = decideObligationRecalc({
      obligation: obligation({ state: "ISSUED", planId: PLANO_NOVO }),
      change: TROCA_DE_PLANO,
    });

    expect(decision.action).toBe("noop");
  });

  it("downgrade é tratado igual a upgrade — o painel permite os dois", () => {
    // O self-service do Domus recusa downgrade com 501, mas a rota do admin não.
    // Um downgrade sobre obrigação emitida é o caso em que o cliente paga o plano
    // CARO por um período em que já está no barato: precisa aparecer.
    const decision = decideObligationRecalc({
      obligation: obligation({ state: "ISSUED", planId: PLANO_NOVO }),
      change: { kind: "plan_change", fromPlanId: PLANO_NOVO, toPlanId: PLANO_ANTIGO },
    });

    expect(decision.action).toBe("keep_and_alert");
  });
});

describe("decideObligationRecalc — extensão de trial (§4.1.3)", () => {
  /** Trial acabava em 04/10 (início do período) e foi empurrado 7 dias. */
  const ESTENDE_SOBRE_O_PERIODO: ContractChange = {
    kind: "trial_extension",
    oldTrialEndsAt: new Date("2026-10-04T00:00:00Z"),
    newTrialEndsAt: new Date("2026-10-11T00:00:00Z"),
  };

  it("PLANNED cujo período ganhou dias grátis é recalculada", () => {
    const decision = decideObligationRecalc({
      obligation: obligation(),
      change: ESTENDE_SOBRE_O_PERIODO,
    });

    expect(decision.action).toBe("recalculate");
  });

  it("🚨 ISSUED cujo período ganhou dias grátis é MANTIDA com decisão registrada", () => {
    const decision = decideObligationRecalc({
      obligation: obligation({ state: "ISSUED" }),
      change: ESTENDE_SOBRE_O_PERIODO,
    });

    expect(decision.action).toBe("keep_and_alert");
    if (decision.action !== "keep_and_alert") throw new Error("ramo errado");
    expect(decision.voidReason.startsWith(KEEP_DECISION_PREFIX)).toBe(true);
    expect(decision.voidReason).toContain("trial");
  });

  it("período que começa DEPOIS do novo fim do trial não é afetado", () => {
    // Este é o primeiro período REALMENTE pago depois da extensão: cobrá-lo é o
    // comportamento correto, não um bug.
    const decision = decideObligationRecalc({
      obligation: obligation({
        periodStart: new Date("2026-11-04T00:00:00Z"),
        periodEnd: new Date("2026-12-04T00:00:00Z"),
      }),
      change: ESTENDE_SOBRE_O_PERIODO,
    });

    expect(decision).toEqual({ action: "noop", reason: "period_not_affected" });
  });

  it("fronteira: período que COMEÇA exatamente no novo fim do trial não é afetado", () => {
    // Semiaberto `[start, end)`, coerente com billing-clock e periodsOverlap. Se
    // esta fronteira fosse inclusiva, a obrigação legítima do primeiro período
    // pago seria invalidada a cada extensão.
    const decision = decideObligationRecalc({
      obligation: obligation({
        periodStart: new Date("2026-10-11T00:00:00Z"),
        periodEnd: new Date("2026-11-11T00:00:00Z"),
      }),
      change: ESTENDE_SOBRE_O_PERIODO,
    });

    expect(decision).toEqual({ action: "noop", reason: "period_not_affected" });
  });

  it("fronteira: período que TERMINA exatamente onde o trial antigo acabava não é afetado", () => {
    // Setembro `[04/09, 04/10)` com trial antigo terminando em 04/10: nenhum dia
    // desse período voltou a ser gratuito.
    const decision = decideObligationRecalc({
      obligation: obligation({
        periodStart: new Date("2026-09-04T00:00:00Z"),
        periodEnd: new Date("2026-10-04T00:00:00Z"),
      }),
      change: ESTENDE_SOBRE_O_PERIODO,
    });

    expect(decision).toEqual({ action: "noop", reason: "period_not_affected" });
  });

  it("período que só ENCOSTA na faixa por um dia É afetado", () => {
    // `[03/10, 03/11)` contra a faixa grátis `[04/10, 11/10)`: um dia de
    // interseção já é um dia cobrado que voltou a ser grátis.
    const decision = decideObligationRecalc({
      obligation: obligation({
        periodStart: new Date("2026-10-03T00:00:00Z"),
        periodEnd: new Date("2026-11-03T00:00:00Z"),
      }),
      change: ESTENDE_SOBRE_O_PERIODO,
    });

    expect(decision.action).toBe("recalculate");
  });

  it("trial que ANDA PARA TRÁS não é extensão — ninguém ganhou dia grátis", () => {
    const decision = decideObligationRecalc({
      obligation: obligation(),
      change: {
        kind: "trial_extension",
        oldTrialEndsAt: new Date("2026-10-11T00:00:00Z"),
        newTrialEndsAt: new Date("2026-10-04T00:00:00Z"),
      },
    });

    expect(decision).toEqual({ action: "noop", reason: "period_not_affected" });
  });

  it("🔥 trial PARA TRÁS com período que ENVOLVE a faixa invertida ainda é noop", () => {
    // Achado por MUTAÇÃO: sem a guarda de faixa invertida, o caso acima passava
    // por acidente (a comparação `periodStart < freeUntil` já dava `false`), mas
    // ESTE não. Período `[01/10, 01/11)` com o trial recuando de 11/10 para
    // 04/10: `periodStart(01/10) < freeUntil(04/10)` é `true` E
    // `freeFrom(11/10) < periodEnd(01/11)` é `true`, então a interseção sozinha
    // diria "afetada" — e uma obrigação legítima seria invalidada (ou uma já
    // emitida geraria alerta) por uma mudança em que ninguém ganhou um dia
    // gratuito sequer.
    //
    // O caso é real: `extend_trial` soma 7 dias a `trialEndsAt`, mas o campo é
    // escrito por vários caminhos e nada garante que o valor lido antes seja
    // menor que o gravado depois.
    const decision = decideObligationRecalc({
      obligation: obligation({
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-11-01T00:00:00Z"),
      }),
      change: {
        kind: "trial_extension",
        oldTrialEndsAt: new Date("2026-10-11T00:00:00Z"),
        newTrialEndsAt: new Date("2026-10-04T00:00:00Z"),
      },
    });

    expect(decision).toEqual({ action: "noop", reason: "period_not_affected" });
  });

  it("mesmo período, mesma faixa, mas trial PARA FRENTE: aí sim é afetada", () => {
    // Controle do teste acima: a única diferença é o SENTIDO da mudança. Sem
    // este par, um teste que apenas devolvesse `noop` sempre passaria.
    const decision = decideObligationRecalc({
      obligation: obligation({
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-11-01T00:00:00Z"),
      }),
      change: {
        kind: "trial_extension",
        oldTrialEndsAt: new Date("2026-10-04T00:00:00Z"),
        newTrialEndsAt: new Date("2026-10-11T00:00:00Z"),
      },
    });

    expect(decision.action).toBe("recalculate");
  });

  it("fim de trial ANTIGO nulo é fail-CLOSED: a faixa vira tudo até o novo fim", () => {
    // Sem saber onde o trial terminava não dá para saber quais dias viraram
    // grátis. Tratar como "não afetada" deixaria passar exatamente o caso da
    // §4.1.3.
    const decision = decideObligationRecalc({
      obligation: obligation(),
      change: {
        kind: "trial_extension",
        oldTrialEndsAt: null,
        newTrialEndsAt: new Date("2026-10-11T00:00:00Z"),
      },
    });

    expect(decision.action).toBe("recalculate");
  });

  it("isenta não é tocada nem por extensão de trial", () => {
    const decision = decideObligationRecalc({
      obligation: obligation({ disposition: "COURTESY", state: "PLANNED" }),
      change: ESTENDE_SOBRE_O_PERIODO,
    });

    expect(decision).toEqual({ action: "noop", reason: "not_chargeable" });
  });

  it.each([
    ["newTrialEndsAt", { oldTrialEndsAt: PERIODO_START, newTrialEndsAt: new Date("x") }],
    ["oldTrialEndsAt", { oldTrialEndsAt: new Date("x"), newTrialEndsAt: PERIODO_END }],
  ])("data inválida em %s falha ALTO em vez de virar isenção silenciosa", (_campo, datas) => {
    // Com NaN toda comparação vira `false`, a interseção diria "não afetada" e a
    // extensão passaria batida — o defeito desta task reaparecendo por dentro
    // dela. Mesma guarda de billing-clock/billing-courtesy/billing-obligation.
    expect(() =>
      decideObligationRecalc({
        obligation: obligation(),
        change: { kind: "trial_extension", ...datas },
      }),
    ).toThrow(/obligation-recalc/);
  });

  it("período com data inválida na obrigação falha ALTO", () => {
    expect(() =>
      decideObligationRecalc({
        obligation: obligation({ periodEnd: new Date("nao-e-data") }),
        change: ESTENDE_SOBRE_O_PERIODO,
      }),
    ).toThrow(/obligation-recalc/);
  });
});

describe("keepDecision", () => {
  it("prefixa para que 'mantida' nunca seja lida como 'anulada'", () => {
    // O campo se chama `voidReason` e a obrigação NÃO é anulada. Sem o prefixo, a
    // tela da Task 10 leria a linha ao contrário.
    expect(keepDecision("troca de plano")).toBe("MANTIDA: troca de plano");
    expect(keepDecision("x").startsWith(KEEP_DECISION_PREFIX)).toBe(true);
  });
});
