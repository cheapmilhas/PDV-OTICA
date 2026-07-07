/**
 * Processa a fila transacional de emails.
 *
 * Autenticacao: header Authorization: Bearer <CRON_SECRET>.
 */

import { NextResponse } from "next/server";
import { processEmailQueue } from "@/services/email-queue.service";
import { logger } from "@/lib/logger";
import { withHeartbeat } from "@/lib/cron-instrument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "cron/email-queue" });

function parseLimit(request: Request): number | undefined {
  const url = new URL(request.url);
  const raw = url.searchParams.get("limit");
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return await withHeartbeat("email-queue", async () => {
      const result = await processEmailQueue(parseLimit(request));
      log.info("Fila de emails processada", { ...result });
      return NextResponse.json({ ok: true, ...result });
    });
  } catch (error) {
    log.error("Falha geral no processamento da fila de emails", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
