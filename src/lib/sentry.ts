/**
 * Wrapper fino sobre @sentry/nextjs.
 *
 * Sentry é inicializado via instrumentation.ts (server/edge) e
 * instrumentation-client.ts (browser) — esses módulos só ativam quando
 * SENTRY_DSN (server) ou NEXT_PUBLIC_SENTRY_DSN (client) estão setados.
 *
 * Se DSN ausente, Sentry.captureException é no-op e nada é enviado.
 */

import * as Sentry from "@sentry/nextjs";

export async function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
