import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "cron/dunning" });

/**
 * GET /api/cron/dunning
 *
 * Executado diariamente pelo Vercel Cron. Processa assinaturas em atraso:
 * - PAST_DUE por 3-7 dias: log/email lembrete (TODO email)
 * - PAST_DUE por 14+ dias: marca SUSPENDED
 * - PAST_DUE por 30+ dias: rebaixa para plano básico ou CANCELED
 *
 * Autenticação: header Authorization: Bearer ${CRON_SECRET}
 * Configurar em vercel.json:
 *   { "crons": [{ "path": "/api/cron/dunning", "schedule": "0 8 * * *" }] }
 */
export async function GET(request: Request) {
  // H7: fail-CLOSED. Este cron CANCELA/SUSPENDE assinaturas — sem CRON_SECRET
  // configurado, qualquer um pode disparar GET e suspender empresas em massa.
  // Antes o guard só validava SE o secret existisse (fail-open). Agora a
  // ausência do secret é erro de configuração e o endpoint fica trancado.
  // Status 401 (não 503) para alinhar com mark-delayed e retry-finance-entries.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) {
      log.error("CRON_SECRET não configurado — dunning recusado (fail-closed)");
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const days = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  // Carrega subscriptions PAST_DUE
  const pastDue = await prisma.subscription.findMany({
    where: { status: "PAST_DUE", pastDueSince: { not: null } },
    select: {
      id: true,
      companyId: true,
      pastDueSince: true,
      planId: true,
    },
  });

  const summary = {
    total: pastDue.length,
    reminderSent: 0,
    suspended: 0,
    canceled: 0,
    errors: 0,
  };

  for (const sub of pastDue) {
    try {
      if (!sub.pastDueSince) continue;

      const daysOverdue = Math.floor(
        (now.getTime() - sub.pastDueSince.getTime()) / (24 * 60 * 60 * 1000),
      );

      if (daysOverdue >= 30) {
        // 30+ dias: cancela ou rebaixa
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: "CANCELED",
            canceledAt: now,
            cancelReason: "Inadimplência > 30 dias",
          },
        });
        summary.canceled++;
        log.warn("Subscription cancelada por inadimplência", { subId: sub.id, daysOverdue });
      } else if (daysOverdue >= 14) {
        // 14-29 dias: suspende
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "SUSPENDED" },
        });
        summary.suspended++;
        log.info("Subscription suspensa", { subId: sub.id, daysOverdue });
      } else if (daysOverdue >= 3) {
        // 3-13 dias: lembrete (TODO: integrar email/WhatsApp)
        summary.reminderSent++;
        log.info("Lembrete de inadimplência (TODO email)", { subId: sub.id, daysOverdue });
      }
    } catch (err) {
      summary.errors++;
      log.error("Erro processando dunning", { subId: sub.id, err: String(err) });
    }
  }

  return NextResponse.json({ ok: true, ...summary, runAt: now.toISOString() });
}
