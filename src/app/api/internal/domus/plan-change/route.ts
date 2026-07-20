import { NextResponse } from "next/server";
import { createHash } from "crypto";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { verifyVisDomus } from "@/lib/vis-domus-hmac";
import { resolvePlanForTier, isPlanTier } from "@/lib/resolve-plan-for-tier";
import { decideSagaAction } from "@/lib/domus-plan-change/saga";
import { runSaga } from "@/lib/domus-plan-change/executor";
import { buildSagaDeps, claimOp } from "@/lib/domus-plan-change/deps";

/**
 * POST /api/internal/domus/plan-change
 *
 * O Domus chama quando o CLIENTE troca de plano na tela dele. O Vis é a fonte
 * de verdade: recebe o pedido, troca o plano/cobrança e ecoa o entitlement de
 * volta (o Domus só reflete quando o webhook ecoa).
 *
 * SEGURANÇA (achados Codex):
 * - HMAC `${ts}.${rawBody}` com segredo GLOBAL DOMUS_VIS_API_SECRET (≠ webhook).
 *   Autentica o Domus como serviço, fail-closed se ausente. NÃO é auth por-tenant.
 * - `visCompanyId` do corpo é AUTORIZADO por validação de produto+vínculo
 *   (VIS_MEDICAL + domusClinicId), 404 genérico se não bater (furo do networks).
 * - Idempotência por `eventId` (NÃO visCompanyId:tier — colide em A→B→A).
 *
 * KILL-SWITCH: VIS_TIER_SELF_SERVICE_ENABLED !== "true" → responde indisponível
 * SEM tocar cobrança. Fica OFF até o Domus mandar eventId estável (outbox) e a
 * cobrança auto-aplicada ser validada em observação.
 */

const WINDOW_LOG = "domus-plan-change";
const OP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function selfServiceEnabled(): boolean {
  return process.env.VIS_TIER_SELF_SERVICE_ENABLED === "true";
}

