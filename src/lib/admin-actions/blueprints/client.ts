// src/lib/admin-actions/blueprints/client.ts
//
// 8 blueprints declarativos das ações de cliente do admin, portados VERBATIM de
// src/app/api/admin/clientes/[id]/actions/route.ts (switch com 8 cases).
// Cada execute() preserva: writes no DB, globalAudit (action+metadata) E logActivity
// (type/title/detail) — auditoria tripla não pode regredir.
//
// impersonate NÃO está aqui (é fluxo separado de token+redirect).
// Todas as ações são SUPER_ADMIN-only por enquanto (decisão do dono).
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/activity-log.service";
import { ActorType } from "@prisma/client";
import { invalidatePlanFeaturesCache } from "@/lib/plan-features-cache";
import { logger } from "@/lib/logger";
import { asaas } from "@/lib/asaas";
import { planValueForCycle } from "@/lib/plan-pricing";
import type { AdminActionBlueprint } from "../types";

const log = logger.child({ module: "admin-actions/blueprints/client" });

const companyInput = z.object({ companyId: z.string().min(1) });

// ─── block ───────────────────────────────────────────────────────────────────
export const blockCompany: AdminActionBlueprint<{ companyId: string }> = {
  id: "block",
  label: "Bloquear empresa",
  description: "Bloqueia o acesso da empresa ao sistema.",
  category: "client",
  icon: "Ban",
  riskLevel: "medium",
  confirm: { requireReason: true },
  schema: companyInput,
  allowedRoles: ["SUPER_ADMIN"],
  targetCompanyId: (i) => i.companyId,
  async execute(ctx, { companyId }) {
    await prisma.company.update({
      where: { id: companyId },
      data: { isBlocked: true, blockedReason: "ADMIN_ACTION", blockedAt: new Date() },
    });
    await prisma.globalAudit.create({
      data: { actorType: "ADMIN_USER", actorId: ctx.adminId, companyId, action: "COMPANY_BLOCKED", metadata: { adminEmail: ctx.adminEmail } },
    });
    await logActivity({ companyId, type: "COMPANY_BLOCKED", title: "Empresa bloqueada", actorId: ctx.adminId, actorType: ActorType.ADMIN, actorName: ctx.adminName });
    return { ok: true, message: "Empresa bloqueada" };
  },
};

// ─── unblock ─────────────────────────────────────────────────────────────────
export const unblockCompany: AdminActionBlueprint<{ companyId: string }> = {
  id: "unblock",
  label: "Desbloquear empresa",
  description: "Restaura o acesso da empresa ao sistema.",
  category: "client",
  icon: "CheckCircle",
  riskLevel: "low",
  schema: companyInput,
  allowedRoles: ["SUPER_ADMIN"],
  targetCompanyId: (i) => i.companyId,
  async execute(ctx, { companyId }) {
    await prisma.company.update({
      where: { id: companyId },
      data: { isBlocked: false, blockedReason: null, blockedAt: null },
    });
    await prisma.globalAudit.create({
      data: { actorType: "ADMIN_USER", actorId: ctx.adminId, companyId, action: "COMPANY_UNBLOCKED", metadata: { adminEmail: ctx.adminEmail } },
    });
    await logActivity({ companyId, type: "COMPANY_UNBLOCKED", title: "Empresa desbloqueada", actorId: ctx.adminId, actorType: ActorType.ADMIN, actorName: ctx.adminName });
    return { ok: true, message: "Empresa desbloqueada" };
  },
};

// ─── reactivate ──────────────────────────────────────────────────────────────
export const reactivateSubscription: AdminActionBlueprint<{ companyId: string }> = {
  id: "reactivate",
  label: "Reativar assinatura",
  description: "Reativa uma assinatura suspensa (zera a régua de cobrança).",
  category: "client",
  icon: "RefreshCw",
  riskLevel: "medium",
  schema: companyInput,
  allowedRoles: ["SUPER_ADMIN"],
  targetCompanyId: (i) => i.companyId,
  async execute(ctx, { companyId }) {
    const subscription = await prisma.subscription.findFirst({ where: { companyId, status: "SUSPENDED" } });
    if (!subscription) return { ok: false, message: "Assinatura suspensa não encontrada" };
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE", pastDueSince: null, lastDunningStage: null }, // F5: zera régua na recuperação
    });
    await prisma.globalAudit.create({
      data: { actorType: "ADMIN_USER", actorId: ctx.adminId, companyId, action: "SUBSCRIPTION_REACTIVATED", metadata: { subscriptionId: subscription.id } },
    });
    await logActivity({ companyId, type: "SUBSCRIPTION_REACTIVATED", title: "Assinatura reativada", actorId: ctx.adminId, actorType: ActorType.ADMIN, actorName: ctx.adminName });
    return { ok: true, message: "Assinatura reativada" };
  },
};

