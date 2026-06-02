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

/**
 * Envia uma mensagem (não-exceção) ao Sentry. No-op sem DSN.
 * Usado pelo tenant-guard para registrar queries sem companyId.
 */
export function captureMessage(
  message: string,
  options?: { level?: "info" | "warning" | "error"; extra?: Record<string, unknown> },
): void {
  Sentry.captureMessage(message, {
    level: options?.level ?? "info",
    ...(options?.extra ? { extra: options.extra } : {}),
  });
}

/**
 * Anexa contexto multi-tenant ao escopo do Sentry (Fase 4.1): todo erro
 * capturado depois disto carrega qual cliente/usuário/rota originou —
 * essencial para debugar incidentes por cliente do SaaS.
 */
export function setTenantContext(ctx: {
  companyId?: string | null;
  userId?: string | null;
  role?: string | null;
  route?: string | null;
}): void {
  if (ctx.userId) {
    Sentry.setUser({ id: ctx.userId, ...(ctx.role ? { role: ctx.role } : {}) });
  }
  Sentry.setTags({
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    ...(ctx.route ? { route: ctx.route } : {}),
  });
}
