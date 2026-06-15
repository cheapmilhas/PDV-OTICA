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
  const transactional = input.transactional ?? TRANSACTIONAL_TYPES.has(type);

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

  // 1. Feature flag por empresa.
  if (!isWhatsappEnabledForCompany(companyId)) {
    return persistSkip("feature_off");
  }

  // 2. Conexão CONNECTED.
  const conn = await prisma.whatsappConnection.findUnique({
    where: { companyId },
    select: { status: true },
  });
  if (conn?.status !== "CONNECTED") {
    return persistSkip("not_connected");
  }

  // 3. Consentimento (só para tipos de marketing).
  if (!transactional && customer.acceptsMarketing !== true) {
    return persistSkip("no_consent");
  }

  // 4. Telefone normalizável.
  const number = normalizePhoneBR(rawPhone);
  if (!number) {
    return persistSkip("no_phone");
  }

  // 5. Idempotência: já existe SENT com a mesma chave de dedupe?
  //    (Pula quando periodKey é null — envio manual nunca colide.)
  if (periodKey) {
    const dup = await prisma.whatsappMessageLog.findFirst({
      where: { companyId, type, referenceId, periodKey, status: "SENT" },
      select: { id: true },
    });
    if (dup) {
      return persistSkip("already_sent");
    }
  }

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
