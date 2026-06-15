/**
 * Cron diário das automações de WhatsApp (Fase B2).
 *
 * Varre as óticas habilitadas + conectadas e envia os 4 tipos cujas flags por
 * ótica estão ligadas (OS pronta, pós-venda, aniversário, crediário a vencer).
 * Idempotente via periodKey no WhatsappMessageLog — reexecução no mesmo dia não
 * reenvia.
 *
 * Autenticação: header Authorization: Bearer <CRON_SECRET>.
 */

import { NextResponse } from "next/server";
import { runWhatsappAutomations } from "@/services/whatsapp-automation.service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "cron/whatsapp-messages" });

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWhatsappAutomations();
    log.info("Automações de WhatsApp processadas", {
      companiesProcessed: result.companiesProcessed,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("Falha no cron de automações de WhatsApp", { error: errMsg });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
