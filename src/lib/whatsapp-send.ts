/**
 * Serviço central de envio de WhatsApp por ótica (Fase B2 — motor de envio).
 *
 * Ponto único por onde TODO envio passa. Faz, nesta ordem, as checagens de
 * segurança/consentimento/idempotência e registra o resultado no outbox
 * (WhatsappMessageLog). NUNCA lança exceção para cima — sempre loga e devolve um
 * resultado. Envia de verdade apenas para óticas habilitadas (feature flag) E
 * conectadas (WhatsappConnection.status === CONNECTED); para as demais é no-op
 * gracioso (SKIPPED), sem afetar nenhum fluxo atual.
 *
 * LGPD: o `content` enviado deve conter só nome, nº da OS, valor, vencimento —
 * NUNCA grau/receita/dado clínico. (O chamador é responsável por montar o texto.)
 */

import type { WhatsappMessageType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import { instanceNameForCompany } from "@/lib/whatsapp-instance";
import { normalizePhoneBR } from "@/lib/whatsapp-phone";
import { evolution } from "@/lib/evolution";
import { replaceMessageVariables } from "@/lib/default-messages";

const log = logger.child({ module: "whatsapp-send" });

/** Tipos transacionais: pulam a checagem de consentimento de marketing. */
const TRANSACTIONAL_TYPES = new Set<WhatsappMessageType>([
  "SHARE_LINK",
  "OS_READY",
  "INSTALLMENT_DUE",
]);

type SkipReason =
  | "feature_off"
  | "not_connected"
  | "no_consent"
  | "no_phone"
  | "already_sent";

export interface SendWhatsappInput {
  companyId: string;
  customer: {
    id?: string | null;
    name?: string | null;
    phone?: string | null;
    acceptsMarketing?: boolean | null;
  };
  type: WhatsappMessageType;
  /**
   * Ou um template com placeholders `{chave}` (renderizado com `variables` via
   * replaceMessageVariables) OU um texto já pronto (deixe `variables` vazio).
   */
  template: string;
  variables?: Parameters<typeof replaceMessageVariables>[1];
  referenceId?: string | null;
  /** Janela de dedupe p/ envios automáticos (ex.: "2026-06-15"). Null = manual. */
  periodKey?: string | null;
  /** true para tipos transacionais (pulam consentimento). Default: derivado do type. */
  transactional?: boolean;
}

export interface SendWhatsappResult {
  status: "SENT" | "FAILED" | "SKIPPED";
  skipReason?: SkipReason;
  error?: string;
  messageLogId?: string;
  evolutionMessageId?: string;
}

/** Resultado da checagem de elegibilidade (sem enviar nem persistir). */
export interface WhatsappEligibility {
  /** true → passaria em todas as checagens e seria enviada. */
  eligible: boolean;
  /** preenchido quando eligible=false. */
  skipReason?: SkipReason;
  /** telefone normalizado (E.164 sem '+'), só quando eligible. */
  number?: string;
  /** texto renderizado que seria enviado. */
  content: string;
}

/**
 * Aplica as mesmas checagens do envio (feature → conexão → consentimento →
 * telefone → dedupe) SEM enviar e SEM persistir. Fonte única de verdade usada
 * tanto por `sendWhatsappMessage` quanto pela prévia ("simular sem enviar").
 * Apenas LÊ o banco (conexão/dedupe), nunca escreve.
 */
export async function checkWhatsappEligibility(
  input: SendWhatsappInput,
): Promise<WhatsappEligibility> {
  const { companyId, customer, type, template, variables, referenceId = null, periodKey = null } = input;
  const transactional = input.transactional ?? TRANSACTIONAL_TYPES.has(type);
  const content = variables ? replaceMessageVariables(template, variables) : template;

  // 1. Feature flag por empresa.
  if (!isWhatsappEnabledForCompany(companyId)) {
    return { eligible: false, skipReason: "feature_off", content };
  }

  // 2. Conexão CONNECTED.
  const conn = await prisma.whatsappConnection.findUnique({
    where: { companyId },
    select: { status: true },
  });
  if (conn?.status !== "CONNECTED") {
    return { eligible: false, skipReason: "not_connected", content };
  }

  // 3. Consentimento (só para tipos de marketing).
  if (!transactional && customer.acceptsMarketing !== true) {
    return { eligible: false, skipReason: "no_consent", content };
  }

  // 4. Telefone normalizável.
  const number = normalizePhoneBR(customer.phone ?? "");
  if (!number) {
    return { eligible: false, skipReason: "no_phone", content };
  }

  // 5. Idempotência: já existe mensagem com a mesma chave de dedupe?
  //    Considera PENDING/PROCESSING/SENT — com a fila anti-bloqueio a mensagem
  //    fica PENDING/PROCESSING antes de virar SENT; se olhasse só SENT, o cron
  //    recriaria a mesma mensagem ainda na fila.
  //    (Pula quando periodKey é null — envio manual nunca colide.)
  if (periodKey) {
    const dup = await prisma.whatsappMessageLog.findFirst({
      where: { companyId, type, referenceId, periodKey, status: { in: ["PENDING", "PROCESSING", "SENT"] } },
      select: { id: true },
    });
    if (dup) {
      return { eligible: false, skipReason: "already_sent", content };
    }
  }

  return { eligible: true, number, content };
}

/**
 * Envia (ou registra um SKIP/FAIL) uma mensagem de WhatsApp para um cliente.
 * Sempre persiste em WhatsappMessageLog. Nunca lança.
 */
export async function sendWhatsappMessage(
  input: SendWhatsappInput,
): Promise<SendWhatsappResult> {
  const {
    companyId,
    customer,
    type,
    template,
    variables,
    referenceId = null,
    periodKey = null,
  } = input;

  // Texto efetivamente enviado (render só se vierem variáveis; senão usa o pronto).
  const content = variables ? replaceMessageVariables(template, variables) : template;
  const rawPhone = customer.phone ?? "";

  // helper p/ persistir SKIP sem quebrar o fluxo.
  const persistSkip = async (skipReason: SkipReason): Promise<SendWhatsappResult> => {
    try {
      const row = await prisma.whatsappMessageLog.create({
        data: {
          companyId,
          customerId: customer.id ?? null,
          type,
          phone: rawPhone,
          content,
          status: "SKIPPED",
          skipReason,
          referenceId,
          periodKey,
        },
      });
      return { status: "SKIPPED", skipReason, messageLogId: row.id };
    } catch (err) {
      // Conflito de unique (already_sent concorrente) ou outro erro de log:
      // não pode derrubar o chamador.
      log.warn("Falha ao registrar SKIP no outbox", {
        companyId,
        type,
        skipReason,
        error: err instanceof Error ? err.message : String(err),
      });
      return { status: "SKIPPED", skipReason };
    }
  };

  // Checagens 1-5 (feature → conexão → consentimento → telefone → dedupe).
  // Fonte única compartilhada com a prévia. Persiste o SKIP aqui (a checagem
  // pura não toca o banco para escrita).
  const elig = await checkWhatsappEligibility(input);
  if (!elig.eligible) {
    return persistSkip(elig.skipReason!);
  }
  const number = elig.number!;

  // 6+7. Envia via Evolution.
  try {
    const instanceName = instanceNameForCompany(companyId);
    const res = await evolution.sendText(instanceName, number, content);
    const evolutionMessageId = res.key?.id ?? null;

    const row = await prisma.whatsappMessageLog.create({
      data: {
        companyId,
        customerId: customer.id ?? null,
        type,
        phone: number,
        content,
        status: "SENT",
        evolutionMessageId,
        referenceId,
        periodKey,
        sentAt: new Date(),
      },
    });

    return {
      status: "SENT",
      messageLogId: row.id,
      evolutionMessageId: evolutionMessageId ?? undefined,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("Falha ao enviar WhatsApp", { companyId, type, error: errMsg });
    try {
      const row = await prisma.whatsappMessageLog.create({
        data: {
          companyId,
          customerId: customer.id ?? null,
          type,
          phone: number,
          content,
          status: "FAILED",
          error: errMsg,
          referenceId,
          periodKey,
        },
      });
      return { status: "FAILED", error: errMsg, messageLogId: row.id };
    } catch (logErr) {
      log.warn("Falha ao registrar FAILED no outbox", {
        companyId,
        type,
        error: logErr instanceof Error ? logErr.message : String(logErr),
      });
      return { status: "FAILED", error: errMsg };
    }
  }
}
