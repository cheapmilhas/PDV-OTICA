import { NextResponse } from "next/server";
import { reconcilePendingBilling } from "@/services/billing-reconcile.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "cron/reconcile-billing" });

/**
 * GET /api/cron/reconcile-billing
 *
 * Reconcilia subscriptions com billingSyncPending=true contra o Asaas (dívida F1):
 * compara o valor/ciclo esperado materializado com o que o Asaas reporta; baixa a
 * flag quando o Asaas já reflete o esperado, audita divergências.
 *
 * Autenticação: fail-CLOSED com CRON_SECRET (Bearer) — igual dunning.
 * vercel.json: { "path": "/api/cron/reconcile-billing", "schedule": "0 6 * * *" }
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) {
      log.error("CRON_SECRET não configurado — reconcile-billing recusado (fail-closed)");
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await reconcilePendingBilling({ limit: 200 });
    log.info("Reconciliação concluída", { ...summary });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    log.error("Erro na reconciliação", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
