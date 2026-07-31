import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getSaasEmailConfig } from "@/services/saas-email-config.service";
import { syncInvoicesForSubscription } from "@/services/invoice-sync.service";
import { notifyCompany } from "@/services/saas-notification.service";
import { brl, dateBR } from "@/lib/format-brl";
import {
  runGenerationPhase,
  type GenerationDeps,
  type GenerationSummary,
} from "@/services/billing-generation-phase.service";

const log = logger.child({ service: "invoice-reminders" });

export interface RunSummary {
  subscriptionsScanned: number;
  invoicesCreated: number;
  invoiceCreatedEmails: number;
  dueSoonEmails: number;
  skipped: "generation_disabled" | null;
  errors: number;
  runAt: string;
  /**
   * Resultado da fase de geração (motor de obrigação + modo sombra).
   *
   * 🔑 Fica FORA de `skipped` e de `errors` de propósito. `skipped` descreve as
   * fases de LEMBRETE, gateadas por `invoiceGenerationEnabled`; a fase de
   * geração tem as suas próprias quatro chaves e roda mesmo quando aquela está
   * desligada. Somar os dois num campo só faria "lembretes desligados" e "motor
   * desligado" virarem a mesma palavra no painel.
   */
  generation: GenerationSummary;
}

export async function runInvoiceReminders(
  opts: { now?: Date; generationDeps?: GenerationDeps } = {},
): Promise<RunSummary> {
  const now = opts.now ?? new Date();

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE DE GERAÇÃO — antes de tudo, e a posição É a decisão
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // 🚨 ANTES DO EARLY RETURN LOGO ABAIXO. `invoiceGenerationEnabled` mora em
  // `SaasEmailConfig`, nasce `false` e é editada numa tela chamada "E-mails".
  // Se a geração ficasse depois daquele `return`, o motor de cobrança inteiro
  // ficaria gateado por um botão de e-mail — desligar lembretes desligaria o
  // faturamento do SaaS em silêncio. As quatro chaves do motor são env var
  // exatamente para não depender dessa coluna (`billing-engine-flags.ts`), e
  // esta ordem é o que faz a independência valer no código que roda.
  //
  // 🚨 E ANTES DAS FASES A E B (Passo 1 do plano): a fatura que o motor emitir
  // agora já é varrida pelo lembrete de "fatura criada"/"vence em breve" do
  // MESMO tick, em vez de esperar 24 horas pela rodada seguinte.
  //
  // Nunca lança — ver `runGenerationPhase`.
  const generation = await runGenerationPhase({ ...opts.generationDeps, now });

  const summary: RunSummary = {
    subscriptionsScanned: 0,
    invoicesCreated: 0,
    invoiceCreatedEmails: 0,
    dueSoonEmails: 0,
    skipped: null,
    errors: 0,
    runAt: now.toISOString(),
    generation,
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
            description: inv.description ?? undefined,
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
      isManual: false,
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
          description: inv.description ?? undefined,
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
