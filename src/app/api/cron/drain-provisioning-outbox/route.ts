import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withHeartbeat } from "@/lib/cron-instrument";
import { drainProvisioningOutbox } from "@/services/provisioning-outbox.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = logger.child({ cron: "drain-provisioning-outbox" });

/**
 * GET /api/cron/drain-provisioning-outbox
 *
 * Worker (cron horário) do provisionamento Vis → Domus (F2). Sem ele, uma
 * Company medical cujo fast-path síncrono falhou fica PROVISIONING pra sempre
 * (P0#2). Drena as linhas vencidas do ProvisioningOutbox — o claim atômico em
 * runProvisioningOnce garante que fast-path e cron não processem a mesma linha
 * em paralelo, e linhas terminais (PROVISION_FAILED) não são repescadas.
 *
 * Auth: Bearer CRON_SECRET, fail-CLOSED (padrão dos outros crons).
 * Auto-instrumentado com withHeartbeat (Saúde do Sistema).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) {
      log.error("CRON_SECRET não configurado — drain recusado (fail-closed)");
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return await withHeartbeat("drain-provisioning-outbox", async () => {
      const processed = await drainProvisioningOutbox();
      log.info("batch de provisionamento processado", { processed });
      return NextResponse.json({ ok: true, processed });
    });
  } catch (err) {
    log.error("falha geral no worker de drain do provisionamento", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
