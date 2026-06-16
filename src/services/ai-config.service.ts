import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/secret-cipher";

const SINGLETON_ID = "global";

export interface AiConfigView {
  hasKey: boolean;
  usdBrlRate: number;
  markupPercent: number;
  creditTokenFactor: number;
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
  };
}

export interface UpdateAiConfigInput {
  anthropicKey?: string;
  usdBrlRate?: number;
  markupPercent?: number;
  creditTokenFactor?: number;
}

export async function updateAiConfig(patch: UpdateAiConfigInput): Promise<AiConfigView> {
  const data: Record<string, unknown> = {};
  if (typeof patch.usdBrlRate === "number") data.usdBrlRate = patch.usdBrlRate;
  if (typeof patch.markupPercent === "number") data.markupPercent = patch.markupPercent;
  if (typeof patch.creditTokenFactor === "number") data.creditTokenFactor = patch.creditTokenFactor;
  if (patch.anthropicKey && patch.anthropicKey.trim().length > 0) {
    data.anthropicKeyEnc = encryptSecret(patch.anthropicKey.trim());
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
    } catch {
      /* fall through to env */
    }
  }
  return process.env.ANTHROPIC_API_KEY;
}
