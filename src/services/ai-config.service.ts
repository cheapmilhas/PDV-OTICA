import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/secret-cipher";
import { logger } from "@/lib/logger";
import { defaultTextPricing, type PricingOverrides } from "@/lib/ai-pricing";

const log = logger.child({ service: "ai-config" });
const SINGLETON_ID = "global";

/**
 * Cache em processo dos overrides de preço (Fase 4b). computeCostUsd roda no
 * caminho quente (toda qualificação via logAiUsage) — sem cache seria 1 query ao
 * banco por chamada de IA. TTL curto: uma mudança de preço reflete em ≤ TTL.
 */
const PRICING_CACHE_TTL_MS = 60_000;
let pricingCache: { at: number; value: PricingOverrides } | null = null;

/**
 * Overrides de preço por modelo (do banco), com cache de 60s. Vazio ({}) quando
 * não há overrides → computeCostUsd usa a tabela hardcoded. Best-effort: em erro
 * de leitura retorna {} (nunca quebra a medição de custo).
 */
export async function getPricingOverrides(now: number = Date.now()): Promise<PricingOverrides> {
  if (pricingCache && now - pricingCache.at < PRICING_CACHE_TTL_MS) {
    return pricingCache.value;
  }
  try {
    const c = await prisma.aiGlobalConfig.findUnique({
      where: { id: SINGLETON_ID },
      select: { modelPricingJson: true },
    });
    const value = (c?.modelPricingJson as PricingOverrides | null) ?? {};
    pricingCache = { at: now, value };
    return value;
  } catch (err) {
    log.warn("getPricingOverrides: falha ao ler — usando tabela padrão", { err });
    return pricingCache?.value ?? {};
  }
}

/** Invalida o cache de overrides (chamar após salvar novos preços). */
export function invalidatePricingCache(): void {
  pricingCache = null;
}

// Allowlist dos modelos Claude válidos para o qualificador de leads.
// Exportado para reuso na rota/UI (defesa em profundidade: rota também valida).
export const QUALIFIER_MODELS = ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-8"] as const;
export type QualifierModel = (typeof QUALIFIER_MODELS)[number];

// Allowlist dos modelos de TRANSCRIÇÃO de áudio (provedor OpenAI/Whisper — família
// diferente dos Claude, por isso allowlist própria; rodar por QUALIFIER_MODELS
// descartaria "whisper-1" silenciosamente).
export const TRANSCRIPTION_MODELS = ["whisper-1"] as const;
export type TranscriptionModel = (typeof TRANSCRIPTION_MODELS)[number];

/**
 * Modelos que NÃO aceitam o parâmetro `temperature` (a família Opus 4.7+ o
 * removeu — passar temperature devolve 400). Chamadas devem OMITIR temperature
 * para esses modelos. Sem isso, escolher opus-4-8 na config de IA fazia toda
 * qualificação/copiloto falhar com 400 (silenciosamente, sem medir custo).
 */
const MODELS_WITHOUT_TEMPERATURE = new Set<string>(["claude-opus-4-8"]);

/** true se o modelo aceita o parâmetro `temperature` na Messages API. */
export function modelSupportsTemperature(model: string): boolean {
  return !MODELS_WITHOUT_TEMPERATURE.has(model);
}

/** Preço EFETIVO de um modelo de texto na view (default + override aplicado). */
export interface EffectiveTextPrice {
  model: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
  /** true se algum campo veio de override do banco (≠ tabela padrão). */
  overridden: boolean;
}

export interface AiConfigView {
  hasKey: boolean;
  usdBrlRate: number;
  markupPercent: number;
  creditTokenFactor: number;
  qualifierModel: string;
  lensAdvisorModel: string;
  ocrModel: string;
  copilotModel: string;
  transcriptionModel: string;
  hasOpenaiKey: boolean;
  /** Preços efetivos dos modelos de texto (default + overrides) para a UI editar. */
  modelPricing: EffectiveTextPrice[];
}

export async function getAiConfig(): Promise<AiConfigView> {
  const c = await prisma.aiGlobalConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  const overrides = (c.modelPricingJson as PricingOverrides | null) ?? {};
  const defaults = defaultTextPricing();
  const modelPricing: EffectiveTextPrice[] = Object.entries(defaults).map(([model, base]) => {
    const ov = overrides[model] ?? {};
    const pick = (k: keyof typeof base) =>
      typeof ov[k] === "number" && Number.isFinite(ov[k] as number) && (ov[k] as number) >= 0
        ? (ov[k] as number)
        : base[k];
    const overridden =
      ["inputPerMillion", "outputPerMillion", "cacheReadPerMillion", "cacheWritePerMillion"].some(
        (k) => typeof ov[k as keyof typeof ov] === "number"
      );
    return {
      model,
      inputPerMillion: pick("inputPerMillion"),
      outputPerMillion: pick("outputPerMillion"),
      cacheReadPerMillion: pick("cacheReadPerMillion"),
      cacheWritePerMillion: pick("cacheWritePerMillion"),
      overridden,
    };
  });
  return {
    hasKey: !!c.anthropicKeyEnc,
    usdBrlRate: Number(c.usdBrlRate.toString()),
    markupPercent: Number(c.markupPercent.toString()),
    creditTokenFactor: c.creditTokenFactor,
    qualifierModel: c.qualifierModel,
    lensAdvisorModel: c.lensAdvisorModel,
    ocrModel: c.ocrModel,
    copilotModel: c.copilotModel,
    transcriptionModel: c.transcriptionModel,
    hasOpenaiKey: !!c.openaiKeyEnc,
    modelPricing,
  };
}

