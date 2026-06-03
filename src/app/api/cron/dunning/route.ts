import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ActivityType, ActorType, AdminNotificationType, CompanyNotificationType } from "@prisma/client";
import { nextDunningStage, canCancel, dunningMessage, SUSPEND_DAYS, CANCEL_DAYS } from "@/lib/dunning";
import { createCompanyNotification } from "@/services/company-notification.service";
import { createAdminNotification } from "@/services/admin-notification.service";
import { logActivity } from "@/services/activity-log.service";

const log = logger.child({ route: "cron/dunning" });

/**
 * GET /api/cron/dunning
 *
 * Executado diariamente pelo Vercel Cron. Régua de inadimplência COMUNICATIVA (F5):
 * - 3/7/14 dias: aviso in-app ao cliente (escalonado). Só avança o estágio se notificou.
 * - 14+ dias (com aviso 14 registrado): SUSPENDED + alerta ao admin.
 * - 30+ dias (com avisos dados, lastStage>=14): CANCELED + alerta ao admin + aviso ao cliente.
 *   Sem avisos registrados → NÃO cancela: envia o aviso pendente e adia (régua exige comunicar antes).
 *
 * Idempotente: lastDunningStage só avança quando o aviso é criado; CANCELED sai do conjunto;
 * SUSPENDED PERMANECE no conjunto para continuar a contar até 30d.
 *
 * Autenticação: header Authorization: Bearer ${CRON_SECRET} (fail-closed).
 */
export async function GET(request: Request) {
  // Fail-CLOSED: este cron SUSPENDE/CANCELA assinaturas. Sem CRON_SECRET → trancado.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) {
      log.error("CRON_SECRET não configurado — dunning recusado (fail-closed)");
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Inclui SUSPENDED: sem isso, quem é suspenso aos 14d sai do conjunto e nunca
  // chega aos 30d → cancelamento jamais dispara.
  const overdue = await prisma.subscription.findMany({
    where: { status: { in: ["PAST_DUE", "SUSPENDED"] }, pastDueSince: { not: null } },
    select: { id: true, companyId: true, pastDueSince: true, status: true, lastDunningStage: true },
  });

  const summary = {
    total: overdue.length,
    noticeSent: 0,
    suspended: 0,
    canceled: 0,
    cancelDeferred: 0,
    errors: 0,
  };

  for (const sub of overdue) {
    try {
      if (!sub.pastDueSince) continue;

      const daysOverdue = Math.floor((now.getTime() - sub.pastDueSince.getTime()) / (24 * 60 * 60 * 1000));
      let lastStage = sub.lastDunningStage;

      // 1) Aviso ao cliente no marco devido. Só avança o estágio se NOTIFICOU.
      const stage = nextDunningStage(daysOverdue, lastStage);
      if (stage !== null) {
        const { title, message } = dunningMessage(stage, daysOverdue);
        const ok = await createCompanyNotification({
          companyId: sub.companyId,
          userId: null, // broadcast: billing é assunto da empresa toda
          type: CompanyNotificationType.BILLING,
          title,
          message,
          link: "/dashboard/configuracoes",
          metadata: { stage, daysOverdue },
        });
        if (ok) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { lastDunningStage: stage },
          });
          lastStage = stage;
          summary.noticeSent++;
          await logActivity({
            companyId: sub.companyId,
            type: ActivityType.INVOICE_OVERDUE,
            title: `Aviso de inadimplência (${stage}d) enviado`,
            actorType: ActorType.SYSTEM,
            detail: { stage, daysOverdue },
          });
          await prisma.globalAudit.create({
            data: {
              actorType: "SYSTEM",
              action: "DUNNING_NOTICE",
              companyId: sub.companyId,
              metadata: { subscriptionId: sub.id, stage, daysOverdue },
            },
          }).catch(() => {});
        }
      }

      // 2) Suspensão aos 14d — só se o aviso de 14 já foi registrado (não suspende sem avisar).
      if (daysOverdue >= SUSPEND_DAYS && (lastStage ?? 0) >= SUSPEND_DAYS && sub.status !== "SUSPENDED") {
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: "SUSPENDED" } });
        summary.suspended++;
        await createAdminNotification({
          type: AdminNotificationType.INVOICE_OVERDUE,
          title: "Assinatura suspensa por inadimplência",
          message: `Empresa ${sub.companyId} suspensa após ${daysOverdue} dias de atraso.`,
          link: `/admin/clientes/${sub.companyId}`,
          metadata: { companyId: sub.companyId, subscriptionId: sub.id, daysOverdue },
        });
        await logActivity({
          companyId: sub.companyId,
          type: ActivityType.COMPANY_SUSPENDED,
          title: `Assinatura suspensa (${daysOverdue}d de atraso)`,
          actorType: ActorType.SYSTEM,
        });
      }

      // 3) Cancelamento aos 30d — só com avisos registrados (canCancel exige lastStage>=14).
      if (daysOverdue >= CANCEL_DAYS) {
        if (canCancel(daysOverdue, lastStage)) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { status: "CANCELED", canceledAt: now, cancelReason: "Inadimplência > 30 dias" },
          });
          summary.canceled++;
          await createAdminNotification({
            type: AdminNotificationType.SUBSCRIPTION_CANCELED,
            title: "Assinatura cancelada por inadimplência",
            message: `Empresa ${sub.companyId} cancelada após ${daysOverdue} dias de atraso.`,
            link: `/admin/clientes/${sub.companyId}`,
            metadata: { companyId: sub.companyId, subscriptionId: sub.id, daysOverdue },
          });
          await createCompanyNotification({
            companyId: sub.companyId,
            userId: null,
            type: CompanyNotificationType.BILLING,
            title: "Assinatura cancelada",
            message: `Sua assinatura foi cancelada após ${daysOverdue} dias de atraso no pagamento.`,
            link: "/dashboard/configuracoes",
            metadata: { daysOverdue },
          });
          await logActivity({
            companyId: sub.companyId,
            type: ActivityType.SUBSCRIPTION_CANCELED,
            title: `Assinatura cancelada por inadimplência (${daysOverdue}d)`,
            actorType: ActorType.SYSTEM,
          });
          await prisma.globalAudit.create({
            data: {
              actorType: "SYSTEM",
              action: "DUNNING_CANCELED",
              companyId: sub.companyId,
              metadata: { subscriptionId: sub.id, daysOverdue },
            },
          }).catch(() => {});
        } else {
          // >=30d mas sem avisos registrados → adia o cancelamento (já enviamos o aviso
          // pendente acima, se aplicável). Cancela numa próxima run quando lastStage>=14.
          summary.cancelDeferred++;
          log.warn("Cancelamento adiado: avisos de dunning ainda não registrados", {
            subId: sub.id,
            daysOverdue,
            lastStage,
          });
        }
      }
    } catch (err) {
      summary.errors++;
      log.error("Erro processando dunning", { subId: sub.id, err: String(err) });
    }
  }

  return NextResponse.json({ ok: true, ...summary, runAt: now.toISOString() });
}
