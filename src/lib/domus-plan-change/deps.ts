import { prisma } from "@/lib/prisma";
import { asaas } from "@/lib/asaas";
import { planValueForCycle } from "@/lib/plan-pricing";
import { schedulePublishEntitlement } from "@/lib/vis-domus-publisher";
import { invalidatePlanFeaturesCache } from "@/lib/plan-features-cache";
import type { SagaDeps, SagaOp } from "./executor";

/**
 * Constrói as dependências REAIS da saga (I/O) para o endpoint plan-change.
 * A ordem/retomada é do executor (runSaga); aqui é só o que cada passo FAZ.
 *
 * confirmBilling manda ao Asaas uma idempotencyKey derivada do eventId — fecha
 * o risco de dupla cobrança na retomada de BILLING_REQUESTED (achado Codex #1):
 * re-executar confirmBilling com a mesma chave NÃO gera segunda cobrança.
 */
export function buildSagaDeps(): SagaDeps {
  return {
    async confirmBilling(op: SagaOp) {
      const subscription = await prisma.subscription.findFirst({
        where: { companyId: op.visCompanyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
        select: { id: true, asaasSubscriptionId: true, billingCycle: true },
      });
      if (!subscription) {
        throw new Error("Assinatura ativa não encontrada para cobrança.");
      }
      if (!op.targetPlanId) {
        throw new Error("targetPlanId ausente na op.");
      }
      const plan = await prisma.plan.findUnique({
        where: { id: op.targetPlanId },
        select: { priceMonthly: true, priceYearly: true },
      });
      if (!plan) {
        throw new Error("Plano-alvo não encontrado.");
      }

      // Sem assinatura recorrente no Asaas → não há o que cobrar; a self-service
      // não deve auto-aplicar nesse caso (spec: sem asaasSubscriptionId não aplica).
      if (!subscription.asaasSubscriptionId) {
        throw new Error("Sem assinatura recorrente no Asaas — troca não auto-aplicável.");
      }

      const value = planValueForCycle(plan, subscription.billingCycle);
      // Idempotencykey ESTÁVEL por operação (eventId): retomar NÃO recobra.
      await asaas.subscriptions.update(
        subscription.asaasSubscriptionId,
        { value },
        `plan-change:${op.eventId}`,
      );
      return { asaasRef: `plan-change:${op.eventId}` };
    },

    async applyLocal(op: SagaOp) {
      if (!op.targetPlanId) throw new Error("targetPlanId ausente na op.");
      const [subscription, newPlan] = await Promise.all([
        prisma.subscription.findFirst({
          where: { companyId: op.visCompanyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
          select: { id: true, planId: true, status: true },
        }),
        prisma.plan.findUnique({
          where: { id: op.targetPlanId },
          select: { id: true, name: true, maxUsers: true, maxProducts: true, maxBranches: true },
        }),
      ]);
      if (!subscription) throw new Error("Assinatura ativa não encontrada.");
      if (!newPlan) throw new Error("Plano-alvo não encontrado.");

      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: subscription.id },
          data: { planId: newPlan.id },
        }),
        prisma.company.update({
          where: { id: op.visCompanyId },
          data: { maxUsers: newPlan.maxUsers, maxProducts: newPlan.maxProducts, maxBranches: newPlan.maxBranches },
        }),
        prisma.subscriptionHistory.create({
          data: {
            subscriptionId: subscription.id,
            action: "changed",
            fromPlanId: subscription.planId,
            toPlanId: newPlan.id,
            fromStatus: subscription.status,
            toStatus: subscription.status,
            reason: `Troca self-service (Domus) → ${newPlan.name}`,
            adminId: "domus-self-service", // NOT NULL no schema; marca a origem
            adminName: "domus-self-service",
          },
        }),
        prisma.globalAudit.create({
          data: {
            actorType: "DOMUS_SELF_SERVICE",
            // actorId tem FK opcional pra AdminUser — não há admin aqui, então null.
            actorId: null,
            companyId: op.visCompanyId,
            action: "PLAN_CHANGED_SELF_SERVICE",
            metadata: { toPlanId: newPlan.id, eventId: op.eventId, requestedTier: op.requestedTier },
          },
        }),
      ]);

      invalidatePlanFeaturesCache(op.visCompanyId);
    },

    async publish(op: SagaOp) {
      // Ecoa o entitlement de volta pro Domus (fire-and-forget; o pull cobre).
      schedulePublishEntitlement(op.visCompanyId);
    },

    async saveState(op) {
      await prisma.domusPlanChangeOp.update({
        where: { id: op.id },
        data: {
          state: op.state,
          asaasRef: op.asaasRef,
          ...(op.lastError !== undefined ? { lastError: op.lastError } : {}),
        },
      });
    },
  };
}
