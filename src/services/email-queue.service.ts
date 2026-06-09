import { EmailStatus } from "@prisma/client";
import { renderEmailTemplate } from "@/lib/emails/templates";
import { sendEmail } from "@/lib/emails/resend";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "email-queue" });

export interface ProcessEmailQueueResult {
  picked: number;
  sent: number;
  retryable: number;
  failed: number;
  skipped: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function processEmailQueue(
  limit = envInt("EMAIL_QUEUE_BATCH_LIMIT", 20)
): Promise<ProcessEmailQueueResult> {
  const batchLimit = Math.min(Math.max(limit, 1), 100);
  const maxAttempts = envInt("EMAIL_QUEUE_MAX_ATTEMPTS", 3);

  const pending = await prisma.emailQueue.findMany({
    where: {
      status: EmailStatus.PENDING,
      attempts: { lt: maxAttempts },
    },
    orderBy: { createdAt: "asc" },
    take: batchLimit,
  });

  const summary: ProcessEmailQueueResult = {
    picked: pending.length,
    sent: 0,
    retryable: 0,
    failed: 0,
    skipped: 0,
  };

  for (const email of pending) {
    const locked = await prisma.emailQueue.updateMany({
      where: { id: email.id, status: EmailStatus.PENDING },
      data: {
        status: EmailStatus.PROCESSING,
        attempts: { increment: 1 },
        lastError: null,
      },
    });

    if (locked.count !== 1) {
      summary.skipped++;
      continue;
    }

    const attempt = email.attempts + 1;

    try {
      const rendered = renderEmailTemplate(email.template, email.data);
      await sendEmail({
        to: email.to,
        subject: email.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: `email-queue/${email.id}`,
        tags: [
          { name: "template", value: email.template },
          { name: "source", value: "email_queue" },
        ],
      });

      await prisma.emailQueue.update({
        where: { id: email.id },
        data: {
          status: EmailStatus.SENT,
          sentAt: new Date(),
          lastError: null,
        },
      });
      summary.sent++;
    } catch (error) {
      const message = errorMessage(error).slice(0, 1000);
      const nextStatus = attempt >= maxAttempts ? EmailStatus.FAILED : EmailStatus.PENDING;
      await prisma.emailQueue.update({
        where: { id: email.id },
        data: {
          status: nextStatus,
          lastError: message,
        },
      });

      if (nextStatus === EmailStatus.FAILED) {
        summary.failed++;
      } else {
        summary.retryable++;
      }

      log.error("Falha ao enviar email da fila", {
        emailId: email.id,
        template: email.template,
        attempt,
        final: nextStatus === EmailStatus.FAILED,
        error: message,
      });
    }
  }

  return summary;
}
