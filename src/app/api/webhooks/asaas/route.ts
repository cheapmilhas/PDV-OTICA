import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { asaas } from "@/lib/asaas";
import { trackServer } from "@/lib/posthog-server";
import { rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { captureMessage } from "@/lib/sentry";
import { notifyCompany } from "@/services/saas-notification.service";
import { publishEntitlementForCompany } from "@/lib/vis-domus-publisher";

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

  let companyId: string | null = null;
  let subscriptionDbId: string | null = null;

  if (subRef) {
    const sub = await prisma.subscription.findFirst({
      where: { asaasSubscriptionId: subRef },
      select: { id: true, companyId: true },
    });
    if (sub) {
      companyId = sub.companyId;
      subscriptionDbId = sub.id;
    }
  }
  // externalReference pode trazer companyId quando criamos a subscription
  if (!companyId && externalRef?.startsWith("company:")) {
    companyId = externalRef.slice("company:".length);
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
        if (subscriptionDbId) {
          await prisma.subscription.update({
            where: { id: subscriptionDbId },
            data: {
              status: "ACTIVE",
              pastDueSince: null,
              lastDunningStage: null, // F5: recuperou → zera a régua p/ próxima inadimplência avisar do zero
              currentPeriodStart: new Date(),
            },
          });
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
        }
        // Atualiza Invoice se existir
        if (event.payment?.id) {
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
        if (subscriptionDbId) {
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
        if (event.payment?.id) {
          await prisma.invoice.updateMany({
            where: { asaasPaymentId: event.payment.id },
            data: { status: "OVERDUE" },
          });
        }
        // Propaga writeAllowed=false ao Domus na hora (Cadeado, entrada no
        // read-only): PAST_DUE agora bloqueia escrita no Domus. Sem isto, a
        // clínica só ficaria bloqueada no pull diário (~24h). AWAIT best-effort
        // (publishEntitlementForCompany nunca lança); ver ramos CONFIRMED/DELETED.
        if (companyId) await publishEntitlementForCompany(companyId);
        break;
      }

      case "PAYMENT_REFUNDED": {
        if (event.payment?.id) {
          await prisma.invoice.updateMany({
            where: { asaasPaymentId: event.payment.id },
            data: { status: "REFUNDED" },
          });
        }
        break;
      }

      case "PAYMENT_CHARGEBACK_REQUESTED":
      case "PAYMENT_CHARGEBACK_DISPUTE": {
        if (event.payment?.id) {
          await prisma.invoice.updateMany({
            where: { asaasPaymentId: event.payment.id },
            data: { status: "OVERDUE", adminNotes: "Chargeback solicitado" },
          });
        }
        // Suspende assinatura preventivamente — updateMany com guard de status
        // (não `update`): um chargeback não pode regredir uma assinatura terminal
        // (SUSPENDED/CANCELED) de volta a PAST_DUE.
        if (subscriptionDbId) {
          await prisma.subscription.updateMany({
            where: { id: subscriptionDbId, status: { notIn: ["SUSPENDED", "CANCELED"] } },
            data: { status: "PAST_DUE" },
          });
        }
        if (companyId) await publishEntitlementForCompany(companyId);
        break;
      }

      case "SUBSCRIPTION_DELETED": {
        if (subscriptionDbId) {
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
