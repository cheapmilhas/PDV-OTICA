import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { logActivity } from "@/services/activity-log.service";
import { ActorType } from "@prisma/client";
import { invalidatePlanFeaturesCache } from "@/lib/plan-features-cache";
import { logger } from "@/lib/logger";
import { asaas } from "@/lib/asaas";
import { planValueForCycle } from "@/lib/plan-pricing";
import { schedulePublishEntitlement } from "@/lib/vis-domus-publisher";
import { checkCanResendMedicalInvite } from "../resend-invite-guard";

const log = logger.child({ route: "admin/clientes/[id]/actions" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;

  if (!(await requireCompanyScope(admin.id, companyId))) {
    return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });
  }

  const body = await request.json();
  const { action } = body;

  try {
    switch (action) {
      case "block": {
        await prisma.company.update({
          where: { id: companyId },
          data: { isBlocked: true, blockedReason: "ADMIN_ACTION", blockedAt: new Date() },
        });
        await prisma.globalAudit.create({
          data: { actorType: "ADMIN_USER", actorId: admin.id, companyId, action: "COMPANY_BLOCKED", metadata: { adminEmail: admin.email } },
        });
        await logActivity({ companyId, type: "COMPANY_BLOCKED", title: "Empresa bloqueada", actorId: admin.id, actorType: ActorType.ADMIN, actorName: admin.name });
        // Espelha no Domus se for clínica vinculada (fire-and-forget; não segura
        // a resposta do admin; pull diário cobre falha).
        schedulePublishEntitlement(companyId);
        return NextResponse.json({ success: true, message: "Empresa bloqueada" });
      }

      case "unblock": {
        await prisma.company.update({
          where: { id: companyId },
          data: { isBlocked: false, blockedReason: null, blockedAt: null },
        });
        await prisma.globalAudit.create({
          data: { actorType: "ADMIN_USER", actorId: admin.id, companyId, action: "COMPANY_UNBLOCKED", metadata: { adminEmail: admin.email } },
        });
        await logActivity({ companyId, type: "COMPANY_UNBLOCKED", title: "Empresa desbloqueada", actorId: admin.id, actorType: ActorType.ADMIN, actorName: admin.name });
        // Espelha no Domus se for clínica vinculada (fire-and-forget; não segura
        // a resposta do admin; pull diário cobre falha).
        schedulePublishEntitlement(companyId);
        return NextResponse.json({ success: true, message: "Empresa desbloqueada" });
      }
      // reactivate/change_plan/cancel_subscription agora publicam entitlement
      // (Fase 1 tiers: fecham o gap do TODO(sprint3)). change_billing_cycle NÃO
      // muda writeAllowed nem tier (só o valor recorrente) → fora do escopo; o
      // pull diário cobre qualquer reflexo indireto.

      case "reactivate": {
        const subscription = await prisma.subscription.findFirst({ where: { companyId, status: "SUSPENDED" } });
        if (!subscription) return NextResponse.json({ error: "Assinatura suspensa não encontrada" }, { status: 400 });
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: "ACTIVE", pastDueSince: null, lastDunningStage: null }, // F5: zera régua na recuperação
        });
        await prisma.globalAudit.create({
          data: { actorType: "ADMIN_USER", actorId: admin.id, companyId, action: "SUBSCRIPTION_REACTIVATED", metadata: { subscriptionId: subscription.id } },
        });
        await logActivity({ companyId, type: "SUBSCRIPTION_REACTIVATED", title: "Assinatura reativada", actorId: admin.id, actorType: ActorType.ADMIN, actorName: admin.name });
        // Espelha no Domus: reativar volta writeAllowed=true. Fire-and-forget.
        schedulePublishEntitlement(companyId);
        return NextResponse.json({ success: true, message: "Assinatura reativada" });
      }

      case "extend_trial": {
        const subscription = await prisma.subscription.findFirst({ where: { companyId, status: "TRIAL" } });
        if (!subscription) return NextResponse.json({ error: "Trial não encontrado" }, { status: 400 });
        const newEnd = new Date(subscription.trialEndsAt ?? new Date());
        newEnd.setDate(newEnd.getDate() + 7);
        await prisma.subscription.update({ where: { id: subscription.id }, data: { trialEndsAt: newEnd } });
        await prisma.globalAudit.create({
          data: { actorType: "ADMIN_USER", actorId: admin.id, companyId, action: "TRIAL_EXTENDED", metadata: { newTrialEnd: newEnd.toISOString() } },
        });
        await logActivity({ companyId, type: "TRIAL_EXTENDED", title: `Trial estendido até ${newEnd.toLocaleDateString("pt-BR")}`, detail: { newTrialEnd: newEnd.toISOString() }, actorId: admin.id, actorType: ActorType.ADMIN, actorName: admin.name });
        return NextResponse.json({ success: true, message: `Trial estendido até ${newEnd.toLocaleDateString("pt-BR")}` });
      }

      case "change_plan": {
        const { planId } = body;
        if (!planId) return NextResponse.json({ error: "planId é obrigatório" }, { status: 400 });

        const newPlan = await prisma.plan.findUnique({ where: { id: planId } });
        if (!newPlan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 400 });

        // Integridade produto×plano: a CRIAÇÃO de cliente já valida isto
        // (create/route.ts), a troca não validava. Aplicar plano de ótica numa
        // clínica (ou o inverso) desalinha cobrança, limites e o entitlement
        // publicado para o Domus — e o seletor da UI já só oferece planos do
        // produto certo, então divergência aqui só chega por chamada direta.
        const empresa = await prisma.company.findUnique({
          where: { id: companyId },
          select: { platformProduct: true },
        });
        if (!empresa) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
        if (newPlan.platformProduct !== empresa.platformProduct) {
          return NextResponse.json(
            { error: "O plano escolhido é de outro produto da plataforma." },
            { status: 400 },
          );
        }

        const subscription = await prisma.subscription.findFirst({
          where: { companyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
          include: { plan: true },
        });
        if (!subscription) return NextResponse.json({ error: "Assinatura ativa não encontrada" }, { status: 400 });

        const oldPlan = subscription.plan;
        const isUpgrade = newPlan.priceMonthly > oldPlan.priceMonthly;

        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: { planId },
          }),
          prisma.company.update({
            where: { id: companyId },
            data: {
              maxUsers: newPlan.maxUsers,
              maxProducts: newPlan.maxProducts,
              maxBranches: newPlan.maxBranches,
            },
          }),
          prisma.subscriptionHistory.create({
            data: {
              subscriptionId: subscription.id,
              action: isUpgrade ? "upgraded" : "downgraded",
              fromPlanId: oldPlan.id,
              toPlanId: newPlan.id,
              fromStatus: subscription.status,
              toStatus: subscription.status,
              reason: `${isUpgrade ? "Upgrade" : "Downgrade"}: ${oldPlan.name} → ${newPlan.name}`,
              adminId: admin.id,
              adminName: admin.name,
            },
          }),
          prisma.globalAudit.create({
            data: {
              actorType: "ADMIN_USER",
              actorId: admin.id,
              companyId,
              action: isUpgrade ? "PLAN_UPGRADED" : "PLAN_DOWNGRADED",
              metadata: { fromPlan: oldPlan.name, toPlan: newPlan.name, subscriptionId: subscription.id },
            },
          }),
        ]);

        // Invalidar cache de plan features pra que a próxima request da empresa
        // veja o novo plano (sem esperar TTL de 5min). Coerente com gate em layout
        // e withPlanFeatureGuard que consomem o mesmo cache.
        invalidatePlanFeaturesCache(companyId);

        // Sincroniza o valor da assinatura recorrente no Asaas.
        // Fail-soft: se o Asaas falhar, NÃO revertemos o acesso local —
        // marcamos billingSyncPending para reconciliação posterior (F4).
        if (subscription.asaasSubscriptionId) {
          // value calculado DENTRO do try: se planValueForCycle lançar (ex. preço 0),
          // cai no fail-soft (marca billingSyncPending) em vez de 500 com DB já commitado.
          let value = 0;
          try {
            value = planValueForCycle(newPlan, subscription.billingCycle);
            await asaas.subscriptions.update(
              subscription.asaasSubscriptionId,
              { value },
              `change-plan:${subscription.id}:${newPlan.id}`,
            );
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            try {
              await prisma.globalAudit.create({
                data: {
                  actorType: "ADMIN_USER",
                  actorId: admin.id,
                  companyId,
                  action: "BILLING_SYNC_FAILED",
                  metadata: {
                    subscriptionId: subscription.id,
                    asaasSubscriptionId: subscription.asaasSubscriptionId,
                    context: "change_plan",
                    newValue: value,
                    error: errMsg,
                  },
                },
              });
              await prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                  billingSyncPending: true,
                  // Esperado materializado p/ reconciliação (F4): centavos, sem desconto
                  // (é o que foi enviado ao Asaas). change_plan não muda o ciclo.
                  expectedAsaasValue: Math.round(value * 100),
                  expectedAsaasCycle: null,
                },
              });
            } catch (recErr) {
              log.error("Falha ao registrar billingSyncPending (change_plan)", {
                subscriptionId: subscription.id,
                error: recErr instanceof Error ? recErr.message : String(recErr),
              });
            }
            log.error("Falha ao sincronizar plano no Asaas", {
              subscriptionId: subscription.id,
              error: errMsg,
            });
          }
        }

        await logActivity({ companyId, type: "PLAN_CHANGED", title: `Plano alterado: ${oldPlan.name} → ${newPlan.name}`, detail: { fromPlan: oldPlan.name, toPlan: newPlan.name }, actorId: admin.id, actorType: ActorType.ADMIN, actorName: admin.name });
        // Espelha no Domus: troca de plano muda o tier-efeito (payload v2 emitirá
        // plan.tier na fase do relógio; hoje publica v1 que o Domus aceita e que
        // preserva o plan_tier já gravado). Fire-and-forget; pull diário cobre falha.
        schedulePublishEntitlement(companyId);
        return NextResponse.json({ success: true, message: `Plano alterado: ${oldPlan.name} → ${newPlan.name}` });
      }

      case "cancel_subscription": {
        const { reason } = body;
        if (!reason) return NextResponse.json({ error: "Motivo é obrigatório" }, { status: 400 });

        const subscription = await prisma.subscription.findFirst({
          where: { companyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
        });
        if (!subscription) return NextResponse.json({ error: "Assinatura ativa não encontrada" }, { status: 400 });

        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "CANCELED", canceledAt: new Date(), cancelReason: reason },
          }),
          prisma.subscriptionHistory.create({
            data: {
              subscriptionId: subscription.id,
              action: "canceled",
              fromStatus: subscription.status,
              toStatus: "CANCELED",
              reason,
              adminId: admin.id,
              adminName: admin.name,
            },
          }),
          prisma.globalAudit.create({
            data: {
              actorType: "ADMIN_USER",
              actorId: admin.id,
              companyId,
              action: "SUBSCRIPTION_CANCELED",
              metadata: { subscriptionId: subscription.id, reason },
            },
          }),
        ]);

        // F1: cancela TAMBÉM a assinatura recorrente no Asaas — senão o gateway
        // segue cobrando o cartão/boleto do cliente mesmo com a conta cancelada
        // aqui (chargeback/reclamação). Fail-soft igual ao change_plan: se o Asaas
        // falhar, NÃO revertemos o cancelamento local — marcamos billingSyncPending
        // para reconciliação posterior.
        if (subscription.asaasSubscriptionId) {
          try {
            await asaas.subscriptions.cancel(subscription.asaasSubscriptionId);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            try {
              await prisma.globalAudit.create({
                data: {
                  actorType: "ADMIN_USER",
                  actorId: admin.id,
                  companyId,
                  action: "BILLING_SYNC_FAILED",
                  metadata: {
                    subscriptionId: subscription.id,
                    asaasSubscriptionId: subscription.asaasSubscriptionId,
                    context: "cancel_subscription",
                    error: errMsg,
                  },
                },
              });
              await prisma.subscription.update({
                where: { id: subscription.id },
                data: { billingSyncPending: true },
              });
            } catch (recErr) {
              log.error("Falha ao registrar billingSyncPending (cancel_subscription)", {
                subscriptionId: subscription.id,
                error: recErr instanceof Error ? recErr.message : String(recErr),
              });
            }
            log.error("Falha ao cancelar assinatura no Asaas", {
              subscriptionId: subscription.id,
              error: errMsg,
            });
          }
        }

        await logActivity({ companyId, type: "SUBSCRIPTION_CANCELED", title: "Assinatura cancelada", detail: { reason }, actorId: admin.id, actorType: ActorType.ADMIN, actorName: admin.name });
        // Espelha no Domus a decisão ATUAL de checkSubscription após o cancel.
        // Nota: não força writeAllowed=false — se Company.accessEnabled=true (ou
        // kill-switch/bypass), checkSubscription ainda libera; o publish reflete
        // a decisão real, que é o correto (Vis é fonte de verdade). Fire-and-forget.
        schedulePublishEntitlement(companyId);
        return NextResponse.json({ success: true, message: "Assinatura cancelada" });
      }

      case "change_billing_cycle": {
        const { cycle } = body;
        if (!cycle || !["MONTHLY", "YEARLY"].includes(cycle)) {
          return NextResponse.json({ error: "Ciclo inválido. Use MONTHLY ou YEARLY" }, { status: 400 });
        }

        const subscription = await prisma.subscription.findFirst({
          where: { companyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
          include: { plan: true },
        });
        if (!subscription) return NextResponse.json({ error: "Assinatura ativa não encontrada" }, { status: 400 });

        if (subscription.billingCycle === cycle) {
          return NextResponse.json({ error: `Assinatura já está no ciclo ${cycle === "MONTHLY" ? "Mensal" : "Anual"}` }, { status: 400 });
        }

        const oldCycle = subscription.billingCycle;
        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: { billingCycle: cycle },
          }),
          prisma.subscriptionHistory.create({
            data: {
              subscriptionId: subscription.id,
              action: "billing_cycle_changed",
              fromStatus: subscription.status,
              toStatus: subscription.status,
              reason: `Ciclo alterado: ${oldCycle === "MONTHLY" ? "Mensal" : "Anual"} → ${cycle === "MONTHLY" ? "Mensal" : "Anual"}`,
              adminId: admin.id,
              adminName: admin.name,
              metadata: { fromCycle: oldCycle, toCycle: cycle },
            },
          }),
          prisma.globalAudit.create({
            data: {
              actorType: "ADMIN_USER",
              actorId: admin.id,
              companyId,
              action: "BILLING_CYCLE_CHANGED",
              metadata: { subscriptionId: subscription.id, fromCycle: oldCycle, toCycle: cycle },
            },
          }),
        ]);

        if (subscription.asaasSubscriptionId) {
          // value DENTRO do try (ver change_plan): erro de pricing → fail-soft, não 500.
          let value = 0;
          try {
            value = planValueForCycle(subscription.plan, cycle);
            await asaas.subscriptions.update(
              subscription.asaasSubscriptionId,
              { value, cycle: cycle as "MONTHLY" | "YEARLY" },
              `change-cycle:${subscription.id}:${cycle}`,
            );
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            try {
              await prisma.globalAudit.create({
                data: {
                  actorType: "ADMIN_USER",
                  actorId: admin.id,
                  companyId,
                  action: "BILLING_SYNC_FAILED",
                  metadata: {
                    subscriptionId: subscription.id,
                    asaasSubscriptionId: subscription.asaasSubscriptionId,
                    context: "change_billing_cycle",
                    newCycle: cycle,
                    newValue: value,
                    error: errMsg,
                  },
                },
              });
              await prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                  billingSyncPending: true,
                  // Esperado materializado p/ reconciliação (F4): value+cycle (o ciclo
                  // mudou aqui). Centavos, sem desconto (o que foi enviado ao Asaas).
                  expectedAsaasValue: Math.round(value * 100),
                  expectedAsaasCycle: cycle as "MONTHLY" | "YEARLY",
                },
              });
            } catch (recErr) {
              log.error("Falha ao registrar billingSyncPending (change_billing_cycle)", {
                subscriptionId: subscription.id,
                error: recErr instanceof Error ? recErr.message : String(recErr),
              });
            }
            log.error("Falha ao sincronizar ciclo no Asaas", {
              subscriptionId: subscription.id,
              error: errMsg,
            });
          }
        }

        await logActivity({ companyId, type: "CYCLE_CHANGED", title: `Ciclo alterado para ${cycle === "MONTHLY" ? "Mensal" : "Anual"}`, detail: { fromCycle: oldCycle, toCycle: cycle }, actorId: admin.id, actorType: ActorType.ADMIN, actorName: admin.name });
        return NextResponse.json({ success: true, message: `Ciclo alterado para ${cycle === "MONTHLY" ? "Mensal" : "Anual"}` });
      }

      // B3: reenviar o convite medical. Re-enfileira o e-mail para o
      // medicalInviteUrl JÁ gravado (não fala com o Domus — o token/validade são
      // do Domus e não mudam; isto NÃO regenera o token). Se a linha de e-mail
      // original existir (dedupeKey medical-invite:<companyId>), reusa o data dela
      // (que tem o expiresAt real do Domus) e só re-arma o status; senão monta a
      // partir dos dados de contato da company.
      case "resend_medical_invite": {
        const company = await prisma.company.findUnique({
          where: { id: companyId },
          select: {
            platformProduct: true,
            provisioningState: true,
            medicalInviteUrl: true,
            email: true,
            name: true,
            tradeName: true,
          },
        });
        if (!company) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
        const canResend = checkCanResendMedicalInvite({
          platformProduct: company.platformProduct,
          medicalInviteUrl: company.medicalInviteUrl,
          email: company.email,
        });
        if (!canResend.ok) {
          return NextResponse.json({ error: canResend.error }, { status: canResend.status });
        }
        // email garantido não-nulo pela checagem acima.
        const to = company.email as string;

        // upsert ATÔMICO no dedupeKey (@unique): elimina a corrida do
        // findUnique+create (dois cliques concorrentes dariam 500 por constraint)
        // e resolve os dois casos numa operação. update = reusa o data original
        // (com o expiresAt real do Domus) e só re-arma o envio; create = monta a
        // partir dos dados de contato da company (e-mail estava desligado no
        // provisionamento). Reenvio concorrente com o worker pode, no pior caso,
        // duplicar um convite — inofensivo (não é PHI/cobrança) e inerente a "reenviar".
        const dedupeKey = `medical-invite:${companyId}`;
        await prisma.emailQueue.upsert({
          where: { dedupeKey },
          update: { status: "PENDING", sentAt: null, attempts: 0, lastError: null },
          create: {
            to,
            subject: "Acesse sua clínica no Vis Medical",
            template: "medical-invite",
            dedupeKey,
            data: {
              name: company.tradeName ?? company.name,
              clinicName: company.tradeName ?? company.name,
              acceptUrl: company.medicalInviteUrl,
            },
          },
        });

        // Auditoria no globalAudit (action é String livre). Não uso logActivity
        // aqui porque o enum ActivityType não tem um valor para isto e adicionar
        // um valor de enum exigiria migração só por uma linha de timeline.
        await prisma.globalAudit.create({
          data: {
            actorType: "ADMIN_USER",
            actorId: admin.id,
            companyId,
            action: "MEDICAL_INVITE_RESENT",
            metadata: { adminEmail: admin.email, to },
          },
        });
        return NextResponse.json({ success: true, message: "Convite reenviado" });
      }

      case "delete": {
        if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Apenas SUPER_ADMIN pode excluir empresas" }, { status: 403 });
        await prisma.company.update({
          where: { id: companyId },
          data: { isBlocked: true, blockedReason: "DELETED", blockedAt: new Date() },
        });
        await prisma.globalAudit.create({
          data: { actorType: "ADMIN_USER", actorId: admin.id, companyId, action: "COMPANY_DELETED" },
        });
        return NextResponse.json({ success: true, message: "Empresa excluída" });
      }

      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (error) {
    log.error("Erro", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
