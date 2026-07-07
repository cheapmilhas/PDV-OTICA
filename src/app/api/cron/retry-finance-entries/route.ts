/**
 * Q7.1 P1-10: cron pra processar retries de FinanceEntry.
 *
 * Agendado em vercel.json. Roda a cada 15min — pega registros PENDING
 * com nextRetryAt <= now (max 50 por vez) e tenta gerar de novo.
 *
 * Autenticação: header Authorization: Bearer <CRON_SECRET>.
 * Vercel Cron envia esse header automaticamente.
 */

import { NextResponse } from "next/server";
import { processRetries } from "@/services/finance-retry.service";
import { logger } from "@/lib/logger";
import { withHeartbeat } from "@/lib/cron-instrument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ cron: "retry-finance-entries" });

export async function GET(request: Request) {
  // Auth: aceitar Vercel Cron (header automático) ou call manual com bearer.
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return await withHeartbeat("retry-finance-entries", async () => {
      const result = await processRetries();
      log.info("Batch processado", { ...result });
      return NextResponse.json({ ok: true, ...result });
    });
  } catch (err) {
    log.error("Falha geral no processamento de retries", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "processing failed" },
      { status: 500 },
    );
  }
}
