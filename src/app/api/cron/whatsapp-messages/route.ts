/**
 * Cron diário das automações de WhatsApp (Fase B2 + anti-bloqueio Fase 1).
 *
 * Varre as óticas habilitadas + conectadas e ENFILEIRA (status PENDING em
 * WhatsappMessageLog) os 4 tipos cujas flags por ótica estão ligadas (OS pronta,
 * pós-venda, aniversário, crediário a vencer). NÃO envia direto: o envio aos
 * poucos (anti-bloqueio) fica a cargo do processador da fila, acionado pelo
 * endpoint /api/cron/whatsapp-dispatch. Idempotente via periodKey no
 * WhatsappMessageLog — reexecução no mesmo dia não reenfileira.
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
    // Modo enqueue: cria PENDING sem enviar. O envio aos poucos é do dispatch.
    const result = await runWhatsappAutomations(new Date(), { enqueue: true });
    log.info("Automações de WhatsApp enfileiradas", {
      companiesProcessed: result.companiesProcessed,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("Falha no cron de automações de WhatsApp", { error: errMsg });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