// ─── extend_trial ────────────────────────────────────────────────────────────
export const extendTrial: AdminActionBlueprint<{ companyId: string }> = {
  id: "extend_trial",
  label: "Estender trial (+7 dias)",
  description: "Adiciona 7 dias ao trial vigente.",
  category: "client",
  icon: "CreditCard",
  riskLevel: "low",
  schema: companyInput,
  allowedRoles: ["SUPER_ADMIN"],
  targetCompanyId: (i) => i.companyId,
  async execute(ctx, { companyId }) {
    const subscription = await prisma.subscription.findFirst({ where: { companyId, status: "TRIAL" } });
    if (!subscription) return { ok: false, message: "Trial não encontrado" };
    const newEnd = new Date(subscription.trialEndsAt ?? new Date());
    newEnd.setDate(newEnd.getDate() + 7);
    await prisma.subscription.update({ where: { id: subscription.id }, data: { trialEndsAt: newEnd } });
    await prisma.globalAudit.create({
      data: { actorType: "ADMIN_USER", actorId: ctx.adminId, companyId, action: "TRIAL_EXTENDED", metadata: { newTrialEnd: newEnd.toISOString() } },
    });
    await logActivity({ companyId, type: "TRIAL_EXTENDED", title: `Trial estendido até ${newEnd.toLocaleDateString("pt-BR")}`, detail: { newTrialEnd: newEnd.toISOString() }, actorId: ctx.adminId, actorType: ActorType.ADMIN, actorName: ctx.adminName });
    return { ok: true, message: `Trial estendido até ${newEnd.toLocaleDateString("pt-BR")}` };
  },
};

// ─── change_plan ─────────────────────────────────────────────────────────────
const changePlanInput = companyInput.extend({ planId: z.string().min(1) });
export const changePlan: AdminActionBlueprint<{ companyId: string; planId: string }> = {
  id: "change_plan",
  label: "Alterar plano",
  description: "Faz upgrade ou downgrade do plano da assinatura ativa.",
  category: "client",
  icon: "ArrowUpDown",
  riskLevel: "medium",
  schema: changePlanInput,
  allowedRoles: ["SUPER_ADMIN"],
  targetCompanyId: (i) => i.companyId,
  async execute(ctx, { companyId, planId }) {
    const newPlan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!newPlan) return { ok: false, message: "Plano não encontrado" };

    const subscription = await prisma.subscription.findFirst({
      where: { companyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
      include: { plan: true },
    });
    if (!subscription) return { ok: false, message: "Assinatura ativa não encontrada" };

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
          adminId: ctx.adminId,
          adminName: ctx.adminName ?? "", // schema exige String; ctx.adminName é opcional
        },
      }),
      prisma.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: ctx.adminId,
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
              actorId: ctx.adminId,
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

    await logActivity({ companyId, type: "PLAN_CHANGED", title: `Plano alterado: ${oldPlan.name} → ${newPlan.name}`, detail: { fromPlan: oldPlan.name, toPlan: newPlan.name }, actorId: ctx.adminId, actorType: ActorType.ADMIN, actorName: ctx.adminName });
    return { ok: true, message: `Plano alterado: ${oldPlan.name} → ${newPlan.name}` };
  },
};

