/**
 * Q7.1 P1-10: processa retries de generateSaleEntries que falharam.
 *
 * Fluxo:
 * 1. sale.create chama applyFinanceEntriesInTx.
 * 2. Se falha, registro FinanceEntryRetry(status=PENDING, nextRetryAt=+5min).
 * 3. Cron /api/cron/retry-finance-entries chama processRetries() de tempos em tempos.
 * 4. Cada call: busca PENDING com nextRetryAt <= now, max 50, tenta gerar.
 * 5. Sucesso → status=SUCCESS, succeededAt=now.
 * 6. Falha → incrementa attempt, calcula próximo retry com backoff exponencial.
 * 7. Após max 5 attempts → status=FAILED, alerta no Sentry pra ação manual.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { generateSaleEntries } from "@/services/finance-entry.service";

const log = logger.child({ service: "finance-retry" });

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

/**
 * Backoff exponencial: 5min, 30min, 2h, 12h, 24h.
 */
function nextRetryDelay(attempt: number): number {
  const delays = [5, 30, 120, 720, 1440]; // minutos
  const mins = delays[Math.min(attempt, delays.length - 1)];
  return mins * 60 * 1000;
}

export interface ProcessRetriesResult {
  processed: number;
  succeeded: number;
  retried: number;
  failed: number;
}

export async function processRetries(): Promise<ProcessRetriesResult> {
  const now = new Date();

  const pending = await prisma.financeEntryRetry.findMany({
    where: {
      status: "PENDING",
      nextRetryAt: { lte: now },
    },
    orderBy: { nextRetryAt: "asc" },
    take: BATCH_SIZE,
  });

  let succeeded = 0;
  let retried = 0;
  let failed = 0;

  for (const retry of pending) {
    const newAttempt = retry.attempt + 1;
    try {
      await prisma.$transaction(
        async (tx) => {
          await generateSaleEntries(tx, retry.saleId, retry.companyId);
        },
        { timeout: 30_000 },
      );

      await prisma.financeEntryRetry.update({
        where: { id: retry.id },
        data: {
          status: "SUCCESS",
          attempt: newAttempt,
          succeededAt: new Date(),
          lastError: null,
        },
      });
      succeeded++;
      log.info("Retry sucesso", { saleId: retry.saleId, attempt: newAttempt });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (newAttempt >= MAX_ATTEMPTS) {
        await prisma.financeEntryRetry.update({
          where: { id: retry.id },
          data: {
            status: "FAILED",
            attempt: newAttempt,
            failedAt: new Date(),
            lastError: errorMessage,
          },
        });
        failed++;
        log.error("Retry esgotou tentativas — necessária correção manual", {
          saleId: retry.saleId,
          companyId: retry.companyId,
          attempt: newAttempt,
          lastError: errorMessage,
        });
        void captureException(err, {
          source: "finance-retry-exhausted",
          saleId: retry.saleId,
          companyId: retry.companyId,
        });
      } else {
        const delay = nextRetryDelay(newAttempt);
        await prisma.financeEntryRetry.update({
          where: { id: retry.id },
          data: {
            attempt: newAttempt,
            lastError: errorMessage,
            nextRetryAt: new Date(Date.now() + delay),
          },
        });
        retried++;
        log.warn("Retry falhou — agendado próximo", {
          saleId: retry.saleId,
          attempt: newAttempt,
          nextInMinutes: delay / 60_000,
          error: errorMessage,
        });
      }
    }
  }

  return {
    processed: pending.length,
    succeeded,
    retried,
    failed,
  };
}
