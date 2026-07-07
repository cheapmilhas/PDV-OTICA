import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { trialAction } from "@/services/subscription-watch.service";
import { notifyCompany } from "@/services/saas-notification.service";
import { withHeartbeat } from "@/lib/cron-instrument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const log = logger.child({ route: "cron/subscription-watch" });

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return await withHeartbeat("subscription-watch", async () => {
      const now = new Date();
      const base = process.env.NEXTAUTH_URL ?? "https://app.vis.app.br";
      const trials = await prisma.subscription.findMany({
        where: { status: "TRIAL", trialEndsAt: { not: null } },
        select: {
          id: true,
          companyId: true,
          trialEndsAt: true,
          company: { select: { name: true } },
        },
      });

      const summary = { total: trials.length, ending: 0, expired: 0 };
      for (const sub of trials) {
        const action = trialAction(sub.trialEndsAt, now);
        if (!action) continue;
        const name = sub.company?.name ?? "Cliente";
        try {
          if (action === "TRIAL_ENDING") {
            const daysLeft = Math.max(
              0,
              Math.ceil((sub.trialEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
            );
            await notifyCompany(
              sub.companyId,
              "TRIAL_ENDING",
              { name, daysLeft, subscribeUrl: `${base}/dashboard/upgrade` },
              {
                periodKey: "trial-ending",
                channels: ["email", "inapp"],
                inapp: {
                  title: "Seu teste está acabando",
                  message: `Faltam ${daysLeft} dia(s) do seu período de teste.`,
                  link: "/dashboard/upgrade",
                },
              }
            );
            summary.ending++;
          } else {
            // ORDEM IMPORTA: notificar ANTES de virar o status. Se virássemos o status
            // primeiro e o email fosse SKIPPED naquele instante (ex.: master_off), na
            // próxima run a sub já não é TRIAL e o TRIAL_EXPIRED nunca seria reenviado —
            // email perdido pra sempre. Como notifyCompany é idempotente via SaasEmailLog
            // (periodKey "trial-expired"), chamá-lo antes não duplica entre runs.
            await notifyCompany(
              sub.companyId,
              "TRIAL_EXPIRED",
              { name, subscribeUrl: `${base}/dashboard/upgrade` },
              {
                periodKey: "trial-expired",
                channels: ["email", "inapp"],
                inapp: {
                  title: "Seu teste terminou",
                  message: "Assine para continuar usando o Vis.",
                  link: "/dashboard/upgrade",
                },
              }
            );
            // persiste a transição de status (idempotente: só TRIAL → TRIAL_EXPIRED)
            await prisma.subscription.updateMany({
              where: { id: sub.id, status: "TRIAL" },
              data: { status: "TRIAL_EXPIRED" },
            });
            summary.expired++;
          }
        } catch (err) {
          log.error("Erro no subscription-watch", { subId: sub.id, err: String(err) });
        }
      }
      return NextResponse.json({ ok: true, ...summary, runAt: now.toISOString() });
    });
  } catch (err) {
    log.error("Erro geral no cron subscription-watch", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
