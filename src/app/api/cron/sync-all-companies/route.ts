/**
 * Sincronização automática de setup — roda diariamente (0 4 * * *).
 * Lê AutoSyncConfig: desligado → no-op; dryRun → só relatório.
 * Autenticação: Authorization: Bearer <CRON_SECRET> (fail-closed).
 */
import { NextResponse } from "next/server";
import { syncAllCompanies } from "@/services/company-resync.service";
import { logger } from "@/lib/logger";
import { withHeartbeat } from "@/lib/cron-instrument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300s é válido em TODOS os planos da Vercel com Fluid Compute (runtime padrão
// desde 2025; Hobby vai até 800s). Loop sequencial por empresa: folga garantida
// mesmo com a base crescendo.
export const maxDuration = 300;

const log = logger.child({ route: "cron/sync-all-companies" });

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) {
      log.error("CRON_SECRET não configurado — sync-all-companies recusado (fail-closed)");
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await withHeartbeat("sync-all-companies", async () => {
      const result = await syncAllCompanies();
      log.info("Auto-sync executado", { ...result });
      return NextResponse.json({ success: true, ...result });
    });
  } catch (error) {
    log.error("Erro geral no auto-sync", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erro no auto-sync" }, { status: 500 });
  }
}
