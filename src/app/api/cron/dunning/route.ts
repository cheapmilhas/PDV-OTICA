import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  ActivityType,
  ActorType,
  AdminNotificationType,
  CompanyNotificationType,
} from "@prisma/client";
import {
  nextDunningStage,
  canCancel,
  dunningMessage,
  SUSPEND_DAYS,
  CANCEL_DAYS,
} from "@/lib/dunning";
import { createCompanyNotification } from "@/services/company-notification.service";
import { createAdminNotification } from "@/services/admin-notification.service";
import { logActivity } from "@/services/activity-log.service";
import { notifyCompany } from "@/services/saas-notification.service";
import { withHeartbeat } from "@/lib/cron-instrument";
import { publishEntitlementForCompany } from "@/lib/vis-domus-publisher";

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

  try {
    return await withHeartbeat("dunning", async () => {
      const now = new Date();
      const base = process.env.NEXTAUTH_URL ?? "https://app.vis.app.br";

      // Inclui SUSPENDED: sem isso, quem é suspenso aos 14d sai do conjunto e nunca
      // chega aos 30d → cancelamento jamais dispara.
      const overdue = await prisma.subscription.findMany({
        where: { status: { in: ["PAST_DUE", "SUSPENDED"] }, pastDueSince: { not: null } },
        select: {
          id: true,
          companyId: true,
          pastDueSince: true,
          status: true,
          lastDunningStage: true,
        },
      });

      const summary = {
        total: overdue.length,
        noticeSent: 0,
        suspended: 0,
        canceled: 0,
        cancelDeferred: 0,
        errors: 0,
      };

      // Companies cujo entitlement precisa ser republicado ao Domus (Cadeado):
      // Set dedup (uma sub pode ser suspensa E cancelada no mesmo run → 1 publish).
      // Publicamos ao FINAL, com await + concorrência limitada — fire-and-forget num
      // cron serverless pode ser cortado no freeze pós-resposta (achado Codex).
      const toPublish = new Set<string>();

      for (const sub of overdue) {
        try {
          if (!sub.pastDueSince) continue;

          const daysOverdue = Math.floor(
            (now.getTime() - sub.pastDueSince.getTime()) / (24 * 60 * 60 * 1000)
          );
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
              await prisma.globalAudit
                .create({
                  data: {
                    actorType: "SYSTEM",
                    action: "DUNNING_NOTICE",
                    companyId: sub.companyId,
                    metadata: { subscriptionId: sub.id, stage, daysOverdue },
                  },
                })
                .catch((e: unknown) =>
                  log.error("Falha ao auditar DUNNING_NOTICE (não-fatal)", {
                    subscriptionId: sub.id,
                    error: e instanceof Error ? e.message : String(e),
                  })
                );
              await notifyCompany(
                sub.companyId,
                "INVOICE_OVERDUE",
                { name: "Cliente", daysOverdue, payUrl: `${base}/dashboard/configuracoes` },
                { periodKey: `stage:${stage}`, channels: ["email"] }
              );
            }
          }

          // 2) Suspensão aos 14d — só se o aviso de 14 já foi registrado (não suspende sem avisar).
          if (
            daysOverdue >= SUSPEND_DAYS &&
            (lastStage ?? 0) >= SUSPEND_DAYS &&
            sub.status !== "SUSPENDED"
          ) {
            await prisma.subscription.update({
              where: { id: sub.id },
              data: { status: "SUSPENDED" },
            });
            // Propaga writeAllowed=false ao Domus (Cadeado): sem isto, a suspensão só
            // chegava no pull diário (~24h de janela de escrita indevida). Acumula p/
            // publicar ao final do batch.
            toPublish.add(sub.companyId);
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
            await notifyCompany(
              sub.companyId,
              "SUBSCRIPTION_SUSPENDED",
              { name: "Cliente", payUrl: `${base}/dashboard/configuracoes` },
              { periodKey: "suspended", channels: ["email"] }
            );
          }

          // 3) Cancelamento aos 30d — só com avisos registrados (canCancel exige lastStage>=14).
          if (daysOverdue >= CANCEL_DAYS) {
            if (canCancel(daysOverdue, lastStage)) {
              await prisma.subscription.update({
                where: { id: sub.id },
                data: {
                  status: "CANCELED",
                  canceledAt: now,
                  cancelReason: "Inadimplência > 30 dias",
                },
              });
              // Propaga writeAllowed=false ao Domus (Cadeado). Ver nota no ramo SUSPENDED.
              toPublish.add(sub.companyId);
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
              await prisma.globalAudit
                .create({
                  data: {
                    actorType: "SYSTEM",
                    action: "DUNNING_CANCELED",
                    companyId: sub.companyId,
                    metadata: { subscriptionId: sub.id, daysOverdue },
                  },
                })
                .catch((e: unknown) =>
                  log.error("Falha ao auditar DUNNING_CANCELED (não-fatal)", {
                    subscriptionId: sub.id,
                    error: e instanceof Error ? e.message : String(e),
                  })
                );
              await notifyCompany(
                sub.companyId,
                "SUBSCRIPTION_CANCELED",
                { name: "Cliente", reactivateUrl: `${base}/dashboard/upgrade` },
                { periodKey: "canceled", channels: ["email"] }
              );
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

      // Flush do Cadeado: publica writeAllowed=false ao Domus pras companies que
      // mudaram de estado neste batch. await (não fire-and-forget) — o cron serverless
      // pode congelar após a resposta e cortar promises pendentes. Concorrência
      // limitada (5) pra não abrir N snapshots simultâneos. Best-effort: cada publish
      // nunca lança; falha residual cai no pull de reparação.
      const companies = [...toPublish];
      const PUBLISH_CONCURRENCY = 5;
      for (let i = 0; i < companies.length; i += PUBLISH_CONCURRENCY) {
        await Promise.all(
          companies.slice(i, i + PUBLISH_CONCURRENCY).map((cid) => publishEntitlementForCompany(cid)),
        );
      }

      // attempted (não confirmado): publishEntitlementForCompany é best-effort/void
      // (falha de config/rede/non-2xx não propaga), então companies.length é o
      // número de companies que TENTAMOS publicar, não entregas confirmadas. A
      // confirmação real virá com o outbox durável da Fase 2.
      return NextResponse.json({
        ok: true,
        ...summary,
        entitlementsAttempted: companies.length,
        runAt: now.toISOString(),
      });
    });
  } catch (err) {
    log.error("Erro geral no cron dunning", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
