import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { asaas } from "@/lib/asaas";
import { trackServer } from "@/lib/posthog-server";
import { rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const log = logger.child({ webhook: "asaas" });

/**
 * Q7.2 P1-7: HMAC opcional do payload. Defesa em profundidade — token
 * bearer pode vazar de logs/proxy, HMAC valida que o payload veio da
 * Asaas e não foi modificado. Configure ASAAS_WEBHOOK_HMAC_SECRET no
 * painel Asaas + Vercel pra ativar. Sem ele, validação é skip (compat).
 */
function verifyAsaasHmac(rawBody: string, sigHeader: string | null): boolean {
  const secret = process.env.ASAAS_WEBHOOK_HMAC_SECRET;
  if (!secret) return true; // segredo opcional — backward compat
  if (!sigHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = sigHeader.replace(/^sha256=/, "").trim();

  if (expected.length !== got.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(got, "hex"));
  } catch {
    return false;
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

  // Q7.2 P1-7: HMAC opcional. Lemos raw antes do JSON parse pra preservar bytes.
  const rawBody = await request.text();
  const signature =
    request.headers.get("asaas-signature") ||
    request.headers.get("x-asaas-signature");
  if (!verifyAsaasHmac(rawBody, signature)) {
    log.warn("HMAC inválido", { ip, hasSignature: !!signature });
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
              activatedAt: new Date(),
              currentPeriodStart: new Date(),
            },
          });
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
        break;
      }

      case "PAYMENT_OVERDUE": {
        if (subscriptionDbId) {
          await prisma.subscription.update({
            where: { id: subscriptionDbId },
            data: { status: "PAST_DUE", pastDueSince: new Date() },
          });
        }
        if (event.payment?.id) {
          await prisma.invoice.updateMany({
            where: { asaasPaymentId: event.payment.id },
            data: { status: "OVERDUE" },
          });
        }
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
        // Suspende assinatura preventivamente
        if (subscriptionDbId) {
          await prisma.subscription.update({
            where: { id: subscriptionDbId },
            data: { status: "PAST_DUE" },
          });
        }
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
    log.error("Erro ao processar evento Asaas", {
      eventType: event.event,
      eventId: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await prisma.billingEvent.update({
      where: { id: billingEvent.id },
      data: {
        error: err instanceof Error ? err.message : String(err),
      },
    });
    // 500 para Asaas reenviar
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
