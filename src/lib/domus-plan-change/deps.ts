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

// FASE E — backoff exponencial do retry. delay = min(BASE * 2^(attempt-1), TETO),
// com jitter (±25%) para não sincronizar retries de múltiplas ops no mesmo tick.
// attempt é o attemptCount DO ESTADO (reseta no avanço) → cada etapa recomeça o
// backoff, o que é desejável (uma etapa nova não herda a espera da anterior).
const RETRY_BASE_MS = 60_000; // 1min na 1ª falha do estado
const RETRY_CAP_MS = 60 * 60_000; // teto de 1h
const RETRY_JITTER = 0.25; // ±25%

/**
 * Delay (ms) do próximo retry para uma tentativa (1-indexada) do estado atual.
 * Exponencial com teto e jitter simétrico. Exportado para o worker/testes. O
 * jitter usa Math.random (runtime normal) — irrelevante para correção, só
 * dessincroniza. `attempt<=0` cai no BASE (defensivo).
 */
export function retryDelayMs(attempt: number): number {
  const n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 1;
  // 2^(n-1) pode estourar para n grande; Math.min corta antes de virar Infinity.
  const raw = Math.min(RETRY_BASE_MS * 2 ** (n - 1), RETRY_CAP_MS);
  const jitter = raw * RETRY_JITTER * (Math.random() * 2 - 1);
  // Cap ABSOLUTO aplicado DEPOIS do jitter (achado Codex): "teto de 1h" é o máximo
  // real, não "1h ± jitter" (que chegaria a 75min). Piso de 1ms (nunca <= 0).
  return Math.min(RETRY_CAP_MS, Math.max(1, Math.round(raw + jitter)));
}

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
      expiresAt: Date; leaseToken: string; claimedAt: Date; attemptCount: number;
    }>
  >`
    UPDATE "DomusPlanChangeOp"
    SET "leaseToken" = ${token},
        "leaseUntil" = now() + ${ttlInterval}::interval,
        "lastAttemptAt" = now()
    WHERE "id" = ${opId}
      AND "state" IN ('RECEIVED', 'BILLING_REQUESTED', 'BILLING_CONFIRMED', 'LOCAL_APPLIED')
      AND ("leaseUntil" IS NULL OR "leaseUntil" <= now())
      AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
    RETURNING "id", "eventId", "visCompanyId", "requestedTier", "targetPlanId",
              "state", "asaasRef", "expiresAt", "leaseToken", now() AS "claimedAt",
              "attemptCount"
  `;
  // Fase D: o claim NÃO incrementa attemptCount (o beginAttempt faz, por estado).
  // O claim só toma a posse; o contador reflete tentativas DO ESTADO, resetadas no
  // avanço — não aquisições de lease (achado Codex: claim conta posse, não tentativa).
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
    attemptCount: row.attemptCount,
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
      // REVALIDA EXPIRAÇÃO + POSSE PELO RELÓGIO DO BANCO antes de tocar o Asaas
      // (achado Codex P1, 2 rodadas). A checagem no executor usa claimedAt (relógio
      // do CLAIM), que pode estar VELHO se o runSaga demorou entre o claim e aqui
      // (banco lento/preempção). Reconferimos com `now()` do banco:
      //  - expired: op vencida NESSE intervalo → NÃO cobrar preço congelado de dias
      //    atrás. Fail ANTES do Asaas → o executor promove a terminal (MANUAL_REVIEW).
      //  - lostLease: se o lease expirou durante os preflights e OUTRO executor
      //    re-claimou (token trocado), paramos aqui em vez de cobrar duplicado. O CAS
      //    de transição pós-confirmBilling já barraria o avanço, mas cortar ANTES do
      //    PUT evita a cobrança redundante.
      // JANELA RESIDUAL (dívida aceitável, documentada — Codex): entre este SELECT e
      // o PUT abaixo ainda há leituras de identidade/assinatura; uma expiração ou
      // troca de lease nesse vão de ms não é capturada. É inevitável (banco e Asaas
      // não são atômicos) e pequena; o fencing do transition seguinte é a rede final.
      const guardRows = await prisma.$queryRaw<Array<{ expired: boolean; mine: boolean }>>`
        SELECT ("expiresAt" <= now()) AS "expired",
               ("leaseToken" = ${op.leaseToken}) AS "mine"
        FROM "DomusPlanChangeOp" WHERE "id" = ${op.id}
      `;
      if (!guardRows[0]) throw new Error("Op não encontrada para cobrança.");
      if (guardRows[0].expired) {
        throw new Error("Op expirada antes da cobrança (revalidada pelo relógio do banco).");
      }
      if (!guardRows[0].mine) {
        throw new Error("Lease perdido antes da cobrança — outro executor reclamou a op.");
      }

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
          // Avanço reseta attemptCount=0 (Fase D): o contador é POR ESTADO.
          data: { state: "LOCAL_APPLIED", attemptCount: 0 },
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

    async beginAttempt(op: ClaimedSagaOp, state: SagaState): Promise<{ attemptCount: number }> {
      // CONTADOR POR ESTADO (Fase D): incrementa attemptCount SÓ se a op ainda está
      // em `state` E com o token vigente, e RETORNA o novo valor. Chamado antes de
      // cada passo falível. count 0 (estado mudou / lease perdido) → retorna 0, o
      // executor faz resync. UPDATE...RETURNING atômico (sem read-then-write).
      const rows = await prisma.$queryRaw<Array<{ attemptCount: number }>>`
        UPDATE "DomusPlanChangeOp"
        SET "attemptCount" = "attemptCount" + 1, "lastAttemptAt" = now()
        WHERE "id" = ${op.id} AND "state" = ${state}::"DomusPlanChangeOpState"
          AND "leaseToken" = ${op.leaseToken}
        RETURNING "attemptCount"
      `;
      return { attemptCount: rows[0]?.attemptCount ?? 0 };
    },

    async scheduleRetry(op: ClaimedSagaOp, from: SagaState): Promise<CasResult> {
      // FASE E — BACKOFF + RELEASE atômicos (achados Codex #4/#5). Um único CAS
      // com FENCING por leaseToken:
      //  - nextAttemptAt = now() + delay  → BASE do banco (não claimedAt, que pode
      //    estar velho após um runSaga longo; achado Codex #5).
      //  - leaseToken/leaseUntil = NULL   → RELEASE (separa release de backoff: sem
      //    isto o lease preso ~90s seria o único throttle; achado Codex Fase C/E).
      // WHERE state=from AND leaseToken=meu → count 0 = perdi a posse/estado mudou:
      // NÃO agendo (quem tem o lease conduz).
      //
      // O `delay` (com jitter) é calculado no PROCESSO, a partir do attemptCount
      // ATUAL do estado. NÃO uso `op.attemptCount` (o valor do CLAIM, defasado: o
      // beginAttempt incrementou o contador DEPOIS do claim e não voltou pro objeto
      // do worker). Leio o valor fresco SOB O LEASE — como seguramos o token, nenhum
      // outro executor altera o contador entre a leitura e o UPDATE (fencing), então
      // não há corrida real. Se a op mudou por baixo, o UPDATE final não pega (CAS).
      const cur = await prisma.domusPlanChangeOp.findUnique({
        where: { id: op.id },
        select: { attemptCount: true },
      });
      const attempt = cur?.attemptCount ?? op.attemptCount;
      const delayMs = Math.round(retryDelayMs(attempt));
      const interval = `${delayMs} milliseconds`;
      const res = await prisma.$executeRaw`
        UPDATE "DomusPlanChangeOp"
        SET "nextAttemptAt" = now() + ${interval}::interval,
            "leaseToken" = NULL,
            "leaseUntil" = NULL
        WHERE "id" = ${op.id}
          AND "state" = ${from}::"DomusPlanChangeOpState"
          AND "leaseToken" = ${op.leaseToken}
      `;
      return { applied: res === 1 };
    },

    async releaseLease(op: ClaimedSagaOp): Promise<CasResult> {
      // RELEASE de EMERGÊNCIA (achado Codex #catch): libera o lease + agenda backoff
      // sem saber o estado exato (o runSaga pode ter avançado antes de lançar). CAS
      // fenced SÓ pelo leaseToken, aceitando QUALQUER estado retomável. Lê o
      // attemptCount fresco sob o lease para o delay refletir o estado REAL. Se o
      // estado virou terminal ou o token trocou, o UPDATE não pega (applied:false) —
      // não há lease nosso a soltar.
      const cur = await prisma.domusPlanChangeOp.findUnique({
        where: { id: op.id },
        select: { attemptCount: true },
      });
      const delayMs = Math.round(retryDelayMs(cur?.attemptCount ?? op.attemptCount));
      const interval = `${delayMs} milliseconds`;
      const res = await prisma.$executeRaw`
        UPDATE "DomusPlanChangeOp"
        SET "nextAttemptAt" = now() + ${interval}::interval,
            "leaseToken" = NULL,
            "leaseUntil" = NULL
        WHERE "id" = ${op.id}
          AND "leaseToken" = ${op.leaseToken}
          AND "state" IN ('RECEIVED', 'BILLING_REQUESTED', 'BILLING_CONFIRMED', 'LOCAL_APPLIED')
      `;
      return { applied: res === 1 };
    },

    async transition(op: ClaimedSagaOp, from: SagaState, to: SagaState): Promise<CasResult> {
      // CAS de estado com FENCING por leaseToken. Só grava se ainda em `from` E
      // com o token vigente. O AVANÇO reseta attemptCount=0 (Fase D: contador por
      // estado). Carrega timestamps/refs da transição (auditoria).
      const now = new Date();
      const extra: Record<string, unknown> = { attemptCount: 0 };
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
      // CAS com FENCING para um estado terminal SEGURO (sem alerta). Usado na
      // expiração antes de cobrar (RECEIVED → FAILED_BEFORE_BILLING).
      const res = await prisma.domusPlanChangeOp.updateMany({
        where: { id: op.id, state: from, leaseToken: op.leaseToken },
        data: { state: terminal, lastError, lastAttemptAt: new Date() },
      });
      return { applied: res.count === 1 };
    },

    async markFinancialTerminalAndAlert(
      op: ClaimedSagaOp,
      from: SagaState,
      terminal: "CHARGED_NOT_APPLIED" | "MANUAL_REVIEW",
      lastError: string,
    ): Promise<CasResult> {
      // ATÔMICO (achado Codex Fase D): CAS terminal + SystemEvent no MESMO commit.
      // Se o processo morrer entre promover e alertar, a op fica terminal e ninguém
      // repete (claimOp não reclama terminal) → o alerta se perderia. Aqui: terminal
      // implica evento; falha ao criar evento reverte a promoção (op segue retomável).
      const dedupeKey = `plan-change:${op.id}:${terminal === "CHARGED_NOT_APPLIED" ? "charged-unapplied" : "manual-review"}`;
      const title = terminal === "CHARGED_NOT_APPLIED"
        ? "Troca de plano: cliente cobrado sem receber o plano"
        : "Troca de plano: resultado de cobrança ambíguo (revisar no Asaas)";
      const detail = `Op ${op.id} (company ${op.visCompanyId}, tier ${op.requestedTier}) parou em ${from}. ${lastError}`;

      const applied = await prisma.$transaction(async (tx) => {
        // (1) CAS terminal com FENCING. count 0 → não é nosso / já mudou: aborta.
        const cas = await tx.domusPlanChangeOp.updateMany({
          where: { id: op.id, state: from, leaseToken: op.leaseToken },
          data: { state: terminal, lastError, lastAttemptAt: new Date() },
        });
        if (cas.count !== 1) return false;
        // (2) SystemEvent no MESMO commit. dedupeKey `billing:*` (NÃO `*:auto`) →
        //     o health cron não o auto-resolve (fix D2). severity critical.
        //     upsert idempotente: retry do mesmo terminal não duplica.
        await tx.systemEvent.upsert({
          where: { dedupeKey },
          create: { source: "billing", severity: "critical", title, detail, dedupeKey },
          update: {}, // já existe → não sobrescreve (idempotente)
        });
        return true;
      });
      return { applied };
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
