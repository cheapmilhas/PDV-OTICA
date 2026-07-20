import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { asaas } from "@/lib/asaas";
import { schedulePublishEntitlement } from "@/lib/vis-domus-publisher";
import { invalidatePlanFeaturesCache } from "@/lib/plan-features-cache";
import type { SagaDeps, SagaOp, ClaimedSagaOp, CasResult } from "./executor";
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
 *
 * FASE C — lease/fencing:
 *  - claimOp adquire posse (leaseToken novo) via CAS pelo RELÓGIO DO BANCO; só uma
 *    invocação vence. Todo CAS de escrita carrega `AND leaseToken=?` — quem perdeu
 *    o lease não avança nem escreve. O predicado NÃO usa leaseUntil>now: o fencing
 *    é a SUBSTITUIÇÃO do token (novo claim), não o prazo — um token não substituído
 *    ainda conclui (não desperdiça resposta do Asaas levemente atrasada).
 */

// Status de assinatura elegíveis para troca de plano (mesmos do fluxo admin).
const ELIGIBLE_STATUS = ["TRIAL", "ACTIVE", "PAST_DUE"] as const;

// TTL do lease. Maior que o timeout do Asaas (ASAAS_TIMEOUT_MS) + folga de rede/
// scheduler, para o lease não expirar no meio de uma cobrança. Codex: TTL não é
// escolhido isolado — depende do timeout do efeito externo.
const LEASE_TTL_MS = 90_000; // 90s
// Timeout do fetch ao Asaas. < LEASE_TTL_MS (senão o lease expira durante a rede).
const ASAAS_TIMEOUT_MS = 30_000; // 30s

/**
 * Reclama a op para este executor: CAS pelo relógio do BANCO (evita clock-skew
 * endpoint×worker×Neon). Vence se: estado retomável, lease livre (nulo ou
 * expirado) e nextAttemptAt passado (backoff respeitado — contrato com a Fase E).
 * Grava token novo + leaseUntil + incrementa attemptCount. Retorna a op reclamada
 * (com o token) ou null se não conseguiu (ocupado/não-elegível).
 */
