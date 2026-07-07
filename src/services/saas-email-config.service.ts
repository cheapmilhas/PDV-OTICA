import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/secret-cipher";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "saas-email-config" });
const SINGLETON_ID = "singleton";
const DEFAULT_RESEND_API_URL = "https://api.resend.com";

export interface SaasEmailConfigPatch {
  masterEnabled?: boolean;
  testMode?: boolean;
  testEmail?: string | null;
  welcomeEnabled?: boolean;
  trialEndingEnabled?: boolean;
  trialExpiredEnabled?: boolean;
  invoiceOverdueEnabled?: boolean;
  paymentConfirmedEnabled?: boolean;
  subscriptionSuspendedEnabled?: boolean;
  subscriptionCanceledEnabled?: boolean;
  invoiceGenerationEnabled?: boolean;
  invoiceCreatedEnabled?: boolean;
  invoiceDueSoonEnabled?: boolean;
}

/** Lê (e garante) o registro único de config dos emails do SaaS. */
export async function getSaasEmailConfig() {
  return prisma.saasEmailConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
}

/** Atualiza o singleton registrando quem mudou. */
export async function updateSaasEmailConfig(patch: SaasEmailConfigPatch, updatedBy?: string) {
  return prisma.saasEmailConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...patch, updatedBy },
    update: { ...patch, updatedBy },
  });
}

// ── Remetente + chave Resend (config auto-suficiente, padrão da chave de IA) ────

export interface SaasEmailSenderPatch {
  /** Chave Resend em claro; só é cifrada+gravada se vier não-vazia. */
  resendApiKey?: string;
  emailFrom?: string | null;
  emailReplyTo?: string | null;
}

export interface SaasEmailSenderView {
  hasResendKey: boolean;
  emailFrom: string | null;
  emailReplyTo: string | null;
}

/**
 * View para a UI — NUNCA decifra a chave. Só informa se existe (`hasResendKey`)
 * e os endereços em claro. Mesmo contrato do `hasKey` do ai-config.
 */
export async function getSaasEmailSenderView(): Promise<SaasEmailSenderView> {
  const c = await prisma.saasEmailConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
    select: { resendApiKeyEnc: true, emailFrom: true, emailReplyTo: true },
  });
  return {
    hasResendKey: !!c.resendApiKeyEnc,
    emailFrom: c.emailFrom ?? null,
    emailReplyTo: c.emailReplyTo ?? null,
  };
}

/**
 * Atualiza remetente/chave. Branco na chave = MANTÉM a atual (não entra no
 * update) — espelha o updateAiConfig. emailFrom/emailReplyTo: string define,
 * null limpa (volta ao fallback env), undefined mantém.
 */
export async function updateSaasEmailSender(patch: SaasEmailSenderPatch, updatedBy?: string) {
  const data: {
    resendApiKeyEnc?: string;
    emailFrom?: string | null;
    emailReplyTo?: string | null;
    updatedBy?: string;
  } = { updatedBy };

  if (patch.resendApiKey && patch.resendApiKey.trim().length > 0) {
    data.resendApiKeyEnc = encryptSecret(patch.resendApiKey.trim());
  }
  if (patch.emailFrom !== undefined) {
    const v = patch.emailFrom?.trim();
    data.emailFrom = v ? v : null;
  }
  if (patch.emailReplyTo !== undefined) {
    const v = patch.emailReplyTo?.trim();
    data.emailReplyTo = v ? v : null;
  }

  return prisma.saasEmailConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });
}

export interface ResendRuntimeConfig {
  apiKey: string;
  from: string;
  replyTo?: string;
  baseUrl: string;
}

/**
 * Config efetiva do Resend em runtime. Banco tem PRIORIDADE; env é fallback —
 * mesmo padrão do getAnthropicKey (ai-config.service):
 *  - chave: decifra a do banco; se falhar (corrompida / ENCRYPTION_KEY trocada),
 *    LOGA um warn e cai na env (senão a UI diria "configurada" e o envio usaria
 *    outra chave silenciosamente).
 *  - from/replyTo: banco ?? env.
 * Lança só se, ao final, faltar apiKey OU from (em banco E env) — o envio não
 * pode seguir sem eles.
 */
export async function getResendConfig(): Promise<ResendRuntimeConfig> {
  const c = await prisma.saasEmailConfig.findUnique({
    where: { id: SINGLETON_ID },
    select: { resendApiKeyEnc: true, emailFrom: true, emailReplyTo: true },
  });

  let apiKey: string | undefined;
  if (c?.resendApiKeyEnc) {
    try {
      apiKey = decryptSecret(c.resendApiKeyEnc);
    } catch (err) {
      log.warn("getResendConfig: falha ao decifrar a chave do banco — usando env como fallback", { err });
    }
  }
  apiKey = apiKey ?? process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Chave Resend ausente (nem no banco nem em RESEND_API_KEY)");
  }

  const from = (c?.emailFrom ?? undefined) || process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("Remetente ausente (nem no banco nem em EMAIL_FROM)");
  }

  const replyTo = (c?.emailReplyTo ?? undefined) || process.env.EMAIL_REPLY_TO || undefined;

  return {
    apiKey,
    from,
    replyTo,
    baseUrl: process.env.RESEND_API_URL || DEFAULT_RESEND_API_URL,
  };
}
