import { Prisma, type SaasEmailType, CompanyNotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getSaasEmailConfig } from "@/services/saas-email-config.service";
import { SAAS_EMAIL_CATALOG, isSaasEmailEnabled } from "@/lib/emails/saas-email-catalog";
import { createCompanyNotification } from "@/services/company-notification.service";

const log = logger.child({ service: "saas-notification" });

export type SaasChannel = "email" | "inapp";

export interface NotifyCompanyOpts {
  periodKey: string;
  channels?: SaasChannel[];
  inapp?: { title: string; message: string; link?: string };
  /**
   * Processa a fila de email na hora após enfileirar (em vez de esperar o cron
   * diário). Usado em ações manuais como o reenvio de cobrança, para o cliente
   * receber em segundos. Se o envio imediato falhar, o item permanece na fila e
   * o cron o reprocessa depois (fallback automático).
   */
  flushImmediately?: boolean;
}

export interface NotifyResult {
  status: "SENT" | "SKIPPED" | "FAILED";
  reason?: string;
}

async function resolveRecipient(companyId: string): Promise<string | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { billingEmail: true, email: true },
  });
  if (company?.billingEmail) return company.billingEmail;
  if (company?.email) return company.email;
  const owner = await prisma.user.findFirst({
    where: { companyId, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return owner?.email ?? null;
}

export async function notifyCompany(
  companyId: string,
  eventType: SaasEmailType,
  payload: Record<string, unknown>,
  opts: NotifyCompanyOpts
): Promise<NotifyResult> {
  const channels = opts.channels ?? ["email", "inapp"];
  try {
    const config = await getSaasEmailConfig();

    if (!config.masterEnabled) {
      await safeLog(companyId, eventType, opts.periodKey, "—", "SKIPPED", channels, "master_off");
      return { status: "SKIPPED", reason: "master_off" };
    }
    if (!isSaasEmailEnabled(eventType, config)) {
      await safeLog(companyId, eventType, opts.periodKey, "—", "SKIPPED", channels, "type_off");
      return { status: "SKIPPED", reason: "type_off" };
    }

    let to = await resolveRecipient(companyId);
    if (!to) {
      await safeLog(companyId, eventType, opts.periodKey, "—", "SKIPPED", channels, "no_recipient");
      return { status: "SKIPPED", reason: "no_recipient" };
    }
    if (config.testMode) {
      if (!config.testEmail) {
        await safeLog(companyId, eventType, opts.periodKey, "—", "SKIPPED", channels, "test_mode_no_email");
        return { status: "SKIPPED", reason: "test_mode_no_email" };
      }
      to = config.testEmail;
    }

    // Idempotência: criar o log ANTES de enfileirar. Unique colidiu = já enviado.
    let logId: string;
    try {
      const created = await prisma.saasEmailLog.create({
        data: {
          companyId,
          eventType,
          periodKey: opts.periodKey,
          to,
          status: "PENDING",
          channels: channels.join(","),
        },
      });
      logId = created.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { status: "SKIPPED", reason: "duplicate" };
      }
      throw e;
    }

    let emailQueueId: string | null = null;
    if (channels.includes("email")) {
      const entry = SAAS_EMAIL_CATALOG[eventType];
      // `data:` é o WRAPPER do Prisma create. `to`/`subject`/`template` são COLUNAS
      // da EmailQueue; `data: payload` é a COLUNA Json `data` (payload do template,
      // que o cron passa intacto ao renderEmailTemplate). NÃO injetar `to` no
      // payload — os schemas Zod dos templates (Task 5) não têm campo `to`.
      const queued = await prisma.emailQueue.create({
        data: { to, subject: entry.subject, template: entry.template, data: payload as Prisma.InputJsonValue },
      });
      emailQueueId = queued.id;

      // Ação manual (ex.: reenvio de cobrança): processa a fila já, sem esperar
      // o cron diário. Fail-silent — se falhar, fica PENDING e o cron reprocessa.
      if (opts.flushImmediately) {
        try {
          const { processEmailQueue } = await import("@/services/email-queue.service");
          await processEmailQueue(5);
        } catch (flushError) {
          log.warn("flush imediato da fila falhou (item segue na fila p/ o cron)", {
            companyId,
            eventType,
            emailQueueId,
            error: flushError instanceof Error ? flushError.message : String(flushError),
          });
        }
      }
    }

    if (channels.includes("inapp") && opts.inapp) {
      await createCompanyNotification({
        companyId,
        userId: null,
        type: CompanyNotificationType.BILLING,
        title: opts.inapp.title,
        message: opts.inapp.message,
        link: opts.inapp.link,
        metadata: { eventType, periodKey: opts.periodKey },
      });
    }

    await prisma.saasEmailLog.update({
      where: { id: logId },
      data: { status: "SENT", emailQueueId },
    });
    return { status: "SENT" };
  } catch (error) {
    log.error("notifyCompany falhou (fail-silent)", {
      companyId,
      eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "FAILED", reason: "error" };
  }
}

/** Grava um SaasEmailLog de forma best-effort (não relança). */
async function safeLog(
  companyId: string,
  eventType: SaasEmailType,
  periodKey: string,
  to: string,
  status: "SKIPPED",
  channels: SaasChannel[],
  skipReason: string
): Promise<void> {
  try {
    await prisma.saasEmailLog.create({
      data: { companyId, eventType, periodKey, to, status, channels: channels.join(","), skipReason },
    });
  } catch (e) {
    // SKIPPED duplicado (já há log do mesmo período) é inofensivo — ignora.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    log.warn("Falha ao gravar SaasEmailLog SKIPPED", { companyId, eventType, skipReason });
  }
}
