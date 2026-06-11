import type { Invoice } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { asaas as defaultAsaas } from "@/lib/asaas";
import { syncInvoicesForSubscription } from "./invoice-sync.service";
import { nextBusinessDay } from "@/lib/business-day";

interface Deps {
  prismaClient?: typeof defaultPrisma;
  asaasClient?: typeof defaultAsaas;
  syncFn?: typeof syncInvoicesForSubscription;
}

/**
 * Garante que uma Invoice possui uma cobrança Asaas (boleto/PIX) associada.
 *
 * Estratégia:
 * 1. Já tem paymentUrl → retorna sem tocar no Asaas.
 * 2. Subscription tem asaasSubscriptionId → sincroniza cobranças via syncFn e
 *    re-busca a fatura; se depois da sync tiver paymentUrl, retorna.
 * 3. Fallback avulso → cria cobrança standalone no Asaas e atualiza a Invoice.
 */
export async function ensureInvoiceCharge(
  invoiceId: string,
  deps: Deps = {}
): Promise<Invoice> {
  const prismaClient = deps.prismaClient ?? defaultPrisma;
  const asaasClient = deps.asaasClient ?? defaultAsaas;
  const syncFn = deps.syncFn ?? syncInvoicesForSubscription;

  // 1. Load invoice
  const invoice = await prismaClient.invoice.findUnique({
    where: { id: invoiceId },
    include: { subscription: true },
  });

  if (!invoice) {
    throw new Error("Fatura não encontrada");
  }

  // 2. Already has paymentUrl → no-op
  if (invoice.paymentUrl) {
    return invoice;
  }

  const sub = invoice.subscription;

  // 3. Sync via Asaas subscription if available
  if (sub?.asaasSubscriptionId) {
    await syncFn(sub);

    const refreshed = await prismaClient.invoice.findUnique({
      where: { id: invoiceId },
      include: { subscription: true },
    });

    if (refreshed?.paymentUrl) {
      return refreshed;
    }
    // Fall through to standalone if sync didn't produce a paymentUrl
  }

  // 4. Standalone charge path
  if (!sub?.asaasCustomerId) {
    throw new Error(
      "Assinatura sem customer Asaas — configure o checkout primeiro"
    );
  }

  const dueDate = invoice.dueDate
    ? new Date(invoice.dueDate)
    : nextBusinessDay(new Date(Date.now() + 3 * 86400000));

  const dueStr = `${dueDate.getUTCFullYear()}-${String(dueDate.getUTCMonth() + 1).padStart(2, "0")}-${String(dueDate.getUTCDate()).padStart(2, "0")}`;

  const payment = await asaasClient.payments.create({
    customer: sub.asaasCustomerId,
    billingType: (invoice.billingType as any) || "PIX",
    value: invoice.total / 100,
    dueDate: dueStr,
    externalReference: `invoice:${invoice.id}`,
  });

  let pixCode: string | undefined;
  try {
    pixCode = (await asaasClient.payments.pixQrCode(payment.id)).payload;
  } catch {
    // PIX QR code is optional; proceed without it
  }

  const updated = await prismaClient.invoice.update({
    where: { id: invoice.id },
    data: {
      asaasPaymentId: payment.id,
      paymentUrl: payment.invoiceUrl,
      boletoUrl: payment.bankSlipUrl,
      pixCode,
      billingType: payment.billingType,
    },
  });

  return updated;
}
