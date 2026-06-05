/**
 * Q7.3 P2-8: cron diário pra marcar OS atrasadas (isDelayed=true + delayDays).
 *
 * Sem isso, dashboards/listas de OS não mostram badge "atrasada" automaticamente
 * — admin precisaria rodar um script manual. Agora roda 08:00 BRT (11:00 UTC).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serviceOrderService } from "@/services/service-order.service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ cron: "mark-delayed" });

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Varre todas as companies com plano ativo. accessEnabled filtra
    // trial expirado/canceladas — não desperdiça query em conta morta.
    const companies = await prisma.company.findMany({
      where: { accessEnabled: true },
      select: { id: true },
    });

    let totalMarked = 0;
    for (const company of companies) {
      try {
        const marked = await serviceOrderService.checkAndMarkDelayed(company.id);
        if (marked > 0) {
          totalMarked += marked;
          log.info("OS atrasadas marcadas", { companyId: company.id, marked });
        }
      } catch (err) {
        log.error("Falha ao marcar atrasadas para company", {
          companyId: company.id,
          error: err instanceof Error ? err.message : String(err),
        });
        // Continua varredura mesmo se uma company falhar.
      }
    }

    // Retenção de métricas: apaga MetricSample com mais de 30 dias (carona no cron diário — Vercel Hobby não permite cron sub-diário dedicado).
    const metricCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.metricSample.deleteMany({ where: { capturedAt: { lt: metricCutoff } } });

    return NextResponse.json({
      ok: true,
      companiesScanned: companies.length,
      totalMarked,
    });
  } catch (err) {
    log.error("Falha geral no cron mark-delayed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
