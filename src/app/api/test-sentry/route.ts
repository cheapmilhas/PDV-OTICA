import { NextResponse } from "next/server";

/**
 * TEMPORÁRIO — usado uma vez pra validar integração Sentry.
 * Remover depois que o primeiro erro aparecer no painel sentry.io.
 *
 * Como testar: GET https://SEU-DOMINIO/api/test-sentry
 * Esperado: 500 + erro "Sentry test — delete me" aparece em sentry.io Issues.
 */
export async function GET() {
  throw new Error("Sentry test — delete me (rota /api/test-sentry)");
  // unreachable
  return NextResponse.json({ ok: true });
}
