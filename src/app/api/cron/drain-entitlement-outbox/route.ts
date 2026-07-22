import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withHeartbeat } from "@/lib/cron-instrument";
import { runOutboxDrainBatch, runRevocationDrainBatch } from "@/lib/entitlement-outbox-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = logger.child({ cron: "drain-entitlement-outbox" });

/**
 * GET /api/cron/drain-entitlement-outbox
 *
 * Worker (cron horario) que DRENA o EntitlementOutbox: le um batch ordenado por
 * seq, publica cada company via tryPublishEntitlementForCompany e apaga a linha
 * SO em published|noop, com delete condicional por (companyId, seq). Se o trigger
 * re-enfileirou durante o publish (seq maior), o delete nao casa e a linha fica
 * pro proximo tick — nenhuma transicao se perde. Fecha a lacuna do canal de
 * inadimplencia (dunning/webhook mudam status sem publicar).
 *
 * Auth: Bearer CRON_SECRET, fail-CLOSED (padrao dos outros crons). Auto-instrumentado
 * com withHeartbeat (Saude do Sistema).
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
    return await withHeartbeat("drain-entitlement-outbox", async () => {
      const publish = await runOutboxDrainBatch();
      const revocation = await runRevocationDrainBatch();
      log.info("batch de drain processado", { publish, revocation });
      return NextResponse.json({ ok: true, publish, revocation });
    });
  } catch (err) {
    log.error("falha geral no worker de drain do outbox", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
