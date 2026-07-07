/**
 * Acionador da fila de WhatsApp (anti-bloqueio Fase 1).
 *
 * Chamado por um acionador EXTERNO (ex.: cron-job.org) a cada ~3 min. Cada
 * chamada processa 1 mensagem por ótica (claim atômico, horário comercial, teto
 * diário) — o RITMO de envio vem do intervalo do acionador, sem sleep no código.
 * Também há um cron nativo 1×/dia como rede de segurança (ver vercel.json).
 *
 * Autenticação: header Authorization: Bearer <CRON_SECRET>.
 */

import { NextResponse } from "next/server";
import { processWhatsappQueue } from "@/services/whatsapp-queue-processor";
import { logger } from "@/lib/logger";
import { withHeartbeat } from "@/lib/cron-instrument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "cron/whatsapp-dispatch" });

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return await withHeartbeat("whatsapp-dispatch", async () => {
      const result = await processWhatsappQueue();
      log.info("Fila de WhatsApp processada", {
        skippedOutOfHours: result.skippedOutOfHours,
        claimed: result.claimed,
        sent: result.sent,
        skipped: result.skipped,
        failed: result.failed,
        pendingRestantes: result.pendingRestantes,
      });
      return NextResponse.json({ ok: true, ...result });
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("Falha no acionador da fila de WhatsApp", { error: errMsg });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
