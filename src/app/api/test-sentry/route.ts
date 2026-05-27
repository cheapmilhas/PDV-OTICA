import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * TEMPORÁRIO — usado uma vez pra validar integração Sentry.
 * Remover depois que o primeiro erro aparecer no painel sentry.io.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Init inline como fallback — instrumentation.ts pode não ter rodado
// dependendo de como Next 16 carrega o hook register() com Turbopack.
// init() é idempotente: se já foi chamado pelo instrumentation, ignora.
if (process.env.SENTRY_DSN && !Sentry.getClient()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    enabled: true,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
  console.log("[test-sentry] Init inline acionado (instrumentation não rodou)");
} else {
  console.log("[test-sentry] Init prévio detectado — usando existente");
}

export async function GET() {
  console.log("[test-sentry] DSN presente?", !!process.env.SENTRY_DSN);
  console.log("[test-sentry] Client ativo?", !!Sentry.getClient());

  const err = new Error("Sentry test — delete me (rota /api/test-sentry)");

  const eventId = Sentry.captureException(err, {
    tags: { source: "test-sentry-route" },
    extra: { ts: new Date().toISOString() },
  });
  console.log("[test-sentry] eventId capturado:", eventId);

  const flushed = await Sentry.flush(5000);
  console.log("[test-sentry] flush retornou:", flushed);

  throw err;
}
