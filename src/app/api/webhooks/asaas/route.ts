import { NextResponse } from "next/server";
import type { SubscriptionStatus } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { asaas } from "@/lib/asaas";
import { trackServer } from "@/lib/posthog-server";
import { rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { captureMessage } from "@/lib/sentry";
import { notifyCompany } from "@/services/saas-notification.service";
import { publishEntitlementForCompany } from "@/lib/vis-domus-publisher";
import {
  ACTIVATABLE_FROM,
  INVOICE_REF_PREFIX,
  parseRefId,
  resolvePaymentTarget,
  type PaymentEventRefs,
  type TargetResolution,
} from "@/lib/asaas-payment-target";
import {
  arbitrateAccessEvent,
  decideObligationPromotion,
  type ObligationEvidence,
} from "@/lib/asaas-obligation-arbitration";
import { isWebhookAccessEffectEnabled } from "@/lib/billing-engine-flags";

const log = logger.child({ webhook: "asaas" });

/**
 * H6: HMAC do payload — defesa em profundidade contra token bearer vazado
 * (logs/proxy). Com o token comprometido, sem HMAC o atacante forja
 * pagamentos/cancelamentos. Configure ASAAS_WEBHOOK_HMAC_SECRET no painel
 * Asaas + Vercel.
 *
 * Política (fail-closed em produção):
 *   - secret setado  → HMAC SEMPRE exigido (qualquer ambiente).
 *   - secret ausente em produção → recusa, a menos que o kill-switch
 *     ALLOW_UNSIGNED_ASAAS_WEBHOOK=1 esteja setado (escape hatch p/ rollout).
 *   - secret ausente fora de produção → permitido (dev/preview).
 *
 * Retorna { ok, reason } para o caller logar o motivo da recusa.
 */
function verifyAsaasHmac(
  rawBody: string,
  sigHeader: string | null,
): { ok: boolean; reason?: string } {
  const secret = process.env.ASAAS_WEBHOOK_HMAC_SECRET;

  if (!secret) {
    const isProd = process.env.NODE_ENV === "production";
    const bypass = process.env.ALLOW_UNSIGNED_ASAAS_WEBHOOK === "1";
    if (isProd && !bypass) {
      return { ok: false, reason: "hmac_secret_missing_in_prod" };
    }
    return { ok: true }; // dev/preview ou bypass explícito
  }

  if (!sigHeader) return { ok: false, reason: "signature_header_missing" };

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = sigHeader.replace(/^sha256=/, "").trim();

  if (expected.length !== got.length) return { ok: false, reason: "length_mismatch" };
  try {
    const match = timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(got, "hex"),
    );
    return match ? { ok: true } : { ok: false, reason: "signature_mismatch" };
  } catch {
    return { ok: false, reason: "signature_decode_error" };
  }
}

/**
 * Webhook do Asaas.
 *
 * Eventos relevantes:
 *   PAYMENT_CONFIRMED        — pagamento confirmado (PIX/cartão imediato)
 *   PAYMENT_RECEIVED         — recebido (boleto compensado)
 *   PAYMENT_OVERDUE          — atrasado
 *   PAYMENT_REFUNDED         — estornado
 *   PAYMENT_CHARGEBACK_REQUESTED — disputa de cartão
 *   SUBSCRIPTION_DELETED     — assinatura cancelada
 *
 * Idempotência: usa `event.id` (Asaas garante único) como `externalEventId`
 * em BillingEvent. Tentativa duplicada retorna 200 sem reprocessar.
 */

interface AsaasWebhookEvent {
  id: string;
  event: string;
  dateCreated?: string;
  payment?: {
    id: string;
    customer: string;
    subscription?: string;
    value: number;
    netValue?: number;
    status: string;
    externalReference?: string;
    invoiceUrl?: string;
  };
  subscription?: {
    id: string;
    customer: string;
    status: string;
    externalReference?: string;
  };
}

/**
 * Status a partir dos quais um pagamento ATIVA a assinatura.
 *
 * A anotação `SubscriptionStatus[]` (em vez de `string[]`) é intencional: se um
 * valor do enum for renomeado, isto quebra o BUILD. Uma lista de strings soltas
 * viraria um filtro que nunca casa, e a ativação sumiria em silêncio.
 */
const ACTIVATABLE_STATUSES: SubscriptionStatus[] = [...ACTIVATABLE_FROM];

/**
 * Eventos em que NÃO resolver o alvo significa perder dinheiro/acesso — devem
 * ser reenviados pelo Asaas em vez de arquivados. Cancelamento de assinatura
 * fica de fora: sem assinatura local, não há o que cancelar.
 */
const PAYMENT_EVENTS_REQUIRING_TARGET: string[] = [
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
];

const SUB_EVIDENCE_SELECT = {
  id: true,
  companyId: true,
  status: true,
  asaasCustomerId: true,
  asaasSubscriptionId: true,
} as const;

