/**
 * Retenção do inbox de WhatsApp (não lotar o banco).
 *
 * Estratégia inteligente (decisão do dono):
 *  - Apaga WhatsappMessage com receivedAt > RETENTION_DAYS (default 3) SE a
 *    conversa já foi analisada pela IA (conversation.analyzedAt != null).
 *  - Teto de segurança: apaga QUALQUER WhatsappMessage > MAX_RETENTION_DAYS
 *    (default 7), analisada ou não — garante que nunca acumula.
 *  - Apaga conversas que ficaram sem nenhuma mensagem.
 *
 * Os limites são configuráveis por env (sem deploy):
 *   WHATSAPP_RETENTION_DAYS      (default 3)
 *   WHATSAPP_MAX_RETENTION_DAYS  (default 7)
 *
 * Não lança: erros são logados e retorna o resumo.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "whatsapp-retention" });

function envDays(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export interface RetentionResult {
  deletedAnalyzed: number;
  deletedMaxAge: number;
  deletedEmptyConversations: number;
  retentionDays: number;
  maxRetentionDays: number;
}

export async function runWhatsappRetention(now: Date = new Date()): Promise<RetentionResult> {
  const retentionDays = envDays("WHATSAPP_RETENTION_DAYS", 3);
  const maxRetentionDays = envDays("WHATSAPP_MAX_RETENTION_DAYS", 7);

  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const maxCutoff = new Date(now.getTime() - maxRetentionDays * 24 * 60 * 60 * 1000);

  const result: RetentionResult = {
    deletedAnalyzed: 0,
    deletedMaxAge: 0,
    deletedEmptyConversations: 0,
    retentionDays,
    maxRetentionDays,
  };

  try {
    // 1) Mensagens > retentionDays cuja CONVERSA já foi analisada pela IA.
    const analyzed = await prisma.whatsappMessage.deleteMany({
      where: {
        receivedAt: { lt: cutoff },
        conversation: { analyzedAt: { not: null } },
      },
    });
    result.deletedAnalyzed = analyzed.count;

    // 2) Teto de segurança: qualquer mensagem > maxRetentionDays (analisada ou não).
    const maxAge = await prisma.whatsappMessage.deleteMany({
      where: { receivedAt: { lt: maxCutoff } },
    });
    result.deletedMaxAge = maxAge.count;

    // 3) Conversas que ficaram sem nenhuma mensagem.
    const empty = await prisma.whatsappConversation.deleteMany({
      where: { messages: { none: {} } },
    });
    result.deletedEmptyConversations = empty.count;
  } catch (err) {
    log.error("Falha na retenção do inbox de WhatsApp", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}