export async function claimOp(opId: string, ttlMs: number = LEASE_TTL_MS): Promise<ClaimedSagaOp | null> {
  // Guarda: claimOp é exportado; um ttlMs NaN/negativo/infinito geraria SQL
  // inválido ou lease imediatamente expirado. Fail-fast (achado Codex Fase C).
  // Valida o valor ARREDONDADO (0.4 passaria em >0 mas round→0 = lease vencido).
  const ttlRounded = Math.round(ttlMs);
  if (!Number.isFinite(ttlMs) || ttlRounded <= 0) {
    throw new Error(`ttlMs inválido para claimOp: ${ttlMs}.`);
  }
  const token = randomUUID();
  const ttlInterval = `${ttlRounded} milliseconds`;
  // UPDATE ... RETURNING num único statement: atômico, sem read-then-write.
  // Relógio do banco (now()) em TODAS as comparações, no leaseUntil E no
  // claimedAt (usado como `now` da expiração no runSaga — mesmo relógio).
  const rows = await prisma.$queryRaw<
    Array<{
      id: string; eventId: string; visCompanyId: string; requestedTier: string;
      targetPlanId: string | null; state: string; asaasRef: string | null;
      expiresAt: Date; leaseToken: string; claimedAt: Date;
    }>
  >`
    UPDATE "DomusPlanChangeOp"
    SET "leaseToken" = ${token},
        "leaseUntil" = now() + ${ttlInterval}::interval,
        "attemptCount" = "attemptCount" + 1,
        "lastAttemptAt" = now()
    WHERE "id" = ${opId}
      AND "state" IN ('RECEIVED', 'BILLING_REQUESTED', 'BILLING_CONFIRMED', 'LOCAL_APPLIED')
      AND ("leaseUntil" IS NULL OR "leaseUntil" <= now())
      AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
    RETURNING "id", "eventId", "visCompanyId", "requestedTier", "targetPlanId",
              "state", "asaasRef", "expiresAt", "leaseToken", now() AS "claimedAt"
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    eventId: row.eventId,
    visCompanyId: row.visCompanyId,
    requestedTier: row.requestedTier,
    targetPlanId: row.targetPlanId,
    state: row.state as SagaState,
    asaasRef: row.asaasRef,
    expiresAt: row.expiresAt,
    leaseToken: row.leaseToken,
    claimedAt: row.claimedAt,
  };
}

export function buildSagaDeps(): SagaDeps {
  return {
    async renewLease(op: ClaimedSagaOp): Promise<CasResult> {
      // Estende leaseUntil SÓ se ainda somos o dono (leaseToken) e o estado é
      // retomável. Relógio do banco. Fecha a janela entre claim e I/O externo.
      const res = await prisma.$executeRaw`
        UPDATE "DomusPlanChangeOp"
        SET "leaseUntil" = now() + ${`${LEASE_TTL_MS} milliseconds`}::interval
        WHERE "id" = ${op.id}
          AND "leaseToken" = ${op.leaseToken}
          AND "state" IN ('RECEIVED', 'BILLING_REQUESTED', 'BILLING_CONFIRMED', 'LOCAL_APPLIED')
      `;
      return { applied: res === 1 };
    },

    async confirmBilling(op: ClaimedSagaOp): Promise<{ asaasRef: string }> {
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
      // TIMEOUT no fetch (< TTL do lease): sem isto, o PUT pode passar do TTL e um
      // 2º executor re-claimar durante a rede (Codex Fase C). AbortController
      // cancela o request; a idempotencyKey estável garante que a retomada não
      // dobra a cobrança.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ASAAS_TIMEOUT_MS);
      let updated;
      try {
        // Idempotencykey ESTÁVEL por operação (eventId): retomar NÃO recobra.
        updated = await asaas.subscriptions.update(
          asaasSubscriptionId,
          { value },
          `plan-change:${op.eventId}`,
          ctrl.signal,
        );
      } finally {
        clearTimeout(timer);
      }

      // VALIDA A RESPOSTA (achado Codex Fase C): um 2xx não prova que o recurso
      // CERTO recebeu o valor CERTO. Sem isto, uma resposta vazia/malformada
      // avançaria pra BILLING_CONFIRMED sem cobrança comprovada. O fallback pro
      // idempotencyKey MORREU — ausência de id real é falha, não confirmação.
      if (!updated || updated.id !== asaasSubscriptionId) {
        throw new Error("Resposta do Asaas sem id ou de assinatura divergente — cobrança não confirmada.");
      }
      if (Math.round(updated.value * 100) !== priceApplied) {
        throw new Error(`Valor confirmado pelo Asaas (${updated.value}) ≠ priceApplied (${priceApplied}).`);
      }
      if (updated.cycle !== billingCycle) {
        throw new Error(`Ciclo confirmado pelo Asaas (${updated.cycle}) ≠ billingCycle (${billingCycle}).`);
      }
      // Status ATIVO (achado Codex 2ª rodada): id/valor/ciclo certos NÃO provam
      // recorrência viva. Se o vínculo Asaas aponta pra uma assinatura EXPIRED/
      // INACTIVE, o PUT pode passar mas não haverá próxima cobrança → aplicaríamos
      // o tier sem recorrência. Exige ACTIVE (invariante Asaas-first).
      if (updated.status !== "ACTIVE") {
        throw new Error(`Assinatura Asaas não está ACTIVE (${updated.status}) — recorrência não garantida.`);
      }
      // asaasRef guarda a resposta REAL do Asaas (id da assinatura), validada.
      return { asaasRef: updated.id };
    },

    async applyLocal(op: ClaimedSagaOp): Promise<CasResult> {
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
        // (1) CAS da op como PRIMEIRA escrita, com FENCING por leaseToken. count 0
        //     → op já avançou/mudou OU perdemos o lease: aborta a tx SEM nenhum
        //     efeito (retorna false).
        const cas = await tx.domusPlanChangeOp.updateMany({
          where: { id: op.id, state: "BILLING_CONFIRMED", leaseToken: op.leaseToken },
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

    async publish(op: ClaimedSagaOp): Promise<void> {
      // Ecoa o entitlement de volta pro Domus (fire-and-forget; o pull cobre).
      // FORA de qualquer transação — não é durável e o processo serverless pode
      // congelar após a resposta; o pull diário do Domus é a rede de segurança.
      schedulePublishEntitlement(op.visCompanyId);
    },

    async transition(op: ClaimedSagaOp, from: SagaState, to: SagaState): Promise<CasResult> {
      // CAS de estado com FENCING por leaseToken. Só grava se ainda em `from` E
      // com o token vigente. Carrega timestamps/refs da transição (auditoria).
      const now = new Date();
      const extra: Record<string, unknown> = {};
      if (to === "BILLING_REQUESTED") extra.billingRequestedAt = now;
      if (to === "BILLING_CONFIRMED") {
        extra.billingConfirmedAt = now;
        if (op.asaasRef !== undefined) extra.asaasRef = op.asaasRef;
      }
      const res = await prisma.domusPlanChangeOp.updateMany({
        where: { id: op.id, state: from, leaseToken: op.leaseToken },
        data: { state: to, ...extra },
      });
      return { applied: res.count === 1 };
    },

    async recordError(op: ClaimedSagaOp, from: SagaState, lastError: string): Promise<CasResult> {
      // CAS com FENCING: grava o erro SÓ se ainda em `from` E dono do lease. Nunca
      // altera state. Retorna applied: se perdemos o lease, o erro NÃO sobrescreve
      // o diagnóstico de quem tem a posse (Codex Fase C).
      const res = await prisma.domusPlanChangeOp.updateMany({
        where: { id: op.id, state: from, leaseToken: op.leaseToken },
        data: { lastError, lastAttemptAt: new Date() },
      });
      return { applied: res.count === 1 };
    },

    async markTerminal(op: ClaimedSagaOp, from: SagaState, terminal: SagaState, lastError: string): Promise<CasResult> {
      // CAS com FENCING para um estado terminal. Usado na expiração antes de
      // cobrar (RECEIVED → FAILED_BEFORE_BILLING).
      const res = await prisma.domusPlanChangeOp.updateMany({
        where: { id: op.id, state: from, leaseToken: op.leaseToken },
        data: { state: terminal, lastError, lastAttemptAt: new Date() },
      });
      return { applied: res.count === 1 };
    },

    async reloadOp(op: SagaOp): Promise<{ state: SagaState; asaasRef: string | null; leaseToken: string | null } | null> {
      const row = await prisma.domusPlanChangeOp.findUnique({
        where: { id: op.id },
        select: { state: true, asaasRef: true, leaseToken: true },
      });
      if (!row) return null;
      return { state: row.state as SagaState, asaasRef: row.asaasRef, leaseToken: row.leaseToken };
    },
  };
}
