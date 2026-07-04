/**
 * Tabela de preço de IA (custo REAL em USD) e tradução tokens→créditos.
 *
 * Preços em USD por 1 milhão de tokens (Anthropic) ou por segundo (áudio).
 * Constantes versionadas — atualizar à mão quando o provedor mudar preço.
 * NÃO buscar câmbio em runtime (v1): USD_BRL_RATE é fixo.
 * A ótica NUNCA vê USD/BRL — só créditos (tokensToCredits).
 */

import { logger } from "@/lib/logger";

const log = logger.child({ lib: "ai-pricing" });

export const USD_BRL_RATE = 5.5; // taxa fixa v1 (atualizar manualmente)
export const CREDIT_TOKEN_FACTOR = 1000; // 1 crédito = 1000 tokens

interface TokenPrice {
  /** USD por 1M de input tokens */
  inputPerMillion: number;
  /** USD por 1M de output tokens */
  outputPerMillion: number;
  /** USD por 1M de tokens lidos do cache (cache_read_input_tokens) */
  cacheReadPerMillion: number;
  /** USD por 1M de tokens de escrita de cache (cache_creation_input_tokens).
   *  Anthropic cobra 1,25× o input para cache de 5 min. NÃO vem dentro de
   *  input_tokens — precisa ser medido à parte, senão some do custo. */
  cacheWritePerMillion: number;
}

/** Modelos de texto conhecidos (para o teste de acoplamento allowlist↔preço). */
export function knownTextModels(): string[] {
  return Object.keys(TEXT_PRICING);
}

interface AudioPrice {
  /** USD por segundo de áudio */
  perSecond: number;
}

/** Preço por modelo de texto (Anthropic). Chave = model string exata da API. */
const TEXT_PRICING: Record<string, TokenPrice> = {
  // Claude Sonnet 4 — $3/M in, $15/M out, $0.30/M cache read, $3.75/M cache write
  "claude-sonnet-4-20250514": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  // Alias que o Bloco B' usará (qualificação de leads). Mantido aqui para que a
  // medição já cubra o B' assim que ele chamar a API com esse model id.
  "claude-sonnet-4-6": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  // Claude Haiku 4.5 — $1/M in, $5/M out, $0.10/M cache read, $1.25/M cache write
  "claude-haiku-4-5": {
    inputPerMillion: 1,
    outputPerMillion: 5,
    cacheReadPerMillion: 0.1,
    cacheWritePerMillion: 1.25,
  },
  // Claude Opus 4.8 — $5/M in, $25/M out, $0.50/M cache read, $6.25/M cache write
  "claude-opus-4-8": {
    inputPerMillion: 5,
    outputPerMillion: 25,
    cacheReadPerMillion: 0.5,
    cacheWritePerMillion: 6.25,
  },
};

/** Preço por modelo de áudio (OpenAI Whisper). */
const AUDIO_PRICING: Record<string, AudioPrice> = {
  // Whisper — $0.006/minuto = $0.0001/segundo
  "whisper-1": { perSecond: 0.006 / 60 },
};

export interface CostInput {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** cache_read_input_tokens (leitura de cache — 0,1× do input). */
  cacheTokens?: number;
  /** cache_creation_input_tokens (escrita de cache — 1,25× do input).
   *  NÃO está contido em inputTokens; precisa ser passado à parte. */
  cacheWriteTokens?: number;
  audioSeconds?: number;
}

/**
 * Calcula o custo REAL em USD de uma chamada de IA.
 * Fail-safe: modelo desconhecido → 0 (nunca lança; a medição não pode quebrar a
 * feature), mas LOGA um warn — modelo sem preço significa custo/markup subreportados,
 * e não deve passar silenciosamente (ex.: alguém adicionou um modelo à allowlist
 * sem cadastrar o preço aqui).
 */
export function computeCostUsd(input: CostInput): number {
  const audio = AUDIO_PRICING[input.model];
  if (audio) {
    const seconds = input.audioSeconds ?? 0;
    return round6(seconds * audio.perSecond);
  }

  const text = TEXT_PRICING[input.model];
  if (text) {
    const inputCost = ((input.inputTokens ?? 0) / 1_000_000) * text.inputPerMillion;
    const outputCost = ((input.outputTokens ?? 0) / 1_000_000) * text.outputPerMillion;
    const cacheReadCost = ((input.cacheTokens ?? 0) / 1_000_000) * text.cacheReadPerMillion;
    const cacheWriteCost = ((input.cacheWriteTokens ?? 0) / 1_000_000) * text.cacheWritePerMillion;
    return round6(inputCost + outputCost + cacheReadCost + cacheWriteCost);
  }

  log.warn("computeCostUsd: modelo sem preço cadastrado — custo contabilizado como $0", {
    provider: input.provider,
    model: input.model,
  });
  return 0; // modelo desconhecido — fail-safe
}

/** Converte custo USD em BRL. Aceita taxa custom (ex: do banco); padrão = USD_BRL_RATE fixo. */
export function usdToBrl(usd: number, rate: number = USD_BRL_RATE): number {
  return round6(usd * rate);
}

/** Traduz tokens em créditos amigáveis para a ótica (sem R$). Aceita fator custom; padrão = CREDIT_TOKEN_FACTOR. */
export function tokensToCredits(tokens: number, factor: number = CREDIT_TOKEN_FACTOR): number {
  return tokens / factor;
}

/**
 * Preço final em BRL que a ótica paga = custo USD × câmbio × (1 + margem%).
 * markupPercent pode ser negativo (subsídio). Resultado nunca negativo (clamp >= 0).
 */
export function priceForCompany(costUsd: number, usdBrlRate: number, markupPercent: number): number {
  return round6(Math.max(0, costUsd * usdBrlRate * (1 + markupPercent / 100)));
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
