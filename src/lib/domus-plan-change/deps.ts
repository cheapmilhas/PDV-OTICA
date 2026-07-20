import { prisma } from "@/lib/prisma";
import { asaas } from "@/lib/asaas";
import { planValueForCycle } from "@/lib/plan-pricing";
import { schedulePublishEntitlement } from "@/lib/vis-domus-publisher";
import { invalidatePlanFeaturesCache } from "@/lib/plan-features-cache";
import type { SagaDeps, SagaOp, CasResult } from "./executor";
import type { SagaState } from "./saga";

/**
 * Constrói as dependências REAIS da saga (I/O) para o endpoint plan-change.
 * A ordem/retomada é do executor (runSaga); aqui é só o que cada passo FAZ.
 *
 * FASE B — atomicidade + monotonia + identidade persistida:
 *  - confirmBilling e applyLocal agem SOBRE A ASSINATURA PERSISTIDA na op
 *    (subscriptionId/asaasSubscriptionId fixados no fresh), com PREFLIGHT de que
 *    a assinatura ainda casa — nunca cobrar X e aplicar Y (achado Codex #3).
 *  - applyLocal é UMA transação interativa: o CAS BILLING_CONFIRMED→LOCAL_APPLIED
 *    é a PRIMEIRA escrita; se não pega, aborta sem NENHUM efeito. Os efeitos
 *    (subscription/company/history/audit com planChangeOpId) vivem no mesmo
 *    commit → crash não duplica history/audit numa retomada (achado Codex #1).
 *  - transition/recordError são CAS: só gravam se a op ainda está no estado
 *    esperado → um executor atrasado NÃO regride COMPLETED (achado Codex #2).
 */

// Status de assinatura elegíveis para troca de plano (mesmos do fluxo admin).
const ELIGIBLE_STATUS = ["TRIAL", "ACTIVE", "PAST_DUE"] as const;

