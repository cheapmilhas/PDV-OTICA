import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { recalcAllActiveHealthScores } from "@/lib/health-score";

const log = logger.child({ route: "cron/recalc-health" });

/**
 * GET /api/cron/recalc-health
 *
 * Executado 1x por dia pelo Vercel Cron. Recalcula o health score de todas as
 * empresas ativas e atualiza o cache na Company (healthScore/healthCategory/
 * healthUpdatedAt) — é o que mantém o dashboard admin (visão de saúde) FRESCO.
 * Sem este cron, o health só atualizava por clique manual e os números do
 * dashboard envelheciam.
 *
 * Autenticação: header Authorization: Bearer ${CRON_SECRET}.
 * Fail-CLOSED (padrão dos demais crons): sem secret configurado → 401, nunca
 * roda aberto. Diferente do dunning, este cron NÃO altera dinheiro/assinatura
 * (só recalcula métrica), mas mantemos fail-closed por consistência e porque é
 * uma operação cara (varre todas as empresas) que não deve ser disparável por
 * qualquer um.
 *
 * Agendado em vercel.json: { "path": "/api/cron/recalc-health", "schedule": "0 5 * * *" }
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) {
      log.error("CRON_SECRET não configurado — recalc-health recusado (fail-closed)");
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await recalcAllActiveHealthScores((companyId, error) =>
      log.error("Falha ao recalcular health de empresa", {
        companyId,
        error: error instanceof Error ? error.message : String(error),
      })
    );

    log.info("Health scores recalculados pelo cron", { ...result });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    log.error("Erro no cron recalc-health", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erro ao recalcular health scores" }, { status: 500 });
  }
}
