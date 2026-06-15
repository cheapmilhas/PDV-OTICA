import { describe, it, expect } from "vitest";
import {
  computeCostUsd,
  tokensToCredits,
  CREDIT_TOKEN_FACTOR,
} from "./ai-pricing";

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
});

describe("tokensToCredits", () => {
  it("traduz tokens em créditos pelo fator", () => {
    expect(tokensToCredits(CREDIT_TOKEN_FACTOR)).toBe(1);
    expect(tokensToCredits(CREDIT_TOKEN_FACTOR * 2.5)).toBeCloseTo(2.5, 4);
    expect(tokensToCredits(0)).toBe(0);
  });
});