const INVOICE_EVIDENCE_SELECT = {
  id: true,
  subscriptionId: true,
  asaasPaymentId: true,
  status: true,
  periodEnd: true,
  // Finalidade da cobrança: avulsa (taxa/hardware) não controla acesso.
  isManual: true,
} as const;

/**
 * Carrega do banco a evidência que `resolvePaymentTarget` precisa e delega a
 * DECISÃO para ele (função pura, testada isoladamente).
 *
 * A separação é de propósito: as regras de concordância entre identificadores
 * são o coração da segurança desta rota e não podem depender de banco para
 * serem exercitadas.
 */
async function resolveTargetFromDb(refs: PaymentEventRefs): Promise<TargetResolution> {
  const invoiceId = parseRefId(refs.externalRef, INVOICE_REF_PREFIX);

  const [byExternalRef, bySubscriptionRef, byPaymentId] = await Promise.all([
    invoiceId
      ? prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: INVOICE_EVIDENCE_SELECT,
        })
      : Promise.resolve(null),
    refs.subscriptionRef
      ? prisma.subscription.findFirst({
          where: { asaasSubscriptionId: refs.subscriptionRef },
          select: SUB_EVIDENCE_SELECT,
        })
      : Promise.resolve(null),
    refs.paymentId
      ? prisma.invoice.findMany({
          where: { asaasPaymentId: refs.paymentId },
          select: INVOICE_EVIDENCE_SELECT,
          // 2 basta para DETECTAR ambiguidade sem varrer a tabela: o banco só
          // garante @@unique([subscriptionId, asaasPaymentId]).
          take: 2,
        })
      : Promise.resolve([]),
  ]);

  const [invoiceSubscription, paymentIdSubscription] = await Promise.all([
    byExternalRef
      ? prisma.subscription.findUnique({
          where: { id: byExternalRef.subscriptionId },
          select: SUB_EVIDENCE_SELECT,
        })
      : Promise.resolve(null),
    byPaymentId.length === 1
      ? prisma.subscription.findUnique({
          where: { id: byPaymentId[0].subscriptionId },
          select: SUB_EVIDENCE_SELECT,
        })
      : Promise.resolve(null),
  ]);

  return resolvePaymentTarget(refs, {
    byExternalRef,
    bySubscriptionRef,
    invoiceSubscription,
    byPaymentId,
    paymentIdSubscription,
  });
}

