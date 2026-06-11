import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getSaasEmailConfig } from "@/services/saas-email-config.service";
import { syncInvoicesForSubscription } from "@/services/invoice-sync.service";
import { notifyCompany } from "@/services/saas-notification.service";
import { brl, dateBR } from "@/lib/format-brl";

const log = logger.child({ service: "invoice-reminders" });

export interface RunSummary {
  subscriptionsScanned: number;
  invoicesCreated: number;
  invoiceCreatedEmails: number;
  dueSoonEmails: number;
  skipped: "generation_disabled" | null;
  errors: number;
  runAt: string;
}

export async function runInvoiceReminders(opts: { now?: Date } = {}): Promise<RunSummary> {
  const now = opts.now ?? new Date();
  const summary: RunSummary = {
    subscriptionsScanned: 0,
    invoicesCreated: 0,
    invoiceCreatedEmails: 0,
    dueSoonEmails: 0,
    skipped: null,
    errors: 0,
    runAt: now.toISOString(),
  };

  // Gate: check master generation flag
  const config = await getSaasEmailConfig();
  if (!config.invoiceGenerationEnabled) {
    summary.skipped = "generation_disabled";
    return summary;
  }

  // Part A: sync invoices for all ACTIVE subscriptions → notify INVOICE_CREATED
  const subs = await prisma.subscription.findMany({
    where: { status: "ACTIVE", asaasSubscriptionId: { not: null } },
    include: { company: { select: { name: true } } },
  });
  summary.subscriptionsScanned = subs.length;

  for (const sub of subs) {
    try {
      const novas = await syncInvoicesForSubscription(sub);
      summary.invoicesCreated += novas.length;
      for (const inv of novas) {
        if (!inv.paymentUrl) {
          log.warn("Invoice sem paymentUrl — INVOICE_CREATED ignorado", { invoiceId: inv.id });
          continue;
        }
        const r = await notifyCompany(
          sub.companyId,
          "INVOICE_CREATED",
          {
            name: sub.company?.name ?? "cliente",
            amountLabel: brl(inv.total),
            dueDateLabel: inv.dueDate ? dateBR(inv.dueDate) : "",
            pixCode: inv.pixCode ?? undefined,
            paymentUrl: inv.paymentUrl,
            boletoUrl: inv.boletoUrl ?? undefined,
          },
          {
            periodKey: `invoice:${inv.id}:created`,
            channels: ["email", "inapp"],
            inapp: {
              title: "Nova fatura disponível",
              message: `Fatura ${brl(inv.total)} disponível para pagamento.`,
              link: "/dashboard/configuracoes",
            },
          }
        );
        if (r.status === "SENT") {
          summary.invoiceCreatedEmails++;
        } else if (r.status === "FAILED") {
          summary.errors++;
          log.warn("notifyCompany retornou FAILED (INVOICE_CREATED)", { invoiceId: inv.id, companyId: sub.companyId });
        }
      }
    } catch (e) {
      summary.errors++;
      log.error("Falha ao sincronizar subscription", {
        subscriptionId: sub.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Part B: notify INVOICE_DUE_SOON for PENDING invoices due within 3 days
  const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const dueSoon = await prisma.invoice.findMany({
    where: {
      status: "PENDING",
      paymentConfirmedAt: null,
      subscription: { status: "ACTIVE" },
      dueDate: { gt: now, lte: in3d },
    },
    include: {
      subscription: {
        include: { company: { select: { name: true } } },
      },
    },
  });

  for (const inv of dueSoon) {
    try {
      const companyId = inv.subscription.companyId;
      if (!inv.paymentUrl) {
        log.warn("Invoice sem paymentUrl — INVOICE_DUE_SOON ignorado", { invoiceId: inv.id });
        continue;
      }
      const r = await notifyCompany(
        companyId,
        "INVOICE_DUE_SOON",
        {
          name: inv.subscription.company?.name ?? "cliente",
          amountLabel: brl(inv.total),
          dueDateLabel: inv.dueDate ? dateBR(inv.dueDate) : "",
          pixCode: inv.pixCode ?? undefined,
          paymentUrl: inv.paymentUrl,
          boletoUrl: inv.boletoUrl ?? undefined,
        },
        {
          periodKey: `invoice:${inv.id}:due_soon`,
          channels: ["email", "inapp"],
          inapp: {
            title: "Fatura vence em breve",
            message: `Sua fatura de ${brl(inv.total)} vence em ${inv.dueDate ? dateBR(inv.dueDate) : "breve"}.`,
            link: "/dashboard/configuracoes",
          },
        }
      );
      if (r.status === "SENT") {
        summary.dueSoonEmails++;
        await prisma.invoice.update({
          where: { id: inv.id },
          data: { reminderSentAt: now, reminderCount: { increment: 1 } },
        });
      } else if (r.status === "FAILED") {
        summary.errors++;
        log.warn("notifyCompany retornou FAILED (INVOICE_DUE_SOON)", { invoiceId: inv.id, companyId });
      }
    } catch (e) {
      summary.errors++;
      log.error("Falha no lembrete DUE_SOON", {
        invoiceId: inv.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return summary;
}
