import { describe, it, expect } from "vitest";
import { computeIntentAccuracy, computeIntentAccuracyByIntent, ACCURACY_MIN_SAMPLE } from "./intent-accuracy";

describe("computeIntentAccuracy — placar de acurácia da IA (Fase 3)", () => {
  it("conta acertos = predito igual ao atual (não corrigido ou corrigido p/ o mesmo)", () => {
    const r = computeIntentAccuracy([
      { intentPredicted: "NOVA_COMPRA", intent: "NOVA_COMPRA" }, // acerto
      { intentPredicted: "RENOVACAO", intent: "RECLAMACAO" },    // erro (corrigido)
      { intentPredicted: "ORCAMENTO_PRECO", intent: "ORCAMENTO_PRECO" }, // acerto
    ], 0); // minSample=0 p/ checar o cálculo cru
    expect(r.total).toBe(3);
    expect(r.correct).toBe(2);
    expect(r.rate).toBeCloseTo(2 / 3);
    expect(r.hasEnoughSample).toBe(true);
  });

  it("ignora leads sem palpite da IA (intentPredicted=null não conta)", () => {
    const r = computeIntentAccuracy([
      { intentPredicted: "NOVA_COMPRA", intent: "NOVA_COMPRA" },
      { intentPredicted: null, intent: "OUTRO" }, // criado manual — fora da amostra
    ], 0);
    expect(r.total).toBe(1);
    expect(r.correct).toBe(1);
  });

  it("ignora leads com intentPredicted mas intent ainda null (não classificado)", () => {
    const r = computeIntentAccuracy([
      { intentPredicted: "NOVA_COMPRA", intent: null },
    ], 0);
    expect(r.total).toBe(0);
  });

  it("hasEnoughSample=false quando abaixo do piso (não mostra '100%' com 1 caso)", () => {
    const r = computeIntentAccuracy([
      { intentPredicted: "NOVA_COMPRA", intent: "NOVA_COMPRA" },
    ]); // usa o piso padrão (>=20)
    expect(r.total).toBe(1);
    expect(r.hasEnoughSample).toBe(false);
  });

  it("hasEnoughSample=true ao atingir o piso padrão", () => {
    const rows = Array.from({ length: ACCURACY_MIN_SAMPLE }, () => ({
      intentPredicted: "NOVA_COMPRA",
      intent: "NOVA_COMPRA",
    }));
    const r = computeIntentAccuracy(rows);
    expect(r.total).toBe(ACCURACY_MIN_SAMPLE);
    expect(r.hasEnoughSample).toBe(true);
    expect(r.rate).toBe(1);
  });

  it("amostra vazia → rate 0 e sem amostra suficiente (sem divisão por zero)", () => {
    const r = computeIntentAccuracy([]);
    expect(r.total).toBe(0);
    expect(r.rate).toBe(0);
    expect(r.hasEnoughSample).toBe(false);
  });
});

describe("computeIntentAccuracyByIntent — acurácia por intenção (gold set)", () => {
  it("agrupa por intenção PREDITA e calcula acerto por grupo", () => {
    const rows = [
      { intentPredicted: "NOVA_COMPRA", intent: "NOVA_COMPRA" }, // acerto
      { intentPredicted: "NOVA_COMPRA", intent: "NOVA_COMPRA" }, // acerto
      { intentPredicted: "RENOVACAO", intent: "NOVA_COMPRA" },   // erro → confundiu c/ NOVA_COMPRA
      { intentPredicted: "RENOVACAO", intent: "RENOVACAO" },     // acerto
    ];
    const out = computeIntentAccuracyByIntent(rows, 0);
    const nova = out.find((o) => o.intent === "NOVA_COMPRA")!;
    const renov = out.find((o) => o.intent === "RENOVACAO")!;
    expect(nova.total).toBe(2);
    expect(nova.correct).toBe(2);
    expect(nova.rate).toBe(1);
    expect(renov.total).toBe(2);
    expect(renov.correct).toBe(1);
    expect(renov.rate).toBe(0.5);
  });

  it("topConfusion aponta o erro típico (p/ qual intenção X mais é corrigida)", () => {
    const rows = [
      { intentPredicted: "RENOVACAO", intent: "NOVA_COMPRA" },
      { intentPredicted: "RENOVACAO", intent: "NOVA_COMPRA" },
      { intentPredicted: "RENOVACAO", intent: "ORCAMENTO_PRECO" },
      { intentPredicted: "RENOVACAO", intent: "RENOVACAO" }, // acerto (não conta como confusão)
    ];
    const renov = computeIntentAccuracyByIntent(rows, 0).find((o) => o.intent === "RENOVACAO")!;
    expect(renov.topConfusion).toEqual({ intent: "NOVA_COMPRA", count: 2 });
  });

  it("sem confusão (sempre acerta) → topConfusion null", () => {
    const out = computeIntentAccuracyByIntent([
      { intentPredicted: "OUTRO", intent: "OUTRO" },
    ], 0);
    expect(out[0].topConfusion).toBeNull();
  });

  it("ordena: amostra suficiente primeiro, pior acurácia no topo", () => {
    const rows = [
      // RENOVACAO: 2 casos (abaixo do piso 3), 100%
      { intentPredicted: "RENOVACAO", intent: "RENOVACAO" },
      { intentPredicted: "RENOVACAO", intent: "RENOVACAO" },
      // NOVA_COMPRA: 3 casos (>=piso), 33%
      { intentPredicted: "NOVA_COMPRA", intent: "OUTRO" },
      { intentPredicted: "NOVA_COMPRA", intent: "OUTRO" },
      { intentPredicted: "NOVA_COMPRA", intent: "NOVA_COMPRA" },
      // ORCAMENTO: 3 casos (>=piso), 100%
      { intentPredicted: "ORCAMENTO_PRECO", intent: "ORCAMENTO_PRECO" },
      { intentPredicted: "ORCAMENTO_PRECO", intent: "ORCAMENTO_PRECO" },
      { intentPredicted: "ORCAMENTO_PRECO", intent: "ORCAMENTO_PRECO" },
    ];
    const out = computeIntentAccuracyByIntent(rows, 3);
    // com amostra: NOVA_COMPRA (33%) antes de ORCAMENTO (100%); RENOVACAO (sem amostra) por último
    expect(out[0].intent).toBe("NOVA_COMPRA");
    expect(out[1].intent).toBe("ORCAMENTO_PRECO");
    expect(out[2].intent).toBe("RENOVACAO");
    expect(out[2].hasEnoughSample).toBe(false);
  });

  it("ignora leads sem palpite ou sem verdade atual", () => {
    const out = computeIntentAccuracyByIntent([
      { intentPredicted: null, intent: "OUTRO" },
      { intentPredicted: "NOVA_COMPRA", intent: null },
      { intentPredicted: "NOVA_COMPRA", intent: "NOVA_COMPRA" },
    ], 0);
    expect(out).toHaveLength(1);
    expect(out[0].intent).toBe("NOVA_COMPRA");
    expect(out[0].total).toBe(1);
  });
});
