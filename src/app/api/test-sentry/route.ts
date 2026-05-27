import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * TEMPORÁRIO — usado uma vez pra validar integração Sentry.
 * Remover depois que o primeiro erro aparecer no painel sentry.io.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  console.log("[test-sentry] handler entrou");
  console.log("[test-sentry] DSN presente?", !!process.env.SENTRY_DSN);

  // Lazy init — instrumentation.ts não rodou em Next 16, init no top-level
  // estava abortando o lambda antes do handler executar.
  if (process.env.SENTRY_DSN && !Sentry.getClient()) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      enabled: true,
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
    console.log("[test-sentry] init inline acionado");
  } else {
    console.log("[test-sentry] init previo detectado");
  }

  console.log("[test-sentry] client ativo?", !!Sentry.getClient());

  const err = new Error("Sentry test — delete me (rota /api/test-sentry)");

  const eventId = Sentry.captureException(err, {
    tags: { source: "test-sentry-route" },
  });
  console.log("[test-sentry] eventId:", eventId);

  const flushed = await Sentry.flush(5000);
  console.log("[test-sentry] flush:", flushed);

  return NextResponse.json(
    { ok: false, eventId, flushed },
    { status: 500 },
  );
}
