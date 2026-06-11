import { Prisma, type Invoice, type Subscription } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { asaas as defaultAsaas } from "@/lib/asaas";
import { nextSaasInvoiceNumber } from "@/lib/saas-invoice-number";
import { logger } from "@/lib/logger";
import type { AsaasPayment } from "@/lib/asaas";

const log = logger.child({ service: "invoice-sync" });
const ELIGIBLE: ReadonlySet<AsaasPayment["status"]> = new Set(["PENDING", "OVERDUE"]);

export interface InvoiceData {
  number: string;
  total: number;
  subtotal: number;
  discount: number;
  status: "PENDING";
  dueDate: Date;
  asaasPaymentId: string;
  paymentUrl?: string;
  boletoUrl?: string;
  billingType?: string;
  periodStart: Date;
  periodEnd: Date;
}

export function mapPaymentToInvoiceData(
  payment: AsaasPayment,
  number: string
): InvoiceData {
  const due = new Date(`${payment.dueDate}T00:00:00.000Z`);
  const periodStart = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0));
  const cents = Math.round(payment.value * 100);
  return {
    number,
    total: cents,
    subtotal: cents,
    discount: 0,
    status: "PENDING",
    dueDate: due,
    asaasPaymentId: payment.id,
    paymentUrl: payment.invoiceUrl,
    boletoUrl: payment.bankSlipUrl,
    billingType: payment.billingType,
    periodStart,
    periodEnd,
  };
}

interface Deps {
  asaasClient?: typeof defaultAsaas;
  prismaClient?: typeof defaultPrisma;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function syncInvoicesForSubscription(
  subscription: Pick<Subscription, "id" | "asaasSubscriptionId">,
  deps: Deps = {}
): Promise<Invoice[]> {
  const asaas = deps.asaasClient ?? defaultAsaas;
  const prisma = deps.prismaClient ?? defaultPrisma;
  const sleep = deps.sleep ?? realSleep;

  if (!subscription.asaasSubscriptionId) return [];

  const payments: AsaasPayment[] = [];
  let offset = 0;
  for (;;) {
    const page = await asaas.payments.list({
      subscription: subscription.asaasSubscriptionId,
      offset,
      limit: 100,
    });
    payments.push(...page.data);
    if (!page.hasMore) break;
    offset += page.data.length || 100;
    await sleep(200);
  }

  const novas: Invoice[] = [];
  for (const payment of payments) {
    if (!ELIGIBLE.has(payment.status)) continue;

    const existing = await prisma.invoice.findUnique({
      where: {
        subscriptionId_asaasPaymentId: {
          subscriptionId: subscription.id,
          asaasPaymentId: payment.id,
        },
      },
    });
    if (existing) continue;

    const number = await nextSaasInvoiceNumber(prisma);
    const data = mapPaymentToInvoiceData(payment, number);

    let pixCode: string | undefined;
    try {
      const pix = await asaas.payments.pixQrCode(payment.id);
      pixCode = pix?.payload;
    } catch {
      log.warn("pixQrCode falhou (segue sem PIX)", { paymentId: payment.id });
    }

    try {
      const created = await prisma.invoice.create({
        data: { ...data, subscriptionId: subscription.id, pixCode },
      });
      novas.push(created);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        continue;
      }
      throw e;
    }
  }

  return novas;
}