export interface UpdateAiConfigInput {
  anthropicKey?: string;
  usdBrlRate?: number;
  markupPercent?: number;
  creditTokenFactor?: number;
  qualifierModel?: string;
  lensAdvisorModel?: string;
  ocrModel?: string;
  copilotModel?: string;
  transcriptionModel?: string;
  openaiKey?: string;
  /** Overrides de preço por modelo (Fase 4b). Substitui o JSON inteiro quando presente. */
  modelPricing?: PricingOverrides;
}

export async function updateAiConfig(patch: UpdateAiConfigInput): Promise<AiConfigView> {
  const data: Record<string, unknown> = {};
  if (typeof patch.usdBrlRate === "number") data.usdBrlRate = patch.usdBrlRate;
  if (typeof patch.markupPercent === "number") data.markupPercent = patch.markupPercent;
  if (typeof patch.creditTokenFactor === "number") data.creditTokenFactor = patch.creditTokenFactor;
  if (patch.anthropicKey && patch.anthropicKey.trim().length > 0) {
    data.anthropicKeyEnc = encryptSecret(patch.anthropicKey.trim());
  }
  // Só aceita modelos da allowlist (defesa em profundidade); ignora silenciosamente o resto.
  if (patch.qualifierModel && (QUALIFIER_MODELS as readonly string[]).includes(patch.qualifierModel)) {
    data.qualifierModel = patch.qualifierModel;
  }
  // Mesma allowlist do qualificador (defesa em profundidade); ignora silenciosamente o resto.
  if (patch.lensAdvisorModel && (QUALIFIER_MODELS as readonly string[]).includes(patch.lensAdvisorModel)) {
    data.lensAdvisorModel = patch.lensAdvisorModel;
  }
  // Mesma allowlist (defesa em profundidade); ignora silenciosamente o resto.
  if (patch.ocrModel && (QUALIFIER_MODELS as readonly string[]).includes(patch.ocrModel)) {
    data.ocrModel = patch.ocrModel;
  }
  // Copiloto: modelos Claude (mesma allowlist do qualificador).
  if (patch.copilotModel && (QUALIFIER_MODELS as readonly string[]).includes(patch.copilotModel)) {
    data.copilotModel = patch.copilotModel;
  }
  // Transcrição: allowlist PRÓPRIA (Whisper/OpenAI, não Claude).
  if (patch.transcriptionModel && (TRANSCRIPTION_MODELS as readonly string[]).includes(patch.transcriptionModel)) {
    data.transcriptionModel = patch.transcriptionModel;
  }
  if (patch.openaiKey && patch.openaiKey.trim().length > 0) {
    data.openaiKeyEnc = encryptSecret(patch.openaiKey.trim());
  }
  // Overrides de preço (Fase 4b): grava só campos numéricos válidos (>=0), por
  // modelo conhecido. Sanitiza aqui — a rota também valida com Zod (defesa em prof.).
  if (patch.modelPricing) {
    const sanitized = sanitizePricingOverrides(patch.modelPricing);
    data.modelPricingJson = sanitized as Prisma.InputJsonValue;
  }
  await prisma.aiGlobalConfig.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });
  // Preço mudou → derruba o cache pra refletir já (senão espera o TTL de 60s).
  if (patch.modelPricing) invalidatePricingCache();
  return getAiConfig();
}

const PRICE_FIELDS = [
  "inputPerMillion",
  "outputPerMillion",
  "cacheReadPerMillion",
  "cacheWritePerMillion",
  "perSecond",
] as const;

/**
 * Mantém só modelos conhecidos e campos numéricos válidos (>=0). Descarta lixo,
 * garantindo que o JSON gravado é sempre um mapa limpo model→{campos numéricos}.
 */
function sanitizePricingOverrides(input: PricingOverrides): PricingOverrides {
  const known = new Set(Object.keys(defaultTextPricing()));
  const out: PricingOverrides = {};
  for (const [model, price] of Object.entries(input)) {
    if (!known.has(model) || !price || typeof price !== "object") continue;
    const clean: Record<string, number> = {};
    for (const f of PRICE_FIELDS) {
      const v = (price as Record<string, unknown>)[f];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) clean[f] = v;
    }
    if (Object.keys(clean).length > 0) out[model] = clean;
  }
  return out;
}

export async function getAnthropicKey(): Promise<string | undefined> {
  const c = await prisma.aiGlobalConfig.findUnique({
    where: { id: SINGLETON_ID },
    select: { anthropicKeyEnc: true },
  });
  if (c?.anthropicKeyEnc) {
    try {
      return decryptSecret(c.anthropicKeyEnc);
    } catch (err) {
      // Key cifrada corrompida (write parcial / ENCRYPTION_KEY trocada / edição manual).
      // Cai na env, mas LOGA — senão a UI mostra "configurada" e a IA usa outra key
      // silenciosamente, confundindo a operação numa rotação de chave.
      log.warn("getAnthropicKey: falha ao decifrar a key do banco — usando env como fallback", { err });
    }
  }
  return process.env.ANTHROPIC_API_KEY;
}

export async function getOpenaiKey(): Promise<string | undefined> {
  const c = await prisma.aiGlobalConfig.findUnique({
    where: { id: SINGLETON_ID },
    select: { openaiKeyEnc: true },
  });
  if (c?.openaiKeyEnc) {
    try {
      return decryptSecret(c.openaiKeyEnc);
    } catch (err) {
      // Key cifrada corrompida (write parcial / ENCRYPTION_KEY trocada / edição manual).
      // Cai na env, mas LOGA — senão a UI mostra "configurada" e a IA usa outra key
      // silenciosamente, confundindo a operação numa rotação de chave.
      log.warn("getOpenaiKey: falha ao decifrar a key do banco — usando env como fallback", { err });
    }
  }
  return process.env.OPENAI_API_KEY;
}
