import { prisma as defaultPrisma } from "@/lib/prisma";
import { ensureInvoiceCharge } from "@/services/invoice-charge.service";
import {
  notifyCompany,
  type NotifyResult,
} from "@/services/saas-notification.service";
import { brl, dateBR } from "@/lib/format-brl";

interface SendDeps {
  prismaClient?: typeof defaultPrisma;
  ensureFn?: (invoiceId: string) => Promise<unknown>;
  notifyFn?: (
    companyId: string,
    type: string,
    payload: Record<string, unknown>,
    opts: { channels: string[]; periodKey: string }
  ) => Promise<NotifyResult>;
  now?: Date;
}

interface SendResult {
  status: string;
  alreadySentToday: boolean;
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function sendInvoiceCharge(
  invoiceId: string,
  adminId: string,
  deps: SendDeps = {}
): Promise<SendResult> {
  const prismaClient = deps.prismaClient ?? defaultPrisma;
  const ensureFn = deps.ensureFn ?? ensureInvoiceCharge;
  const notifyFn = deps.notifyFn ?? notifyCompany;
  const now = deps.now ?? new Date();

  // Step 1: ensure charge exists (throws if it can't)
  await ensureFn(invoiceId);

  // Step 2: load invoice with company name
  const invoice = await prismaClient.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      subscription: {
        include: {
          company: { select: { name: true } },
        },
      },
    },
  });

  if (!invoice) {
    throw new Error("Fatura não encontrada após ensure");
  }

  // Step 3: build periodKey and notify
  const periodKey = `invoice:${invoiceId}:resend:${yyyymmdd(now)}`;

  const result = await notifyFn(
    invoice.subscription.companyId,
    "INVOICE_CREATED",
    {
      name: invoice.subscription.company?.name ?? "cliente",
      amountLabel: brl(invoice.total),
      dueDateLabel: dateBR(invoice.dueDate) || "—",
      description: invoice.description ?? undefined,
      pixCode: invoice.pixCode ?? undefined,
      paymentUrl: invoice.paymentUrl!,
      boletoUrl: invoice.boletoUrl ?? undefined,
    },
    { channels: ["email"], periodKey }
  );

  // Step 4: handle result
  if (result.status === "SENT") {
    await prismaClient.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceSent: true,
        invoiceSentAt: now,
        invoiceSentBy: adminId,
        invoiceSentMethod: "email",
      },
    });
    return { status: "SENT", alreadySentToday: false };
  }

  if (result.status === "SKIPPED") {
    return {
      status: "SKIPPED",
      alreadySentToday: result.reason === "duplicate",
    };
  }

  // FAILED or other
  return { status: result.status, alreadySentToday: false };
}