export async function POST(request: Request) {
  // Q5.1: Rate limit por IP. Asaas legítimo envia ~10-30 webhooks/min mesmo
  // em ondas; 120/min absorve picos sem bloquear. Bloqueia replay malicioso
  // (token vazado já mitiga, mas defesa em profundidade).
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limited = rateLimitResponse(`webhook:asaas:${ip}`, {
    maxRequests: 120,
    windowMs: 60_000,
  });
  if (limited) {
    log.warn("Rate limit excedido", { ip });
    return limited;
  }

  // Validar token do webhook (asaas-access-token header)
  const token = request.headers.get("asaas-access-token");
  if (!asaas.verifyWebhookToken(token)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  // H6: HMAC obrigatório (fail-closed em prod). Lemos raw antes do JSON parse
  // pra preservar bytes exatos assinados.
  const rawBody = await request.text();
  const signature =
    request.headers.get("asaas-signature") ||
    request.headers.get("x-asaas-signature");
  const hmac = verifyAsaasHmac(rawBody, signature);
  if (!hmac.ok) {
    log.warn("HMAC inválido", { ip, hasSignature: !!signature, reason: hmac.reason });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: AsaasWebhookEvent;
  try {
    event = JSON.parse(rawBody) as AsaasWebhookEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!event?.id || !event?.event) {
    return NextResponse.json({ error: "malformed event" }, { status: 400 });
  }

  // Idempotência: BillingEvent.externalEventId é unique
  const existing = await prisma.billingEvent.findUnique({
    where: { externalEventId: event.id },
  });
  if (existing?.processedAt) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Tenta resolver companyId via Subscription
  const subRef =
    event.payment?.subscription ?? event.subscription?.id ?? null;
  const externalRef =
    event.payment?.externalReference ?? event.subscription?.externalReference ?? null;

  // Carrega a EVIDÊNCIA e resolve o alvo (ver asaas-payment-target.ts).
  //
  // 🔥 O furo que isto fecha: a cobrança AVULSA sai com
  // `externalReference = "invoice:<id>"` e sem `asaasSubscriptionId`. Antes, ela
  // não resolvia subscription nenhuma → a Subscription nunca virava ACTIVE e
  // `publishEntitlementForCompany` (dentro do `if (subscriptionDbId)`) nunca
  // rodava: o cliente pagava e continuava bloqueado no Domus.
  const target = await resolveTargetFromDb({
    paymentId: event.payment?.id ?? null,
    customerId: event.payment?.customer ?? null,
    subscriptionRef: subRef,
    externalRef,
  });

  // Referências contraditórias: NÃO decidir é mais seguro que escolher a
  // primeira que casar e mexer no acesso da empresa errada. 500 → Asaas reenvia.
  if (target.kind === "conflict") {
    log.error("Referências do evento Asaas divergem — não processado", {
      eventId: event.id,
      eventType: event.event,
      reason: target.reason,
    });
    captureMessage(`Webhook Asaas ${event.id}: referências divergentes (${target.reason})`, {
      level: "error",
      extra: { eventType: event.event, externalRef, subRef },
    });
    return NextResponse.json({ error: "ambiguous references" }, { status: 500 });
  }

  // 🔥 Evento de PAGAMENTO que traz referência forte mas não resolveu nada:
  // pedir REENVIO em vez de arquivar. A corrida real é o checkout — a cobrança
  // é criada no Asaas ANTES do commit local (`billing/checkout`), então um
  // webhook muito rápido não acha a Subscription ainda. Marcar `processedAt` e
  // responder 200 ali descartaria o pagamento PARA SEMPRE: o cliente pagou e
  // ficaria em TRIAL/TRIAL_EXPIRED, que é o mesmo defeito que esta correção
  // existe para consertar.
  //
  // Restrito a eventos de pagamento COM referência: evento sem referência
  // nenhuma (ou de outros tipos) segue arquivado como antes — devolver 500 para
  // tudo que não conhecemos transformaria ruído em reentrega infinita.
  if (
    target.kind === "unresolved" &&
    PAYMENT_EVENTS_REQUIRING_TARGET.includes(event.event) &&
    (externalRef !== null || subRef !== null)
  ) {
    log.warn("Evento de pagamento com referência não resolvida — pedindo reenvio", {
      eventId: event.id,
      eventType: event.event,
      externalRef,
      subRef,
    });
    return NextResponse.json({ error: "target not found yet" }, { status: 500 });
  }

  const companyId: string | null =
    target.kind === "resolved" ? target.companyId : null;
  const subscriptionDbId: string | null =
    target.kind === "resolved" ? target.subscriptionDbId : null;
  const resolvedInvoiceId: string | null =
    target.kind === "resolved" ? target.invoiceId : null;
  const invoicePeriodEnd: Date | null =
    target.kind === "resolved" ? target.invoicePeriodEnd : null;
  /**
   * A cobrança tem autoridade sobre o ACESSO (ativar/rebaixar/publicar
   * entitlement)? Decidido pela finalidade PERSISTIDA na fatura
   * (`Invoice.isManual`), não pelo formato do evento do Asaas — ver
   * `controlsAccess` em asaas-payment-target.ts.
   */
  const controlsAccess: boolean =
    target.kind === "resolved" ? target.controlsAccess : false;

  /**
   * Os efeitos de ACESSO deste webhook estão liberados? (modo observação)
   *
   * Lido UMA vez por evento, no topo, para que todos os ramos do `switch`
   * enxerguem o mesmo valor — ler a env var em cada ramo abriria a porta para
   * um ramo ser gateado e outro não, que é justamente o formato de bug que o
   * gate existe para evitar.
   */
  const accessEffectEnabled = isWebhookAccessEffectEnabled();

  /**
   * Obrigação vinculada à fatura deste evento — a segunda dimensão da decisão.
   *
   * 🔑 `controlsAccess` (acima) responde "esta cobrança é a MENSALIDADE?" pela
   * finalidade persistida em `Invoice.isManual`. Esta leitura responde "a dívida
   * deste período ainda está em aberto?". Uma não substitui a outra: sem a
   * primeira, uma taxa avulsa vencida tranca a clínica; sem a segunda, um
   * `PAYMENT_OVERDUE` atrasado de tentativa superada rebaixa quem já pagou.
   *
   * Fica `null` quando a fatura não tem vínculo — as 8 faturas legadas de
   * produção e TODA cobrança manual/avulsa, para sempre. Nesse caso o fluxo
   * antigo segue exatamente como era.
   */
  let obligation: ObligationEvidence | null = null;
  if (resolvedInvoiceId) {
    const linked = await prisma.invoice.findUnique({
      where: { id: resolvedInvoiceId },
      select: {
        billingObligation: {
          select: { id: true, state: true, invoiceId: true, disposition: true },
        },
      },
    });
    obligation = linked?.billingObligation ?? null;
  }

  // Cria/atualiza BillingEvent
  const billingEvent = await prisma.billingEvent.upsert({
    where: { externalEventId: event.id },
    create: {
      externalEventId: event.id,
      gateway: "asaas",
      eventType: event.event,
      payload: event as unknown as object,
      companyId,
    },
    update: {
      payload: event as unknown as object,
      retryCount: { increment: 1 },
    },
  });

  // Processa por tipo
  try {
    switch (event.event) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED": {
        // `controlsAccess` false = cobrança AVULSA (taxa/hardware). A fatura é
        // marcada PAID abaixo, mas pagar uma taxa não compra mensalidade: nem
        // ativa, nem estende período, nem publica entitlement.
        //
        // 🔒 MODO OBSERVAÇÃO (`BILLING_WEBHOOK_ACCESS_ENABLED`): enquanto a flag
        // estiver desligada, o evento é REGISTRADO e a fatura é marcada paga,
        // mas nada que mexa em ACESSO acontece. Ver o docblock da flag: este
        // caminho nunca rodou em produção (zero BillingEvent no histórico) e
        // publica entitlement de prontuário médico. O primeiro evento real
        // serve de ensaio; depois de conferido, liga-se a flag.
        if (subscriptionDbId && controlsAccess && !accessEffectEnabled) {
          log.warn("modo observação: efeitos de acesso SUPRIMIDOS", {
            eventId: event.id,
            eventType: event.event,
            subscriptionId: subscriptionDbId,
            companyId,
            // O que TERIA acontecido, para conferência antes de ligar a flag:
            wouldActivateOrRenew: true,
            wouldPublishEntitlement: companyId !== null,
          });
        }
        if (subscriptionDbId && controlsAccess && accessEffectEnabled) {
          // 🔑 `updateMany` com guarda de status, NÃO `update` incondicional.
          // O único estado que um pagamento NÃO recupera é CANCELED — decisão
          // deliberada (dono cancelou, ou dunning cancelou aos 30d após avisos).
          // Um webhook atrasado é o caso "fatura antiga chegando depois" e não
          // pode ressuscitá-lo. Todos os demais (inclusive SUSPENDED e
          // TRIAL_EXPIRED, que são AUTOMÁTICOS) voltam ao pagar — ver
          // ACTIVATABLE_FROM.
          const activated = await prisma.subscription.updateMany({
            where: { id: subscriptionDbId, status: { in: ACTIVATABLE_STATUSES } },
            data: {
              status: "ACTIVE",
              pastDueSince: null,
              lastDunningStage: null, // F5: recuperou → zera a régua p/ próxima inadimplência avisar do zero
              currentPeriodStart: new Date(),
              // Período coberto vem da PRÓPRIA fatura paga, quando a conhecemos.
              // Derivar de billingCycle criaria uma segunda verdade divergindo
              // do periodEnd que a Invoice já carrega.
              ...(invoicePeriodEnd && { currentPeriodEnd: invoicePeriodEnd }),
            },
          });
          if (activated.count > 0) {
            // activatedAt = momento da PRIMEIRA ativação; não sobrescrever em
            // reenvios (idempotência) — preserva a data real de ativação.
            await prisma.subscription.updateMany({
              where: { id: subscriptionDbId, activatedAt: null },
              data: { activatedAt: new Date() },
            });
            // Propaga writeAllowed=true ao Domus na hora (Cadeado, simetria do bloqueio):
            // cliente pagou → DESbloqueia escrita clínica sem esperar o pull diário
            // (senão ficaria bloqueado ~24h APÓS pagar). AWAIT best-effort (ver ramo CANCELED).
            if (companyId) await publishEntitlementForCompany(companyId);
          } else if (invoicePeriodEnd) {
            // 📌 DÍVIDA: sem Invoice local identificada não há período para
            // avançar (fica no `else` abaixo). Inventar a data a partir de
            // billingCycle recriaria a segunda verdade que este ramo evita. Só
            // acontece no caminho recorrente puro — hoje ZERO assinaturas têm
            // asaasSubscriptionId, então não afeta nenhum cliente atual.
            //
            // RENOVAÇÃO: quem já está ACTIVE não "ativa" de novo, mas o período
            // precisa AVANÇAR — senão a mensalidade paga não estende nada e o
            // agendamento de troca de plano (que lê currentPeriodEnd) usa data
            // velha. Só avança para FRENTE: um webhook atrasado de fatura antiga
            // não pode ENCURTAR um período já pago.
            const renewed = await prisma.subscription.updateMany({
              where: {
                id: subscriptionDbId,
                status: "ACTIVE",
                OR: [
                  { currentPeriodEnd: null },
                  { currentPeriodEnd: { lt: invoicePeriodEnd } },
                ],
              },
              data: { currentPeriodEnd: invoicePeriodEnd },
            });
            if (renewed.count === 0) {
              log.warn("Pagamento confirmado não alterou a assinatura", {
                eventId: event.id,
                subscriptionId: subscriptionDbId,
              });
            }
          } else {
            log.warn("Pagamento confirmado não ativou a assinatura (status não elegível)", {
              eventId: event.id,
              subscriptionId: subscriptionDbId,
            });
          }
        }
        // Atualiza a Invoice pelo PK quando resolvida; `asaasPaymentId` sozinho
        // NÃO é unique (só @@unique([subscriptionId, asaasPaymentId])), então
        // usá-lo como chave de update podia atingir mais de uma linha.
        if (resolvedInvoiceId) {
          await prisma.invoice.update({
            where: { id: resolvedInvoiceId },
            data: {
              status: "PAID",
              paidAt: new Date(),
              paymentConfirmed: true,
              paymentConfirmedAt: new Date(),
            },
          });
          // Backfill do vínculo quando a cobrança foi resolvida por
          // `invoice:<id>` antes de o id do pagamento ter sido persistido (a
          // corrida do QR PIX).
          //
          // 🔑 Guarda ATÔMICA no próprio WHERE, não no update acima: entre a
          // leitura da evidência e esta escrita, o `ensureInvoiceCharge` pode
          // ter gravado outro id. Sem `asaasPaymentId: null` no filtro, nós o
          // sobrescreveríamos — a leitura anterior não vale como garantia.
          if (event.payment?.id) {
            await prisma.invoice.updateMany({
              where: { id: resolvedInvoiceId, asaasPaymentId: null },
              data: { asaasPaymentId: event.payment.id },
            });
          }
        } else if (event.payment?.id) {
          await prisma.invoice.updateMany({
            where: { asaasPaymentId: event.payment.id },
            data: {
              status: "PAID",
              paidAt: new Date(),
              paymentConfirmed: true,
              paymentConfirmedAt: new Date(),
            },
          });
        }

        // ── A OBRIGAÇÃO É QUITADA AQUI (Task 8) ─────────────────────────────
        //
        // 🔥 O defeito que isto conserta: sem esta escrita a fatura virava `PAID`
        // e a obrigação seguia `ISSUED` com `dueAt` no passado — o gatilho EXATO
        // de I1, ou seja, restringir o acesso de quem acabou de pagar. As duas
        // obrigações que o bootstrap cria estão amarradas a faturas com PIX vivo,
        // então este é o caminho real, não hipótese.
        //
        // Vale para `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` (mesmo `case`): PIX/
        // cartão e boleto compensado são os dois caminhos do dinheiro, e o Asaas
        // não garante qual chega nem em que ordem.
        if (resolvedInvoiceId) {
          const decision = decideObligationPromotion(resolvedInvoiceId, obligation);

          if (decision.action === "promote" && obligation) {
            // CAS com guarda de estado E de `invoiceId`.
            //
            // 🔑 O `invoiceId` no WHERE não é redundante com a decisão acima: ela
            // foi tomada sobre um ponteiro LIDO antes desta escrita, e uma
            // reemissão pode ter trocado a tentativa vigente no intervalo. Sem
            // ele, o CAS quitaria o período pela fatura ERRADA, deixando a
            // tentativa nova cobrável.
            //
            // `state` no `in` em vez de `not: PAID`: `VOID` NÃO pode ser
            // promovida (já barrada acima, e aqui de novo — a guarda do banco é a
            // que vale sob concorrência).
            const promoted = await prisma.billingObligation.updateMany({
              where: {
                id: obligation.id,
                invoiceId: resolvedInvoiceId,
                state: { in: ["PLANNED", "ISSUED"] },
              },
              data: { state: "PAID", paidAt: new Date() },
            });
            if (promoted.count === 0) {
              // Perdeu a corrida (outro evento/o motor mudou o estado ou a
              // tentativa). Não insiste: o estado de lá é mais recente.
              log.info("Obrigação não promovida — estado mudou entre a leitura e o CAS", {
                eventId: event.id,
                obligationId: obligation.id,
                invoiceId: resolvedInvoiceId,
              });
            }
          } else if (decision.action === "needs_review") {
            log.error("Pagamento não pôde quitar a obrigação vinculada", {
              eventId: event.id,
              invoiceId: resolvedInvoiceId,
              reason: decision.reason,
            });
            captureMessage(
              `Webhook Asaas ${event.id}: pagamento não quitou a obrigação (${decision.reason})`,
              { level: "warning", extra: { invoiceId: resolvedInvoiceId, companyId } },
            );
          } else if (decision.action === "paid_but_unresolved") {
            // 🔴 ALERTA ALTO, não log. O cliente PAGOU e a obrigação segue em
            // aberto: se `dueAt` já venceu, I1 restringe quem pagou, e a
            // tentativa vigente continua cobrável — bloqueado E cobrado de novo
            // pelo mesmo período. Precisa de mão humana hoje, não no relatório.
            log.error("PAGAMENTO SEM QUITAR OBRIGAÇÃO — risco de restringir quem pagou", {
              eventId: event.id,
              invoiceId: resolvedInvoiceId,
              companyId,
              reason: decision.reason,
            });
            captureMessage(
              `Webhook Asaas ${event.id}: PAGOU e a obrigação seguiu em aberto (${decision.reason})`,
              { level: "error", extra: { invoiceId: resolvedInvoiceId, companyId } },
            );
          }
        }

        if (companyId) {
          await trackServer(companyId, "payment_succeeded", {
            asaasPaymentId: event.payment?.id,
            value: event.payment?.value,
          });
        }
        if (companyId) {
          const amountLabel =
            event.payment?.value != null
              ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(event.payment.value)
              : "";
          const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
          await notifyCompany(
            companyId,
            "PAYMENT_CONFIRMED",
            { name: company?.name ?? "Cliente", amountLabel },
            {
              periodKey: `pay:${event.payment?.id ?? event.id}`,
              channels: ["email", "inapp"],
              inapp: {
                title: "Pagamento confirmado",
                message: `Recebemos seu pagamento${amountLabel ? ` de ${amountLabel}` : ""}. Obrigado!`,
                link: "/dashboard/configuracoes",
              },
            },
          );
        }
        break;
      }

      case "PAYMENT_OVERDUE": {
        // 🔑 ESCOPO DELIBERADO: só a cobrança da MENSALIDADE rebaixa a assinatura.
        //
        // Antes desta correção, uma cobrança avulsa nunca resolvia subscription
        // e portanto nunca podia rebaixar ninguém. Agora ela resolve — e deixar
        // o rebaixamento valer para ela seria uma REGRESSÃO NOVA:
        // `createManualCharge` aceita valor e descrição arbitrários (taxa de
        // implantação, hardware), então uma taxa avulsa vencida bloquearia a
        // clínica inteira. Pior ainda sem dedupe empresa+mês: de duas cobranças
        // concorrentes, a vencida rebaixaria quem já pagou a mensalidade.
        //
        // ── SOMA-SE a isto a arbitragem PELO ESTADO DA OBRIGAÇÃO (Task 8) ────
        //
        // 🔥 O caso que ela conserta: com várias TENTATIVAS por obrigação (spec
        // §4.2 — reemitir aponta outra fatura para a mesma obrigação), um
        // `PAYMENT_OVERDUE` atrasado da tentativa SUPERADA chega depois de a
        // obrigação estar `PAID`. Pela regra antiga ele rebaixaria a assinatura
        // por ser "fatura não manual vencida" — rebaixando quem já pagou.
        //
        // As duas condições valem JUNTAS: `controlsAccess` diz se a cobrança é a
        // mensalidade; a arbitragem diz se a dívida do período ainda existe.
        const accessArbitration = arbitrateAccessEvent(resolvedInvoiceId, obligation);
        if (!accessArbitration.controls) {
          log.info("Evento de atraso não mexe no acesso — arbitrado pela obrigação", {
            eventId: event.id,
            invoiceId: resolvedInvoiceId,
            obligationId: obligation?.id,
            reason: accessArbitration.reason,
          });
        }
        // 🔒 MODO OBSERVAÇÃO: o rebaixamento é o espelho da ativação — em vez de
        // liberar escrita clínica, ele a BLOQUEIA (PAST_DUE → writeAllowed=false
        // no Domus). Gatear só o ramo do pagamento e deixar este solto seria o
        // pior dos dois mundos: o webhook novo poderia TIRAR acesso sem nunca ter
        // provado que sabe DEVOLVER. Mesma flag, mesma leitura do topo.
        const downgradesSubscription =
          subscriptionDbId !== null &&
          controlsAccess &&
          accessArbitration.controls &&
          accessEffectEnabled;
        if (
          !accessEffectEnabled &&
          subscriptionDbId !== null &&
          controlsAccess &&
          accessArbitration.controls
        ) {
          log.warn("modo observação: rebaixamento SUPRIMIDO", {
            eventId: event.id,
            eventType: event.event,
            subscriptionId: subscriptionDbId,
            companyId,
            wouldSetPastDue: true,
            wouldBlockClinicalWrite: companyId !== null,
          });
        }
        if (downgradesSubscription) {
          // H6/idempotência: NÃO sobrescrever pastDueSince num reenvio do
          // mesmo OVERDUE — isso resetaria o relógio de dunning (suspensão/
          // cancelamento contam dias desde pastDueSince). Só marca a primeira
          // vez (updateMany com guard pastDueSince: null).
          // Guard de status: um OVERDUE (mesmo primeira vez, pastDueSince:null)
          // NÃO pode ressuscitar uma assinatura terminal (SUSPENDED/CANCELED) de
          // volta a PAST_DUE — o segundo updateMany abaixo já protege, mas este
          // rodava ANTES sem o guard e regredia o estado terminal.
          await prisma.subscription.updateMany({
            where: { id: subscriptionDbId, pastDueSince: null, status: { notIn: ["SUSPENDED", "CANCELED"] } },
            data: { status: "PAST_DUE", pastDueSince: new Date() },
          });
          // Garante status PAST_DUE mesmo se pastDueSince já existia — MAS sem
          // RETROCEDER: um reenvio de OVERDUE não pode rebaixar quem o cron de
          // dunning já suspendeu/cancelou (senão o cron re-suspende e duplica a
          // notificação ao admin a cada reenvio). updateMany com guard de status.
          await prisma.subscription.updateMany({
            where: { id: subscriptionDbId, status: { notIn: ["SUSPENDED", "CANCELED"] } },
            data: { status: "PAST_DUE" },
          });
        }
        // A fatura é marcada OVERDUE nos dois casos — o atraso é real e o
        // financeiro precisa vê-lo. O que NÃO muda é o acesso do cliente.
        if (resolvedInvoiceId) {
          await prisma.invoice.update({
            where: { id: resolvedInvoiceId },
            data: { status: "OVERDUE" },
          });
        } else if (event.payment?.id) {
          await prisma.invoice.updateMany({
            where: { asaasPaymentId: event.payment.id },
            data: { status: "OVERDUE" },
          });
        }
        // Propaga writeAllowed=false ao Domus na hora (Cadeado, entrada no
        // read-only): PAST_DUE agora bloqueia escrita no Domus. Sem isto, a
        // clínica só ficaria bloqueada no pull diário (~24h). AWAIT best-effort
        // (publishEntitlementForCompany nunca lança); ver ramos CONFIRMED/DELETED.
        // Só quando o status DE FATO mudou (ver escopo acima) — publicar por uma
        // taxa avulsa vencida empurraria um bloqueio que ninguém decidiu.
        if (companyId && downgradesSubscription) {
          await publishEntitlementForCompany(companyId);
        }
        break;
      }

      case "PAYMENT_REFUNDED": {
        // Política inalterada de propósito: o estorno marca a FATURA, não mexe
        // na assinatura nem no entitlement. Definir o efeito de um refund sobre
        // o acesso é decisão de produto (com que período o cliente fica? perde
        // na hora?) e exige a máquina de estados citada no ramo OVERDUE.
        // Registrado como dívida — não é regressão: é o comportamento atual.
        if (resolvedInvoiceId) {
          await prisma.invoice.update({
            where: { id: resolvedInvoiceId },
            data: { status: "REFUNDED" },
          });
        } else if (event.payment?.id) {
          await prisma.invoice.updateMany({
            where: { asaasPaymentId: event.payment.id },
            data: { status: "REFUNDED" },
          });
        }
        // Task 8 — a OBRIGAÇÃO permanece `PAID` de propósito. Ver a justificativa
        // completa em `REFUND_KEEPS_OBLIGATION_PAID`
        // (`lib/asaas-obligation-arbitration.ts`): reverter para `ISSUED` com
        // `dueAt` no passado casaria o gatilho de I1 e restringiria o cliente
        // AUTOMATICAMENTE, sem decisão humana e sem o aviso que I3 exige; e o
        // webhook não sabe se o estorno foi cortesia, cobrança duplicada ou
        // disputa. `VOID` seria pior — perdoaria uma dívida que segue devida.
        //
        // 🔴 DÍVIDA ASSUMIDA: `PAID` passa a significar "houve pagamento", não
        // "está quitada". Quem estorna todo mês fica com acesso de graça e nenhum
        // relatório que leia só `state` enxerga. O estado que falta (`REVERSED`) é
        // migração, fora do escopo desta task. Mitigação de hoje: alerta + a
        // divergência é consultável cruzando `state = PAID` com
        // `Invoice.status = REFUNDED` — par que a tela da Task 10 deve mostrar.
        if (obligation && obligation.state === "PAID") {
          log.warn("Estorno sobre obrigação quitada — obrigação segue PAID (decisão)", {
            eventId: event.id,
            obligationId: obligation.id,
            invoiceId: resolvedInvoiceId,
          });
          captureMessage(
            `Webhook Asaas ${event.id}: estorno sobre obrigação quitada ${obligation.id} — receita revertida, revisar`,
            { level: "warning", extra: { invoiceId: resolvedInvoiceId, companyId } },
          );
        }
        break;
      }

      case "PAYMENT_CHARGEBACK_REQUESTED":
      case "PAYMENT_CHARGEBACK_DISPUTE": {
        if (resolvedInvoiceId) {
          await prisma.invoice.update({
            where: { id: resolvedInvoiceId },
            data: { status: "OVERDUE", adminNotes: "Chargeback solicitado" },
          });
        } else if (event.payment?.id) {
          await prisma.invoice.updateMany({
            where: { asaasPaymentId: event.payment.id },
            data: { status: "OVERDUE", adminNotes: "Chargeback solicitado" },
          });
        }
        // Suspende assinatura preventivamente — updateMany com guard de status
        // (não `update`): um chargeback não pode regredir uma assinatura terminal
        // (SUSPENDED/CANCELED) de volta a PAST_DUE.
        //
        // Mesmo escopo do OVERDUE: só a cobrança da MENSALIDADE mexe no acesso.
        // Chargeback de uma taxa avulsa não pode trancar a clínica — antes desta
        // correção ele nem resolvia assinatura, e alargar isso aqui seria
        // regressão nova, não conserto.
        //
        // A arbitragem por obrigação vale AQUI TAMBÉM, e este ramo é o mais
        // urgente dos dois: ele já publica o entitlement, então hoje um
        // chargeback sobre um período QUITADO bloqueia a escrita clínica na hora
        // — sem checar `DunningEvent` despachado, o que também atropela I3. Com
        // a obrigação `PAID`, o cliente está em dia pela fonte que I1 usa;
        // rebaixá-lo aqui criaria duas verdades contraditórias, e a que restringe
        // seria justamente a que I1 não reconhece.
        //
        // ⚠️ Isto NÃO deixa o chargeback impune: a fatura vira `OVERDUE` com
        // `adminNotes` (acima) e o alerta operacional continua. O que sai é o
        // bloqueio AUTOMÁTICO por trás da máscara de inadimplência. Suspensão
        // preventiva antifraude, se for desejada, é política EXPLÍCITA e própria
        // — não um efeito colateral deste ramo.
        const chargebackArbitration = arbitrateAccessEvent(resolvedInvoiceId, obligation);
        if (!chargebackArbitration.controls) {
          log.warn("Chargeback sobre período quitado/superado — acesso NÃO rebaixado", {
            eventId: event.id,
            invoiceId: resolvedInvoiceId,
            obligationId: obligation?.id,
            reason: chargebackArbitration.reason,
          });
          captureMessage(
            `Webhook Asaas ${event.id}: chargeback sobre obrigação ${obligation?.state} — revisar manualmente`,
            { level: "warning", extra: { invoiceId: resolvedInvoiceId, companyId } },
          );
        }
        // 🔒 MODO OBSERVAÇÃO — mesma razão do ramo OVERDUE (rebaixa acesso).
        const chargebackHitsSubscription =
          subscriptionDbId !== null &&
          controlsAccess &&
          chargebackArbitration.controls &&
          accessEffectEnabled;
        if (
          !accessEffectEnabled &&
          subscriptionDbId !== null &&
          controlsAccess &&
          chargebackArbitration.controls
        ) {
          log.warn("modo observação: rebaixamento por chargeback SUPRIMIDO", {
            eventId: event.id,
            eventType: event.event,
            subscriptionId: subscriptionDbId,
            companyId,
          });
        }
        if (chargebackHitsSubscription) {
          await prisma.subscription.updateMany({
            where: { id: subscriptionDbId!, status: { notIn: ["SUSPENDED", "CANCELED"] } },
            data: { status: "PAST_DUE" },
          });
        }
        if (companyId && chargebackHitsSubscription) {
          await publishEntitlementForCompany(companyId);
        }
        break;
      }

      case "SUBSCRIPTION_DELETED": {
        // 🔒 MODO OBSERVAÇÃO: cancelar a assinatura é o efeito de acesso mais
        // severo do arquivo (CANCELED é terminal — nem um pagamento posterior a
        // ressuscita, ver o guard de ACTIVATABLE_FROM no ramo CONFIRMED). Não
        // pode ser o primeiro ato de um canal que nunca rodou.
        if (subscriptionDbId && !accessEffectEnabled) {
          log.warn("modo observação: cancelamento de assinatura SUPRIMIDO", {
            eventId: event.id,
            eventType: event.event,
            subscriptionId: subscriptionDbId,
            companyId,
            wouldCancelSubscription: true,
          });
        }
        if (subscriptionDbId && accessEffectEnabled) {
          await prisma.subscription.update({
            where: { id: subscriptionDbId },
            data: {
              status: "CANCELED",
              canceledAt: new Date(),
              cancelReason: "Cancelado via Asaas",
            },
          });
          if (companyId) {
            // Propaga writeAllowed=false ao Domus na hora (Cadeado): cancelamento via
            // Asaas bloqueia escrita clínica sem esperar o pull diário. AWAIT (não
            // fire-and-forget) — em serverless o void-promise pode ser cortado no
            // freeze pós-resposta e a janela não fecharia. `publishEntitlementForCompany`
            // é best-effort (nunca lança); falha cai no pull. Antes do trackServer
            // (telemetria) pra não depender do PostHog.
            await publishEntitlementForCompany(companyId);
            await trackServer(companyId, "subscription_canceled", {
              asaasSubscriptionId: subRef,
            });
          }
        }
        break;
      }

      default:
        // Não-fatal: evento conhecido apenas armazenado em BillingEvent
        break;
    }

    await prisma.billingEvent.update({
      where: { id: billingEvent.id },
      data: { processedAt: new Date(), error: null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("Erro ao processar evento Asaas", {
      eventType: event.event,
      eventId: event.id,
      error: errMsg,
    });
    await prisma.billingEvent.update({
      where: { id: billingEvent.id },
      data: {
        error: errMsg,
        lastErrorAt: new Date(), // Q8.1.2: quando falhou pela última vez
      },
    });
    // Q8.1.2: alerta o time quando um webhook persiste falhando. O upsert acima
    // já incrementou retryCount (retorna o valor PÓS-incremento). Dispara só na
    // TRANSIÇÃO exata (=== 3), não em todo reenvio acima do limiar — senão o Asaas
    // reenviando de hora em hora geraria 1 alerta/hora indefinidamente (spam/cota).
    if (billingEvent.retryCount === 3) {
      captureMessage(`Webhook Asaas ${event.id} falhou ${billingEvent.retryCount}x`, {
        level: "warning",
        extra: { eventType: event.event, eventId: event.id, companyId, error: errMsg },
      });
    }
    // 500 para Asaas reenviar
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
