import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * TEMPORÁRIO — usado uma vez pra validar integração Sentry.
 * Remover depois que o primeiro erro aparecer no painel sentry.io.
 *
 * Como testar: GET https://SEU-DOMINIO/api/test-sentry
 * Esperado: 500 + erro "Sentry test — delete me" aparece em sentry.io Issues.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const err = new Error("Sentry test — delete me (rota /api/test-sentry)");

  // Captura manual + flush — fallback caso captureRequestError do
  // instrumentation.ts não pegue (Edge runtime, throw fora de async, etc).
  Sentry.captureException(err, {
    tags: { source: "test-sentry-route" },
    extra: { ts: new Date().toISOString() },
  });

  // Aguarda envio antes do lambda morrer (serverless mata processo rápido).
  await Sentry.flush(2000);

  throw err;
}
