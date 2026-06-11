import { NextResponse } from "next/server";
import { runInvoiceReminders } from "@/services/invoice-reminders.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "cron/invoice-reminders" });
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/invoice-reminders
 *
 * Dispara o motor de lembretes de fatura: envia e-mail de "fatura criada" para
 * assinantes com cobrança Asaas gerada no ciclo atual (dívida Fase 2 - Task 6).
 *
 * Autenticação: fail-CLOSED com CRON_SECRET (Bearer) — igual dunning/reconcile-billing.
 * vercel.json: { "path": "/api/cron/invoice-reminders", "schedule": "0 10 * * *" }
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) {
      log.error("CRON_SECRET não configurado — invoice-reminders recusado (fail-closed)");
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runInvoiceReminders();
    log.info("invoice-reminders concluído", { ...summary });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    log.error("Erro no invoice-reminders", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
