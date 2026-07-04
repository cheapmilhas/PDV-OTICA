import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/secret-cipher";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "ai-config" });
const SINGLETON_ID = "global";

// Allowlist dos modelos Claude válidos para o qualificador de leads.
// Exportado para reuso na rota/UI (defesa em profundidade: rota também valida).
export const QUALIFIER_MODELS = ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-8"] as const;
export type QualifierModel = (typeof QUALIFIER_MODELS)[number];

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

export interface AiConfigView {
  hasKey: boolean;
  usdBrlRate: number;
  markupPercent: number;
  creditTokenFactor: number;
  qualifierModel: string;
  lensAdvisorModel: string;
  ocrModel: string;
  hasOpenaiKey: boolean;
}

export async function getAiConfig(): Promise<AiConfigView> {
  const c = await prisma.aiGlobalConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  return {
    hasKey: !!c.anthropicKeyEnc,
    usdBrlRate: Number(c.usdBrlRate.toString()),
    markupPercent: Number(c.markupPercent.toString()),
    creditTokenFactor: c.creditTokenFactor,
    qualifierModel: c.qualifierModel,
    lensAdvisorModel: c.lensAdvisorModel,
    ocrModel: c.ocrModel,
    hasOpenaiKey: !!c.openaiKeyEnc,
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
  openaiKey?: string;
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
  if (patch.openaiKey && patch.openaiKey.trim().length > 0) {
    data.openaiKeyEnc = encryptSecret(patch.openaiKey.trim());
  }
  await prisma.aiGlobalConfig.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });
  return getAiConfig();
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
