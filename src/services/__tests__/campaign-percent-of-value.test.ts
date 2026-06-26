import { describe, it, expect } from "vitest";
import { calculateBonus } from "@/services/product-campaign.service";

/**
 * Campanha — tipo "% do valor" (PERCENT_OF_VALUE) — Comissão Fase 2 / Passo 2.
 *
 * Duas provas:
 *  1. O tipo NOVO calcula certo: bonusPercent × valor vendido, desde a 1ª unidade,
 *     sem mínimo.
 *  2. ⭐ NÃO-REGRESSÃO: os 5 tipos EXISTENTES calculam IDÊNTICO ao de antes —
 *     adicionar o tipo novo (e o 3º parâmetro opcional eligibleValue) não mudou
 *     o cálculo de nenhum tipo atual. Como não havia teste de calculateBonus,
 *     estes casos fixam o comportamento atual (snapshot de regressão).
 */

describe("calculateBonus — PERCENT_OF_VALUE (tipo novo)", () => {
  it("10% sobre R$ 1.000 vendidos = R$ 100", () => {
    const r = calculateBonus(
      { bonusType: "PERCENT_OF_VALUE", countMode: "BY_QUANTITY", bonusPercent: 10 },
      5, // quantidade (não afeta o valor do bônus neste tipo)
      1000 // valor vendido dos itens elegíveis
    );
    expect(r.bonusAmount).toBe(100);
  });

  it("rende desde a 1ª unidade (1 item de R$ 300, 5% = R$ 15) — SEM mínimo", () => {
    const r = calculateBonus(
      { bonusType: "PERCENT_OF_VALUE", countMode: "BY_QUANTITY", bonusPercent: 5 },
      1, // uma única unidade
      300
    );
    expect(r.bonusAmount).toBe(15);
  });

  it("precisão decimal.js: 7,5% de R$ 333,33 = R$ 25,00 (HALF_UP, sem drift)", () => {
    const r = calculateBonus(
      { bonusType: "PERCENT_OF_VALUE", countMode: "BY_QUANTITY", bonusPercent: 7.5 },
      3,
      333.33
    );
    // 333.33 * 7.5 / 100 = 24.99975 → 25.00
    expect(r.bonusAmount).toBe(25);
  });

  it("valor vendido zero → bônus zero", () => {
    const r = calculateBonus(
      { bonusType: "PERCENT_OF_VALUE", countMode: "BY_QUANTITY", bonusPercent: 10 },
      4,
      0
    );
    expect(r.bonusAmount).toBe(0);
  });

  it("bonusPercent ausente → 0 (falha fechada, não quebra)", () => {
    const r = calculateBonus(
      { bonusType: "PERCENT_OF_VALUE", countMode: "BY_QUANTITY" },
      2,
      500
    );
    expect(r.bonusAmount).toBe(0);
  });
});

describe("calculateBonus — NÃO-REGRESSÃO dos tipos existentes (snapshot)", () => {
  // Importante: chamamos SEM o 3º parâmetro (eligibleValue) — exatamente como o
  // código fazia antes — para provar que o default 0 não muda nada.

  it("PER_UNIT: 3 unidades × R$ 5 = R$ 15 (inalterado)", () => {
    const r = calculateBonus(
      { bonusType: "PER_UNIT", countMode: "BY_QUANTITY", bonusPerUnit: 5 },
      3
    );
    expect(r.bonusAmount).toBe(15);
    expect(r.eligibleQuantity).toBe(3);
  });

  it("MINIMUM_FIXED: atingiu mínimo 10 → R$ 50; abaixo → 0 (inalterado)", () => {
    const ok = calculateBonus(
      { bonusType: "MINIMUM_FIXED", countMode: "BY_QUANTITY", minimumUnits: 10, bonusFixedOnMin: 50 },
      12
    );
    expect(ok.bonusAmount).toBe(50);
    const no = calculateBonus(
      { bonusType: "MINIMUM_FIXED", countMode: "BY_QUANTITY", minimumUnits: 10, bonusFixedOnMin: 50 },
      8
    );
    expect(no.bonusAmount).toBe(0);
  });

  it("MINIMUM_PER_UNIT (AFTER_MINIMUM): min 10, R$2/un, qty 15 → 5×2 = R$ 10 (inalterado)", () => {
    const r = calculateBonus(
      {
        bonusType: "MINIMUM_PER_UNIT",
        countMode: "BY_QUANTITY",
        minimumUnits: 10,
        bonusPerUnitAfter: 2,
        minimumCountMode: "AFTER_MINIMUM",
      },
      15
    );
    expect(r.bonusAmount).toBe(10);
  });

  it("PER_PACKAGE: pacote de 6, R$20, qty 13 → 2 pacotes = R$ 40 (inalterado)", () => {
    const r = calculateBonus(
      { bonusType: "PER_PACKAGE", countMode: "BY_QUANTITY", packageUnits: 6, bonusPerPackage: 20 },
      13
    );
    expect(r.bonusAmount).toBe(40);
  });

  it("TIERED: faixas {1-9:5},{10-∞:8}, qty 12 → 12 × 8 = R$ 96 (inalterado)", () => {
    // TIERED = quantidade × bonus da faixa aplicável (não o bonus puro).
    const r = calculateBonus(
      {
        bonusType: "TIERED",
        countMode: "BY_QUANTITY",
        tiers: [
          { from: 1, to: 9, bonus: 5 },
          { from: 10, to: null, bonus: 8 },
        ] as any,
      },
      12
    );
    expect(r.bonusAmount).toBe(96);
  });

  it("tipo desconhecido → 0 (inalterado)", () => {
    const r = calculateBonus(
      { bonusType: "NAO_EXISTE", countMode: "BY_QUANTITY" },
      5
    );
    expect(r.bonusAmount).toBe(0);
  });

  it("passar eligibleValue NÃO altera os tipos antigos (PER_UNIT ignora o valor)", () => {
    const semValor = calculateBonus(
      { bonusType: "PER_UNIT", countMode: "BY_QUANTITY", bonusPerUnit: 5 },
      3
    );
    const comValor = calculateBonus(
      { bonusType: "PER_UNIT", countMode: "BY_QUANTITY", bonusPerUnit: 5 },
      3,
      99999 // valor alto: deve ser ignorado pelo PER_UNIT
    );
    expect(comValor.bonusAmount).toBe(semValor.bonusAmount);
    expect(comValor.bonusAmount).toBe(15);
  });
});
