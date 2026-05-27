/**
 * Bridge mínimo para Sentry.
 *
 * Não importa @sentry/nextjs estaticamente pra não obrigar o pacote no
 * bundle enquanto o cliente não decidiu ativar. Quando SENTRY_DSN estiver
 * presente, faz lazy-load via dynamic import (uma vez) e encaminha eventos.
 *
 * Para ativar full integration:
 *   1. npm i @sentry/nextjs
 *   2. npx @sentry/wizard@latest -i nextjs (gera sentry.*.config.ts)
 *   3. defina SENTRY_DSN no Vercel
 *
 * Até lá, captureException é no-op e o logger continua sendo a fonte de verdade.
 */

import { logger } from "@/lib/logger";

const log = logger.child({ module: "sentry-bridge" });

type SentryLike = {
  captureException: (err: unknown, ctx?: Record<string, unknown>) => void;
};

let cached: SentryLike | null | undefined;

async function load(): Promise<SentryLike | null> {
  if (cached !== undefined) return cached;
  if (!process.env.SENTRY_DSN) {
    cached = null;
    return null;
  }
  try {
    // `eval("require")` bypassa o resolver estático do webpack/turbopack — sem
    // isso, o build tenta resolver @sentry/nextjs em compile time e falha
    // quando o pacote não está instalado (que é o estado padrão até ativar).
    const requireFn: NodeRequire = eval("require");
    const mod = requireFn("@sentry/nextjs") as {
      captureException: (err: unknown, hint?: { extra?: Record<string, unknown> }) => void;
    };
    cached = {
      captureException(err, ctx) {
        try {
          mod.captureException(err, ctx ? { extra: ctx } : undefined);
        } catch {
          // Sentry pode não estar inicializado — ignora silenciosamente.
        }
      },
    };
    log.info("Sentry bridge inicializado");
    return cached;
  } catch {
    log.warn("SENTRY_DSN setado mas @sentry/nextjs não está instalado — rodando em no-op");
    cached = null;
    return null;
  }
}

export async function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const sentry = await load();
  if (sentry) sentry.captureException(err, context);
}
