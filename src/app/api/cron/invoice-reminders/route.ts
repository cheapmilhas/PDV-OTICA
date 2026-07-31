import { NextResponse } from "next/server";
import { runInvoiceReminders } from "@/services/invoice-reminders.service";
import { logger } from "@/lib/logger";
import { withHeartbeat } from "@/lib/cron-instrument";

const log = logger.child({ route: "cron/invoice-reminders" });
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/invoice-reminders
 *
 * Duas coisas, nesta ordem:
 *
 * 1. **Fase de GERAÇÃO** (`billing-generation-phase.service.ts`) — o motor de
 *    obrigação e o modo sombra, cada um atrás da sua própria env var. É o
 *    chamador que faltava: até a Task 7, `runObligationsForCompanies` e
 *    `runShadowForCompanies` não eram invocados de lugar nenhum.
 * 2. **Lembretes de fatura** — "fatura criada" e "vence em breve", gateados por
 *    `invoiceGenerationEnabled` (`SaasEmailConfig`).
 *
 * 🚨 A fase 1 roda ANTES do early return da fase 2, e isso é decisão, não
 * acidente: `invoiceGenerationEnabled` é editada numa tela chamada "E-mails", e
 * pendurar o motor de cobrança nela transformaria um botão de e-mail em
 * "desligar o faturamento". Ver a nota em `runInvoiceReminders`.
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
    return await withHeartbeat("invoice-reminders", async () => {
      const summary = await runInvoiceReminders();
      log.info("invoice-reminders concluído", { ...summary });
      return NextResponse.json({ success: true, ...summary });
    });
  } catch (error) {
    log.error("Erro no invoice-reminders", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