export function buildSagaDeps(): SagaDeps {
  return {
    async confirmBilling(op: SagaOp): Promise<{ asaasRef: string }> {
      // Carrega a op COM a identidade persistida (fixada no fresh). Fonte única
      // do que cobrar — não busca subscription por companyId (evita cobrar Y).
      const persisted = await prisma.domusPlanChangeOp.findUnique({
        where: { id: op.id },
        select: {
          subscriptionId: true,
          asaasSubscriptionId: true,
          priceApplied: true,
          billingCycle: true,
          targetPlanId: true,
        },
      });
      if (!persisted) throw new Error("Op não encontrada para cobrança.");
      const { subscriptionId, asaasSubscriptionId, priceApplied, billingCycle } = persisted;
      if (!subscriptionId || !asaasSubscriptionId || priceApplied == null || !billingCycle) {
        // Identidade não foi congelada (op antiga / fluxo incompleto): não cobra
        // às cegas. Falha ANTES de tocar o Asaas → checkpoint seguro.
        throw new Error("Identidade da assinatura não persistida na op (fase B exige).");
      }

      // PREFLIGHT (achado Codex): a assinatura persistida ainda tem que existir,
      // pertencer à company, estar elegível e MANTER o mesmo asaasSubscriptionId
      // E o mesmo billingCycle. Se trocou por baixo, cobrar cobraria errado.
      const sub = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        select: { companyId: true, status: true, asaasSubscriptionId: true, billingCycle: true },
      });
      if (!sub) throw new Error("Assinatura persistida não existe mais.");
      if (sub.companyId !== op.visCompanyId) {
        throw new Error("Assinatura persistida não pertence à company da op.");
      }
      if (!ELIGIBLE_STATUS.includes(sub.status as (typeof ELIGIBLE_STATUS)[number])) {
        throw new Error(`Assinatura em status inelegível: ${sub.status}.`);
      }
      if (sub.asaasSubscriptionId !== asaasSubscriptionId) {
        throw new Error("asaasSubscriptionId mudou desde o congelamento — não cobrar o ID antigo.");
      }
      // billingCycle divergente (achado Codex 2ª rodada): o preço foi congelado
      // PARA um ciclo. Se a assinatura virou YEARLY após o fresh (mesmo asaas id),
      // cobrar o valor MENSAL numa assinatura anual. Falha ANTES do Asaas.
      if (sub.billingCycle !== billingCycle) {
        throw new Error("billingCycle mudou desde o congelamento — preço congelado não vale mais.");
      }

      // Preço > 0 (achado Codex #1): defesa dupla (o endpoint já valida no fresh).
      // Sem isto, priceApplied=0 (ex.: plano com priceYearly=0) cobraria R$0 e o
      // applyLocal liberaria o tier caro. Falha ANTES de tocar o Asaas.
      if (!Number.isInteger(priceApplied) || priceApplied <= 0) {
        throw new Error(`priceApplied inválido (${priceApplied}) — não cobrar.`);
      }

      // priceApplied em centavos (schema); Asaas espera reais.
      const value = priceApplied / 100;
      // Idempotencykey ESTÁVEL por operação (eventId): retomar NÃO recobra.
      const updated = await asaas.subscriptions.update(
        asaasSubscriptionId,
        { value },
        `plan-change:${op.eventId}`,
      );
      // asaasRef guarda a resposta REAL do Asaas (id da assinatura), não a chave.
      return { asaasRef: updated?.id ?? `plan-change:${op.eventId}` };
    },

    async applyLocal(op: SagaOp): Promise<CasResult> {
      // Carrega a identidade persistida COMPLETA + o plano-alvo (fixados no fresh).
      const persisted = await prisma.domusPlanChangeOp.findUnique({
        where: { id: op.id },
        select: { subscriptionId: true, asaasSubscriptionId: true, billingCycle: true, targetPlanId: true },
      });
      if (!persisted?.subscriptionId) {
        throw new Error("subscriptionId não persistido na op (fase B exige).");
      }
      if (!persisted.targetPlanId) throw new Error("targetPlanId ausente na op.");
      const expectedSubId = persisted.subscriptionId;
      const expectedAsaasId = persisted.asaasSubscriptionId;
      const expectedCycle = persisted.billingCycle;

      const newPlan = await prisma.plan.findUnique({
        where: { id: persisted.targetPlanId },
        select: { id: true, name: true, maxUsers: true, maxProducts: true, maxBranches: true },
      });
      if (!newPlan) throw new Error("Plano-alvo não encontrado.");

      // Transação interativa: CAS PRIMEIRO, efeitos depois, tudo no mesmo commit.
      const applied = await prisma.$transaction(async (tx) => {
        // (1) CAS da op como PRIMEIRA escrita. count 0 → op já avançou/mudou:
        //     aborta a tx SEM nenhum efeito (retorna false).
        const cas = await tx.domusPlanChangeOp.updateMany({
          where: { id: op.id, state: "BILLING_CONFIRMED" },
          data: { state: "LOCAL_APPLIED" },
        });
        if (cas.count !== 1) return false;

        // (2) Lê a assinatura EXATA (pela identidade persistida) travando a linha
        //     para o snapshot from* não ficar obsoleto durante a troca. Traz
        //     companyId/asaasSubscriptionId para REVALIDAR a identidade DENTRO da
        //     tx (achado Codex #5): entre o CAS e aqui, a assinatura pode ter sido
        //     substituída/movida por um fluxo admin/checkout. Aplicar sem checar
        //     poderia trocar o plano da assinatura errada (a que foi cobrada ≠ a
        //     atual). Se divergiu, ABORTA (rollback do CAS) → nada aplicado.
        const subRows = await tx.$queryRaw<
          Array<{ id: string; planId: string; status: string; companyId: string; asaasSubscriptionId: string | null; billingCycle: string }>
        >`SELECT "id", "planId", "status", "companyId", "asaasSubscriptionId", "billingCycle" FROM "Subscription" WHERE "id" = ${expectedSubId} FOR UPDATE`;
        const sub = subRows[0];
        if (!sub) throw new Error("Assinatura persistida sumiu durante applyLocal.");
        if (sub.companyId !== op.visCompanyId) {
          throw new Error("Assinatura mudou de company desde o congelamento (applyLocal).");
        }
        // billingCycle divergente (achado Codex 2ª rodada): mesma checagem do
        // confirmBilling, agora sob lock — o ciclo não pode ter mudado entre
        // cobrança e aplicação (senão preço cobrado ≠ ciclo aplicado).
        if (sub.billingCycle !== expectedCycle) {
          throw new Error("billingCycle divergiu no applyLocal — assinatura mudou de ciclo.");
        }
        if (sub.asaasSubscriptionId !== expectedAsaasId) {
          throw new Error("asaasSubscriptionId divergiu no applyLocal — assinatura substituída.");
        }
        if (!ELIGIBLE_STATUS.includes(sub.status as (typeof ELIGIBLE_STATUS)[number])) {
          throw new Error(`Assinatura inelegível no applyLocal: ${sub.status}.`);
        }

        // (3) Efeitos no MESMO commit. history/audit carregam planChangeOpId →
        //     a 2ª linha da mesma op pega P2002 (trava de banco além do CAS).
        await tx.subscription.update({
          where: { id: sub.id },
          data: { planId: newPlan.id },
        });
        await tx.company.update({
          where: { id: op.visCompanyId },
          data: {
            maxUsers: newPlan.maxUsers,
            maxProducts: newPlan.maxProducts,
            maxBranches: newPlan.maxBranches,
          },
        });
        await tx.subscriptionHistory.create({
          data: {
            subscriptionId: sub.id,
            action: "changed",
            fromPlanId: sub.planId,
            toPlanId: newPlan.id,
            fromStatus: sub.status,
            toStatus: sub.status,
            reason: `Troca self-service (Domus) → ${newPlan.name}`,
            adminId: "domus-self-service", // NOT NULL no schema; marca a origem
            adminName: "domus-self-service",
            planChangeOpId: op.id, // trava anti-duplicata
          },
        });
        await tx.globalAudit.create({
          data: {
            actorType: "DOMUS_SELF_SERVICE",
            actorId: null, // FK opcional pra AdminUser — não há admin aqui
            companyId: op.visCompanyId,
            action: "PLAN_CHANGED_SELF_SERVICE",
            metadata: { toPlanId: newPlan.id, eventId: op.eventId, requestedTier: op.requestedTier },
            planChangeOpId: op.id, // trava anti-duplicata
          },
        });
        return true;
      });

      // Cache em memória: FORA da tx, só após commit (não é transacional).
      if (applied) invalidatePlanFeaturesCache(op.visCompanyId);
      return { applied };
    },

    async publish(op: SagaOp): Promise<void> {
      // Ecoa o entitlement de volta pro Domus (fire-and-forget; o pull cobre).
      // FORA de qualquer transação — não é durável e o processo serverless pode
      // congelar após a resposta; o pull diário do Domus é a rede de segurança.
      schedulePublishEntitlement(op.visCompanyId);
    },

    async transition(op: SagaOp, from: SagaState, to: SagaState): Promise<CasResult> {
      // CAS puro de estado (sem efeito de negócio). Só grava se ainda em `from`.
      // Carrega timestamps/refs conforme a transição (auditoria financeira).
      const now = new Date();
      const extra: Record<string, unknown> = {};
      if (to === "BILLING_REQUESTED") extra.billingRequestedAt = now;
      if (to === "BILLING_CONFIRMED") {
        extra.billingConfirmedAt = now;
        if (op.asaasRef !== undefined) extra.asaasRef = op.asaasRef;
      }
      const res = await prisma.domusPlanChangeOp.updateMany({
        where: { id: op.id, state: from },
        data: { state: to, ...extra },
      });
      return { applied: res.count === 1 };
    },

    async recordError(op: SagaOp, from: SagaState, lastError: string): Promise<void> {
      // CAS: grava o erro SÓ se a op ainda está em `from`. Nunca altera state —
      // não regride um estado mais avançado gravado por outro executor.
      await prisma.domusPlanChangeOp.updateMany({
        where: { id: op.id, state: from },
        data: { lastError, lastAttemptAt: new Date() },
      });
    },

    async markTerminal(op: SagaOp, from: SagaState, terminal: SagaState, lastError: string): Promise<CasResult> {
      // CAS para um estado terminal (WHERE state=from). Grava o motivo. Usado na
      // expiração antes de cobrar (RECEIVED → FAILED_BEFORE_BILLING).
      const res = await prisma.domusPlanChangeOp.updateMany({
        where: { id: op.id, state: from },
        data: { state: terminal, lastError, lastAttemptAt: new Date() },
      });
      return { applied: res.count === 1 };
    },

    async reloadOp(op: SagaOp): Promise<{ state: SagaState; asaasRef: string | null } | null> {
      const row = await prisma.domusPlanChangeOp.findUnique({
        where: { id: op.id },
        select: { state: true, asaasRef: true },
      });
      if (!row) return null;
      return { state: row.state as SagaState, asaasRef: row.asaasRef };
    },
  };
}
