import { NextResponse } from "next/server";
import { createHash } from "crypto";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { verifyVisDomus } from "@/lib/vis-domus-hmac";
import { resolvePlanForTier, isPlanTier } from "@/lib/resolve-plan-for-tier";
import { decideSagaAction } from "@/lib/domus-plan-change/saga";
import { runSaga } from "@/lib/domus-plan-change/executor";
import { buildSagaDeps } from "@/lib/domus-plan-change/deps";

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

    // DOWNGRADE só pode ser AGENDADO pra currentPeriodEnd (spec: o cliente pagou
    // o mês, não perde acesso no meio). O executor de downgrade agendado é a
    // Fase 4 (cron + pendingPlanId). Até lá, REJEITA downgrade (fail-closed) em
    // vez de aplicá-lo imediato — achado Codex. Upgrade segue (Asaas-first imediato).
    const current = await prisma.subscription.findFirst({
      where: { companyId: visCompanyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
      select: { plan: { select: { priceMonthly: true } } },
    });
    if (current && current.plan.priceMonthly > targetPlan.priceMonthly) {
      return NextResponse.json(
        { error: "downgrade_not_supported", message: "Downgrade ainda não disponível no autoatendimento." },
        { status: 501 },
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
        },
      });
    } catch (err) {
      // Corrida (double-click): 2 requests com o mesmo eventId viram ambos
      // "fresh" e disputam o create; o @unique(eventId) faz o perdedor pegar
      // P2002. Relê a op vencedora e refaz a decisão (não vira 500).
      if ((err as { code?: string })?.code === "P2002") {
        const winner = await prisma.domusPlanChangeOp.findUnique({
          where: { eventId },
          select: { state: true, payloadHash: true },
        });
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
        // Perdedor da corrida: o vencedor já está processando; só reconhece.
        return NextResponse.json({ status: "accepted", state: "in_progress" }, { status: 202 });
      }
      throw err;
    }
  }

  // Carrega a op COMPLETA (fresh recém-criada OU resume) e executa/retoma a saga.
  // Usa o targetPlanId PERSISTIDO na op — nunca o recalculado — pra não trocar o
  // plano de uma op em voo (achado Codex).
  const op = await prisma.domusPlanChangeOp.findUnique({
    where: { eventId },
    select: { id: true, eventId: true, visCompanyId: true, requestedTier: true, targetPlanId: true, state: true, asaasRef: true },
  });
  if (!op) {
    // Não deveria acontecer (acabamos de garantir), mas fail-safe.
    return NextResponse.json({ error: "op_not_found" }, { status: 500 });
  }

  const result = await runSaga(op, buildSagaDeps());
  if (result.failed) {
    // Saga parou num checkpoint (cobrança/aplicação falhou). Retomável: o Domus
    // pode reenviar o mesmo eventId. 502: o Vis tentou mas não concluiu.
    return NextResponse.json(
      { error: "not_completed", state: result.state },
      { status: 502 },
    );
  }
  // TOCTOU (achado Codex): entre a decisão e o runSaga, a op pode já estar num
  // terminal humano — runSaga não a processa e retorna sem `failed`. NÃO responder
  // 200 nesse caso (mascararia uma op cobrada-sem-plano como sucesso). Só COMPLETED
  // é sucesso; terminal humano → 409; qualquer outro não-completo → 502.
  if (result.state !== "COMPLETED") {
    const human = ["FAILED", "FAILED_BEFORE_BILLING", "CHARGED_NOT_APPLIED", "MANUAL_REVIEW"];
    if (human.includes(result.state)) {
      return NextResponse.json(
        { error: "manual_review_required", state: result.state },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "not_completed", state: result.state }, { status: 502 });
  }
  return NextResponse.json({ status: "completed", state: result.state }, { status: 200 });
}
