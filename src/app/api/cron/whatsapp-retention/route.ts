/**
 * Cron diário de retenção do inbox de WhatsApp (não lotar o banco).
 *
 * Apaga mensagens analisadas > N dias + teto de segurança. Ver
 * whatsapp-retention.service.ts. Auth: Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { runWhatsappRetention } from "@/services/whatsapp-retention.service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "cron/whatsapp-retention" });

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWhatsappRetention();
    log.info("Retenção do inbox processada", {
      deletedAnalyzed: result.deletedAnalyzed,
      deletedMaxAge: result.deletedMaxAge,
      deletedEmptyConversations: result.deletedEmptyConversations,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("Falha no cron de retenção", { error: errMsg });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
