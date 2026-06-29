import { describe, it, expect } from "vitest";
import { computeIntentAccuracy, ACCURACY_MIN_SAMPLE } from "./intent-accuracy";

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
