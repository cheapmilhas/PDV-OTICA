import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withHeartbeat } from "@/lib/cron-instrument";
import { runRetryBatch } from "@/lib/domus-plan-change/retry-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cada op pode gastar até ASAAS_TIMEOUT_MS (30s) no Asaas; com batch 5 o pior caso
// é ~150s. maxDuration folgado (achado Codex P1 operacional): a função não pode ser
// morta no meio de uma cobrança/aplicação. 300s é o teto atual da plataforma.
export const maxDuration = 300;

const log = logger.child({ cron: "plan-change-retry" });

/**
 * GET /api/cron/plan-change-retry
 *
 * FASE E — worker de retry da saga de troca de plano (self-service Domus→Vis).
 * Retoma ops que travaram (endpoint morreu no meio, falha transitória do Asaas)
 * SEM depender de um replay do Domus. Fecha a janela "cobrado mas não aplicado".
 *
 * NÃO tem gate do kill-switch VIS_TIER_SELF_SERVICE_ENABLED (achado Codex P0 #7):
 * uma op só existe se foi criada com o switch ON, e uma vez cobrada TEM que
 * completar mesmo com o switch OFF — senão desligar o switch abandonaria clientes
 * cobrados sem plano. A política de qual estado pode avançar mora no executor.
 *
 * Auth: Bearer CRON_SECRET, fail-CLOSED (padrão dos outros crons). Vercel Cron
 * manda o header; para alta frequência usa-se cron-job.org (Vercel Hobby=1×/dia).
 * Auto-instrumentado com withHeartbeat (Saúde do Sistema).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) {
      log.error("CRON_SECRET não configurado — plan-change-retry recusado (fail-closed)");
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return await withHeartbeat("plan-change-retry", async () => {
      const batch = await runRetryBatch();
      log.info("batch de retry processado", { ...batch });
      return NextResponse.json({ ok: true, ...batch });
    });
  } catch (err) {
    log.error("falha geral no worker de retry de troca de plano", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
