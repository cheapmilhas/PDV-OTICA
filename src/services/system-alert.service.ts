import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";
import { getResendConfig } from "@/services/saas-email-config.service";

const log = logger.child({ service: "system-alert" });

/**
 * E-mail de alerta da Saúde do Sistema — a peça nº1 da feature: o valor está em
 * ser AVISADO no celular quando algo cai, não em olhar a tela. Roda pelo cron
 * health-alert.
 *
 * Idempotência SEM tabela extra: só alerta eventos ABERTOS com `alertedAt=null`
 * e os marca ao enfileirar. Um incidente = um e-mail. Reabrir o mesmo problema
 * gera um SystemEvent novo (dedupeKey), que aí sim é alertado de novo.
 *
 * Envio pela FILA (EmailQueue) + flush imediato — reusa o worker (retry/throttle
 * do Resend) e o getResendConfig (chave/remetente da Config, cifrados). O
 * destinatário vem de SYSTEM_ALERT_EMAIL (fallback EMAIL_REPLY_TO / remetente).
 */

export interface MaybeSendAlertResult {
  sent: boolean;
  reason?: "no_open_unalerted" | "no_recipient" | "no_email_config";
  alertedEventIds: string[];
}

/** Destinatário do alerta: env dedicada > reply-to > endereço do remetente. */
async function resolveRecipient(): Promise<string | null> {
  const explicit = process.env.SYSTEM_ALERT_EMAIL?.trim();
  if (explicit) return explicit;
  try {
    const cfg = await getResendConfig();
    if (cfg.replyTo) return cfg.replyTo;
    // `from` pode vir como "Nome <email>" — extrai o endereço.
    const match = cfg.from.match(/<([^>]+)>/);
    return match ? match[1] : cfg.from;
  } catch {
    return null;
  }
}

function dashboardUrl(): string {
  const base = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://vis.app.br";
  return `${base.replace(/\/$/, "")}/admin/configuracoes/saude`;
}

/**
 * Alerta os incidentes abertos ainda não alertados. `severityLabel` reflete o
 * pior sinal atual (passado pelo cron, que já montou o snapshot). Best-effort:
 * uma falha de envio NÃO marca `alertedAt`, então o próximo ciclo tenta de novo.
 */
export async function maybeSendAlert(severityLabel: string): Promise<MaybeSendAlertResult> {
  // Só e-maila incidentes de fato acionáveis (warning/critical), nunca "info".
  const pending = await prisma.systemEvent.findMany({
    where: { status: "open", alertedAt: null, severity: { in: ["warning", "critical"] } },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) {
    return { sent: false, reason: "no_open_unalerted", alertedEventIds: [] };
  }

  const to = await resolveRecipient();
  if (!to) {
    log.warn("Alerta pendente mas sem destinatário (SYSTEM_ALERT_EMAIL/EMAIL_* ausentes)", {
      pendingCount: pending.length,
    });
    return { sent: false, reason: "no_recipient", alertedEventIds: [] };
  }

  const incidents = pending.map((e) => ({ title: e.title, detail: e.detail }));
  const subject =
    pending.length === 1
      ? `⚠️ Vis — ${pending[0].title}`
      : `⚠️ Vis — ${pending.length} incidentes no sistema`;

  try {
    // Enfileira o e-mail (payload = data do template system-alert).
    await prisma.emailQueue.create({
      data: {
        to,
        subject,
        template: "system-alert",
        data: {
          severityLabel,
          incidents,
          dashboardUrl: dashboardUrl(),
        } as Prisma.InputJsonValue,
      },
    });

    // Marca os eventos como alertados ANTES do flush: se o flush falhar, o item
    // fica PENDING na fila e o worker/cron reenvia — não reemitimos o alerta.
    const ids = pending.map((e) => e.id);
    await prisma.systemEvent.updateMany({
      where: { id: { in: ids } },
      data: { alertedAt: new Date() },
    });

    // Flush imediato (mesmo padrão do saas-notification): não espera o cron de
    // fila. Fail-silent — se falhar, o item segue PENDING pro worker.
    try {
      const { processEmailQueue } = await import("@/services/email-queue.service");
      await processEmailQueue(5);
    } catch (flushErr) {
      log.warn("flush imediato do alerta falhou (segue na fila p/ o worker)", { flushErr });
    }

    log.info("Alerta de saúde enfileirado", { to, count: ids.length, severityLabel });
    return { sent: true, alertedEventIds: ids };
  } catch (err) {
    log.error("Falha ao enfileirar alerta de saúde", { err });
    // Não marcamos alertedAt → próxima passada tenta de novo.
    return { sent: false, reason: "no_email_config", alertedEventIds: [] };
  }
}