function hashPayload(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function POST(req: Request) {
  const secret = process.env.DOMUS_VIS_API_SECRET;
  if (!secret) {
    // Fail-closed: sem segredo, não autentica ninguém.
    logger.error("plan-change sem DOMUS_VIS_API_SECRET (fail-closed)", { window: WINDOW_LOG });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const rawBody = await req.text();
  const ts = Number(req.headers.get("x-domus-timestamp"));
  const signature = req.headers.get("x-domus-signature");
  const verify = verifyVisDomus(secret, ts, rawBody, signature, Date.now());
  if (!verify.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Parse depois de autenticar (não vaza forma antes do HMAC).
  let body: { visCompanyId?: string; requestedTier?: string; eventId?: string; idempotencyKey?: string; requestedBy?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { visCompanyId, requestedTier } = body;
  // eventId é o ideal (idempotência correta); enquanto o Domus não migrar do
  // idempotencyKey velho (visCompanyId:tier, bug A→B→A), cai no fallback — mas
  // o endpoint fica atrás do kill-switch justamente por isso.
  const eventId = body.eventId ?? body.idempotencyKey;
  if (!visCompanyId || !requestedTier || !eventId) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!isPlanTier(requestedTier)) {
    return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
  }

  // Autorização de escopo: o visCompanyId do corpo TEM que ser uma company
  // VIS_MEDICAL vinculada. 404 genérico (anti-oráculo) para inexistente/outro
  // produto/não-vinculada — não confia no corpo (furo histórico de networks).
  const company = await prisma.company.findFirst({
    where: { id: visCompanyId, platformProduct: "VIS_MEDICAL", domusClinicId: { not: null } },
    select: { id: true },
  });
  if (!company) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const payloadHash = hashPayload(rawBody);

  // Idempotência + retomada por estado (saga). Busca por eventId.
  const existing = await prisma.domusPlanChangeOp.findUnique({
    where: { eventId },
    select: { state: true, payloadHash: true },
  });
  const decision = decideSagaAction(existing, payloadHash);

  if (decision.kind === "conflict") {
    // Mesmo eventId, corpo diferente = replay ambíguo.
    return NextResponse.json({ error: "conflict" }, { status: 409 });
  }
  if (decision.kind === "duplicate") {
    // Operação já concluída — idempotente, não reaplica.
    return NextResponse.json({ status: "already_applied" }, { status: 200 });
  }
  if (decision.kind === "manual_review") {
    // Op parou num terminal humano (ex: cobrada mas não aplicada). Um replay do
    // Domus NÃO deve reanimá-la — espera intervenção. 409 conflito de estado.
    logger.error("plan-change replay de op em terminal humano (intervenção)", {
      window: WINDOW_LOG,
      visCompanyId,
      state: decision.state,
    });
    return NextResponse.json(
      { error: "manual_review_required", state: decision.state },
      { status: 409 },
    );
  }

  // KILL-SWITCH: só a partir daqui há efeito colateral (cobrança/aplicação).
  // OFF → registra a intenção mas NÃO cobra nem aplica; responde indisponível.
  if (!selfServiceEnabled()) {
    logger.warn("plan-change recebido com self-service OFF (não aplicado)", {
      window: WINDOW_LOG,
      visCompanyId,
      requestedTier,
    });
    return NextResponse.json(
      { error: "self_service_disabled", message: "Troca de plano indisponível. Contate o suporte." },
      { status: 503 },
    );
  }

  // Garante a op existir. No fresh, cria com o plano-alvo resolvido AGORA; no
  // resume, a op já existe (com o targetPlanId persistido na 1ª vez).
  if (decision.kind === "fresh") {
    const targetPlan = await resolvePlanForTier(requestedTier);

    // Assinatura CORRENTE da company: fonte da identidade a congelar na op
    // (subscriptionId/asaasSubscriptionId/ciclo/preço). confirmBilling e
    // applyLocal agem SOBRE ESSE snapshot — nunca cobrar X e aplicar Y.
    // FAIL-CLOSED (achado Codex #2): busca ATÉ 2 elegíveis. 0 → não há o que
    // cobrar; >1 → ambíguo (Subscription não tem unique por company) e escolher
    // "a primeira" faturaria arbitrariamente. Nos dois casos, NÃO cria op.
    const eligible = await prisma.subscription.findMany({
      where: { companyId: visCompanyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
      select: {
        id: true,
        asaasSubscriptionId: true,
        billingCycle: true,
        plan: { select: { priceMonthly: true } },
      },
      take: 2,
    });
    if (eligible.length === 0) {
      logger.error("plan-change sem assinatura elegível (não cria op)", { window: WINDOW_LOG, visCompanyId });
      return NextResponse.json(
        { error: "no_active_subscription", message: "Sem assinatura ativa para trocar de plano." },
        { status: 409 },
      );
    }
    if (eligible.length > 1) {
      logger.error("plan-change com MÚLTIPLAS assinaturas elegíveis (ambíguo, não cria op)", {
        window: WINDOW_LOG,
        visCompanyId,
      });
      return NextResponse.json(
        { error: "ambiguous_subscription", message: "Múltiplas assinaturas ativas — troca requer suporte." },
        { status: 409 },
      );
    }
    const current = eligible[0];

    // Self-service exige assinatura recorrente no Asaas — sem ela não há o que
    // cobrar e o applyLocal liberaria tier sem cobrança. Fail-closed ANTES de
    // criar a op (senão a op de identidade nula falharia em loop ocupando o
    // índice de op ativa e envenenando a company — achado Codex #2).
    if (!current.asaasSubscriptionId) {
      logger.error("plan-change sem asaasSubscriptionId (não auto-aplicável)", { window: WINDOW_LOG, visCompanyId });
      return NextResponse.json(
        { error: "no_recurring_billing", message: "Assinatura sem cobrança recorrente — troca requer suporte." },
        { status: 409 },
      );
    }

    // DOWNGRADE só pode ser AGENDADO pra currentPeriodEnd (spec: o cliente pagou
    // o mês, não perde acesso no meio). O executor de downgrade agendado é a
    // Fase 4 (cron + pendingPlanId). Até lá, REJEITA downgrade (fail-closed) em
    // vez de aplicá-lo imediato — achado Codex. Upgrade segue (Asaas-first imediato).
    if (current.plan.priceMonthly > targetPlan.priceMonthly) {
      return NextResponse.json(
        { error: "downgrade_not_supported", message: "Downgrade ainda não disponível no autoatendimento." },
        { status: 501 },
      );
    }

    // Preço a cobrar (centavos) congelado AGORA para o ciclo da assinatura — não
    // recalculado na cobrança. VALIDADO > 0 (achado Codex #1): sem isso, um plano
    // com priceYearly=0 tentaria cobrar R$0 e liberar tier caro. A validade do
    // congelamento é conferida no executor via expiresAt (achado Codex #3).
    const cycle = current.billingCycle ?? "MONTHLY";
    const priceApplied = cycle === "YEARLY" ? targetPlan.priceYearly : targetPlan.priceMonthly;
    if (!Number.isInteger(priceApplied) || priceApplied <= 0) {
      logger.error("plan-change com preço-alvo inválido (não cria op)", {
        window: WINDOW_LOG,
        visCompanyId,
        priceApplied,
        cycle,
      });
      return NextResponse.json(
        { error: "invalid_plan_price", message: "Plano-alvo com preço inválido — troca indisponível." },
        { status: 409 },
      );
    }

    try {
      await prisma.domusPlanChangeOp.create({
        data: {
          visCompanyId,
          eventId,
          requestedTier,
          targetPlanId: targetPlan.id,
          payloadHash,
          state: "RECEIVED",
          expiresAt: new Date(Date.now() + OP_TTL_MS),
          // Identidade da assinatura PERSISTIDA (Fase B): fixada antes de cobrar.
          subscriptionId: current.id,
          asaasSubscriptionId: current.asaasSubscriptionId,
          billingCycle: cycle,
          priceApplied,
        },
      });
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") {
        // DOIS índices únicos podem colidir: o de eventId e o de op ativa por
        // company. NÃO decidir pelo nome do índice (meta.target é frágil e nem
        // modela índice parcial — achado Codex #4). Em vez disso, RESOLVE POR
        // ESTADO: relê a op por eventId; se existe, é replay/corrida do evento;
        // se NÃO existe, o conflito foi no índice de op ATIVA (outra op da mesma
        // company em voo) → 409. Os ÚNICOS índices únicos que um create pode violar
        // são eventId e o de op-ativa-por-company; sem winner por eventId, só resta
        // o de op ativa (colisão de PK cuid é praticamente impossível).
        const winner = await prisma.domusPlanChangeOp.findUnique({
          where: { eventId },
          select: { state: true, payloadHash: true },
        });
        if (!winner) {
          // eventId livre → a colisão foi no índice de op ativa por company.
          logger.warn("plan-change com troca já em andamento na company (409)", {
            window: WINDOW_LOG,
            visCompanyId,
          });
          return NextResponse.json(
            { error: "change_in_progress", message: "Já há uma troca de plano em andamento." },
            { status: 409 },
          );
        }
        // eventId já existe → double-click do MESMO evento: refaz a decisão.
        const redo = decideSagaAction(winner, payloadHash);
        if (redo.kind === "conflict") {
          return NextResponse.json({ error: "conflict" }, { status: 409 });
        }
        if (redo.kind === "duplicate") {
          return NextResponse.json({ status: "already_applied" }, { status: 200 });
        }
        if (redo.kind === "manual_review") {
          // O vencedor já está num terminal humano — não reanimar (achado Codex:
          // sem isto, caía no 202 accepted mascarando a intervenção pendente).
          return NextResponse.json(
            { error: "manual_review_required", state: redo.state },
            { status: 409 },
          );
        }
        // Perdedor da corrida do MESMO evento: o vencedor já está processando.
        return NextResponse.json({ status: "accepted", state: "in_progress" }, { status: 202 });
      }
      throw err;
    }
  }

  // Localiza a op (fresh recém-criada OU resume) só para obter o id.
  const found = await prisma.domusPlanChangeOp.findUnique({
    where: { eventId },
    select: { id: true },
  });
  if (!found) {
    // Não deveria acontecer (acabamos de garantir), mas fail-safe.
    return NextResponse.json({ error: "op_not_found" }, { status: 500 });
  }

  // FASE C — CLAIM por lease antes de processar. claimOp faz o CAS de posse pelo
  // relógio do banco: só vence se a op é retomável, o lease está livre e o backoff
  // (nextAttemptAt) passou. Retorna a op RECLAMADA (com token) — a saga usa o
  // targetPlanId/identidade PERSISTIDOS, nunca recalculados.
  const claimed = await claimOp(found.id);
  if (!claimed) {
    // claimOp null tem 4 causas (ocupado/backoff/terminal/inexistente). NÃO
    // responder 202 pra todas (achado Codex Fase C): um terminal HUMANO
    // (MANUAL_REVIEW/CHARGED_NOT_APPLIED) mascarado como 202 esconderia o
    // incidente que a decisão inicial não viu (moveu depois da leitura). Relê o
    // estado real e classifica.
    const cur = await prisma.domusPlanChangeOp.findUnique({
      where: { id: found.id },
      select: { state: true },
    });
    if (!cur) {
      return NextResponse.json({ error: "op_not_found" }, { status: 500 });
    }
    if (cur.state === "COMPLETED") {
      return NextResponse.json({ status: "already_applied" }, { status: 200 });
    }
    const human = ["FAILED", "FAILED_BEFORE_BILLING", "CHARGED_NOT_APPLIED", "MANUAL_REVIEW"];
    if (human.includes(cur.state)) {
      logger.error("plan-change: claim falhou, op em terminal humano (409)", {
        window: WINDOW_LOG,
        visCompanyId,
        state: cur.state,
      });
      return NextResponse.json(
        { error: "manual_review_required", state: cur.state },
        { status: 409 },
      );
    }
    // Retomável mas ocupada (outro executor tem o lease) ou em backoff → 202.
    logger.warn("plan-change sem claim (op ocupada/em backoff)", {
      window: WINDOW_LOG,
      visCompanyId,
      state: cur.state,
    });
    return NextResponse.json({ status: "accepted", state: "in_progress" }, { status: 202 });
  }

  // `now` do runSaga = relógio do BANCO no claim (coerência com lease/backoff).
  // O resultado é uma UNIÃO DISCRIMINADA (Fase D): a rota mapeia o `kind` → HTTP,
  // sem combinar flags frágeis (o `failed` antigo transformava um terminal
  // financeiro em 502 em vez de 409 — achado Codex).
  const result = await runSaga(claimed, buildSagaDeps(), claimed.claimedAt);
  switch (result.kind) {
    case "completed":
      return NextResponse.json({ status: "completed", state: result.state }, { status: 200 });
    case "terminal":
      // Parou num terminal humano/financeiro (esgotou/expirou/já-terminal). NÃO é
      // sucesso — 409. Um CHARGED_NOT_APPLIED/MANUAL_REVIEW já disparou o alerta.
      return NextResponse.json(
        { error: "manual_review_required", state: result.state },
        { status: 409 },
      );
    case "lost_lease":
      // Outro executor tomou a posse e conduz — reconhece sem reprocessar.
      return NextResponse.json({ status: "accepted", state: "in_progress" }, { status: 202 });
    case "retryable_failure":
      // Falhou mas retomável (checkpoint preservado). O Domus pode reenviar o
      // mesmo eventId; o worker (Fase E) também retoma. 502.
      return NextResponse.json({ error: "not_completed", state: result.state }, { status: 502 });
  }
}