// ─── cancel_subscription ─────────────────────────────────────────────────────
const cancelSubscriptionInput = companyInput.extend({ reason: z.string().min(1) });
export const cancelSubscription: AdminActionBlueprint<{ companyId: string; reason: string }> = {
  id: "cancel_subscription",
  label: "Cancelar assinatura",
  description: "Cancela a assinatura ativa da empresa.",
  category: "client",
  icon: "XCircle",
  riskLevel: "high",
  confirm: { requireReason: true },
  schema: cancelSubscriptionInput,
  allowedRoles: ["SUPER_ADMIN"],
  targetCompanyId: (i) => i.companyId,
  async execute(ctx, { companyId, reason }) {
    if (!reason) return { ok: false, message: "Motivo é obrigatório" };

    const subscription = await prisma.subscription.findFirst({
      where: { companyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
    });
    if (!subscription) return { ok: false, message: "Assinatura ativa não encontrada" };

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
          adminId: ctx.adminId,
          adminName: ctx.adminName ?? "", // schema exige String; ctx.adminName é opcional
        },
      }),
      prisma.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: ctx.adminId,
          companyId,
          action: "SUBSCRIPTION_CANCELED",
          metadata: { subscriptionId: subscription.id, reason },
        },
      }),
    ]);

    await logActivity({ companyId, type: "SUBSCRIPTION_CANCELED", title: "Assinatura cancelada", detail: { reason }, actorId: ctx.adminId, actorType: ActorType.ADMIN, actorName: ctx.adminName });
    return { ok: true, message: "Assinatura cancelada" };
  },
};

// ─── change_billing_cycle ────────────────────────────────────────────────────
const changeBillingCycleInput = companyInput.extend({ cycle: z.enum(["MONTHLY", "YEARLY"]) });
export const changeBillingCycle: AdminActionBlueprint<{ companyId: string; cycle: "MONTHLY" | "YEARLY" }> = {
  id: "change_billing_cycle",
  label: "Alterar ciclo de cobrança",
  description: "Alterna a assinatura entre cobrança mensal e anual.",
  category: "client",
  icon: "Calendar",
  riskLevel: "medium",
  schema: changeBillingCycleInput,
  allowedRoles: ["SUPER_ADMIN"],
  targetCompanyId: (i) => i.companyId,
  async execute(ctx, { companyId, cycle }) {
    if (!cycle || !["MONTHLY", "YEARLY"].includes(cycle)) {
      return { ok: false, message: "Ciclo inválido. Use MONTHLY ou YEARLY" };
    }

    const subscription = await prisma.subscription.findFirst({
      where: { companyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
      include: { plan: true },
    });
    if (!subscription) return { ok: false, message: "Assinatura ativa não encontrada" };

    if (subscription.billingCycle === cycle) {
      return { ok: false, message: `Assinatura já está no ciclo ${cycle === "MONTHLY" ? "Mensal" : "Anual"}` };
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
          adminId: ctx.adminId,
          adminName: ctx.adminName ?? "", // schema exige String; ctx.adminName é opcional
          metadata: { fromCycle: oldCycle, toCycle: cycle },
        },
      }),
      prisma.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: ctx.adminId,
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
              actorId: ctx.adminId,
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

    await logActivity({ companyId, type: "CYCLE_CHANGED", title: `Ciclo alterado para ${cycle === "MONTHLY" ? "Mensal" : "Anual"}`, detail: { fromCycle: oldCycle, toCycle: cycle }, actorId: ctx.adminId, actorType: ActorType.ADMIN, actorName: ctx.adminName });
    return { ok: true, message: `Ciclo alterado para ${cycle === "MONTHLY" ? "Mensal" : "Anual"}` };
  },
};

// ─── delete ──────────────────────────────────────────────────────────────────
// NOTA: o case original faz soft-delete (marca isBlocked + blockedReason="DELETED"),
// NÃO apaga dados. O gate de role (SUPER_ADMIN) já é coberto por allowedRoles, mas
// preservamos a verificação como no original — defesa em profundidade.
// O case original NÃO chama logActivity (só globalAudit) — portado fielmente.
export const deleteCompany: AdminActionBlueprint<{ companyId: string }> = {
  id: "delete",
  label: "Excluir empresa",
  description: "Exclui (soft-delete) a empresa, bloqueando o acesso permanentemente.",
  category: "client",
  icon: "Trash2",
  riskLevel: "high",
  confirm: { requireReason: true, typeToConfirm: "companyName" },
  schema: companyInput,
  allowedRoles: ["SUPER_ADMIN"],
  targetCompanyId: (i) => i.companyId,
  async execute(ctx, { companyId }) {
    await prisma.company.update({
      where: { id: companyId },
      data: { isBlocked: true, blockedReason: "DELETED", blockedAt: new Date() },
    });
    await prisma.globalAudit.create({
      data: { actorType: "ADMIN_USER", actorId: ctx.adminId, companyId, action: "COMPANY_DELETED" },
    });
    return { ok: true, message: "Empresa excluída" };
  },
};
