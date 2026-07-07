import { NextResponse } from "next/server";
import { reconcilePendingBilling } from "@/services/billing-reconcile.service";
import { logger } from "@/lib/logger";
import { withHeartbeat } from "@/lib/cron-instrument";

const log = logger.child({ route: "cron/reconcile-billing" });

// O loop faz 1 chamada HTTP ao Asaas por subscription (sequencial). maxDuration alto
// + limite por execução conservador evitam timeout; o que sobrar processa no próximo cron.
export const maxDuration = 60;

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
    return await withHeartbeat("reconcile-billing", async () => {
      // Limite conservador por execução (1 HTTP/item, sequencial) — o resto fica para
      // o próximo cron. Idempotente, então reprocessar não causa dano.
      const summary = await reconcilePendingBilling({ limit: 80 });
      log.info("Reconciliação concluída", { ...summary });
      return NextResponse.json({ success: true, ...summary });
    });
  } catch (error) {
    log.error("Erro na reconciliação", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
