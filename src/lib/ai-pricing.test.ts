import { describe, it, expect } from "vitest";
import {
  computeCostUsd,
  priceForCompany,
  tokensToCredits,
  usdToBrl,
  knownTextModels,
  CREDIT_TOKEN_FACTOR,
} from "./ai-pricing";
import { QUALIFIER_MODELS } from "@/services/ai-config.service";

describe("computeCostUsd", () => {
  it("calcula custo do claude-sonnet-4 (input+output)", () => {
    // sonnet-4: $3/M input, $15/M output → 1M input = $3, 1M output = $15
    const cost = computeCostUsd({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(18, 4);
  });

  it("inclui cacheTokens no custo de input (preço de leitura de cache reduzido)", () => {
    const cost = computeCostUsd({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 1_000_000,
    });
    // cache read sonnet-4 = $0.30/M
    expect(cost).toBeCloseTo(0.3, 4);
  });

  it("calcula custo do whisper por segundo de áudio", () => {
    // whisper: $0.006/minuto = $0.0001/segundo → 60s = $0.006
    const cost = computeCostUsd({
      provider: "openai",
      model: "whisper-1",
      audioSeconds: 60,
    });
    expect(cost).toBeCloseTo(0.006, 5);
  });

  it("modelo desconhecido → custo 0 (fail-safe, nunca lança)", () => {
    const cost = computeCostUsd({
      provider: "anthropic",
      model: "modelo-inexistente-xyz",
      inputTokens: 1000,
      outputTokens: 1000,
    });
    expect(cost).toBe(0);
  });

  it("calcula custo do claude-haiku-4-5 (input+output)", () => {
    // haiku-4-5: $1/M input, $5/M output → 1M+1M = $1 + $5 = $6
    const cost = computeCostUsd({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(6, 4);
  });

  it("inclui cache read do claude-haiku-4-5 ($0.10/M)", () => {
    const cost = computeCostUsd({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      cacheTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.1, 4);
  });

  it("calcula custo do claude-opus-4-8 (input+output)", () => {
    // opus-4-8: $5/M input, $25/M output → 1M+1M = $5 + $25 = $30
    const cost = computeCostUsd({
      provider: "anthropic",
      model: "claude-opus-4-8",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(30, 4);
  });

  it("inclui cacheWriteTokens no custo (escrita de cache = 1,25× o input)", () => {
    // sonnet-4-6 cache write = $3.75/M → 1M = $3.75
    const cost = computeCostUsd({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      cacheWriteTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(3.75, 4);
  });

  it("cache write do haiku-4-5 = $1.25/M", () => {
    const cost = computeCostUsd({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      cacheWriteTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(1.25, 4);
  });
});

// IA-2: acoplamento allowlist ↔ tabela de preço. Se um modelo entra na allowlist
// (QUALIFIER_MODELS, usada para qualifier/lensAdvisor/ocr) sem preço cadastrado,
// todo o consumo dele seria contabilizado a $0 silenciosamente — e o markup
// cobrado da ótica viraria R$ 0. Este teste falha ANTES de isso chegar em prod.
describe("acoplamento modelo ↔ preço (IA-2)", () => {
  it("todo modelo da allowlist tem preço na tabela de texto", () => {
    const priced = new Set(knownTextModels());
    for (const model of QUALIFIER_MODELS) {
      expect(priced.has(model), `modelo "${model}" está na allowlist mas SEM preço em ai-pricing.ts`).toBe(true);
    }
  });

  it("cada modelo da allowlist produz custo > 0 para tokens > 0", () => {
    for (const model of QUALIFIER_MODELS) {
      const cost = computeCostUsd({ provider: "anthropic", model, inputTokens: 1_000_000 });
      expect(cost, `modelo "${model}" custou $0 para 1M input`).toBeGreaterThan(0);
    }
  });
});

describe("priceForCompany", () => {
  it("aplica margem positiva (+50%)", () => {
    // 2 * 5.5 * 1.5 = 16.5
    expect(priceForCompany(2, 5.5, 50)).toBeCloseTo(16.5, 4);
  });

  it("margem 0% = custo USD × câmbio", () => {
    // 2 * 5.5 * 1 = 11
    expect(priceForCompany(2, 5.5, 0)).toBeCloseTo(11, 4);
  });

  it("aceita margem negativa (subsídio, -20%)", () => {
    // 2 * 5.5 * 0.8 = 8.8
    expect(priceForCompany(2, 5.5, -20)).toBeCloseTo(8.8, 4);
  });

  it("clampa em 0 quando a margem tornaria o preço negativo", () => {
    expect(priceForCompany(2, 5.5, -150)).toBe(0);
  });
});

describe("tokensToCredits", () => {
  it("traduz tokens em créditos pelo fator", () => {
    expect(tokensToCredits(CREDIT_TOKEN_FACTOR)).toBe(1);
    expect(tokensToCredits(CREDIT_TOKEN_FACTOR * 2.5)).toBeCloseTo(2.5, 4);
    expect(tokensToCredits(0)).toBe(0);
  });

  it("tokensToCredits usa fator custom quando passado", () => {
    expect(tokensToCredits(2000, 500)).toBe(4);
    expect(tokensToCredits(2000)).toBe(2); // default 1000 mantido
  });
});

describe("usdToBrl", () => {
  it("usdToBrl usa rate custom quando passado", () => {
    expect(usdToBrl(2, 6)).toBeCloseTo(12, 4);
    expect(usdToBrl(2)).toBeCloseTo(11, 4); // default 5.5
  });
});
