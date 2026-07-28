import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { trialAction } from "@/services/subscription-watch.service";
import { notifyCompany } from "@/services/saas-notification.service";
import { alertOperators } from "@/services/trial-alert.service";
import { withHeartbeat } from "@/lib/cron-instrument";
import { resolveTrialNotice } from "@/lib/trial-notice-target";

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
          company: { select: { name: true, platformProduct: true } },
        },
      });

      // `alerted` conta notificações CRIADAS (não trials): quando o alerta já
      // existe, a contagem não sobe — assim o retorno do cron distingue
      // "avisei agora" de "já estava avisado".
      const summary = { total: trials.length, ending: 0, expired: 0, alerted: 0 };
      for (const sub of trials) {
        const action = trialAction(sub.trialEndsAt, now);
        if (!action) continue;
        const name = sub.company?.name ?? "Cliente";
        // Para onde o aviso manda o cliente depende do PRODUTO dele: o cliente
        // medical usa o Domus e não tem usuário no app Vis — CTA e in-app do
        // Vis não servem para ele. Ver trial-notice-target.ts.
        // Sem `?? "VIS_APP"`: a relação company e o campo platformProduct são
        // obrigatórios no schema. Um default aqui seria fail-OPEN — dado
        // inconsistente viraria "é ótica" e receberia o CTA errado calado.
        const notice = resolveTrialNotice(sub.company.platformProduct, base);
        try {
          if (action === "TRIAL_ENDING") {
            const daysLeft = Math.max(
              0,
              Math.ceil((sub.trialEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
            );
            await notifyCompany(
              sub.companyId,
              "TRIAL_ENDING",
              notice.subscribeUrl
                ? { name, daysLeft, subscribeUrl: notice.subscribeUrl }
                : { name, daysLeft },
              {
                periodKey: "trial-ending",
                // Sem link in-app (medical) → só e-mail. A notificação in-app é
                // lida DENTRO do app Vis; criá-la para quem não entra lá seria
                // registrar um aviso que ninguém nunca vê.
                channels: notice.inappLink ? ["email", "inapp"] : ["email"],
                ...(notice.inappLink && {
                  inapp: {
                    title: "Seu teste está acabando",
                    message: `Faltam ${daysLeft} dia(s) do seu período de teste.`,
                    link: notice.inappLink,
                  },
                }),
                ...(notice.templateOverride && {
                  templateOverride: { template: notice.templateOverride.ending },
                }),
              }
            );
            // N5: avisa o OPERADOR, além do cliente.
            //
            // 🔑 SÓ neste ramo, nunca no de expiração. O outro ramo VIRA O
            // STATUS do cliente; misturar o alerta ali faria uma falha de
            // notificação interna interromper a transição de estado de uma
            // assinatura — ou, na ordem inversa, perder o alerta para sempre.
            // Aqui o alerta é um efeito colateral puro: se falhar, o pior caso
            // é o operador não ser avisado hoje, e o cron tenta de novo amanhã.
            summary.alerted += await alertOperators({
              subscriptionId: sub.id,
              companyId: sub.companyId,
              companyName: name,
              trialEndsAt: sub.trialEndsAt!,
              daysLeft,
            });
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
              notice.subscribeUrl
                ? { name, subscribeUrl: notice.subscribeUrl }
                : { name },
              {
                periodKey: "trial-expired",
                channels: notice.inappLink ? ["email", "inapp"] : ["email"],
                ...(notice.inappLink && {
                  inapp: {
                    title: "Seu teste terminou",
                    message: "Assine para continuar usando o Vis.",
                    link: notice.inappLink,
                  },
                }),
                ...(notice.templateOverride && {
                  templateOverride: { template: notice.templateOverride.expired },
                }),
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
