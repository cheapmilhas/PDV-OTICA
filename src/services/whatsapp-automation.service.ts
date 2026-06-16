/**
 * Motor das 4 automações de WhatsApp (Fase B2).
 *
 * Rodado 1×/dia pelo cron /api/cron/whatsapp-messages. Para cada ótica
 * habilitada (flag global+allowlist) E conectada (WhatsappConnection CONNECTED),
 * varre os gatilhos dos tipos cuja flag por-ótica está ligada e envia via
 * `sendWhatsappMessage` (que faz as checagens finais + outbox + idempotência).
 *
 * Idempotência: cada envio recebe um `periodKey` (data do dia para tipos
 * "do dia"; ou data de vencimento/entrega para os baseados em evento) +
 * `referenceId` (id da entidade), batendo no @@unique do WhatsappMessageLog.
 * Reexecutar o cron no mesmo dia não reenvia.
 *
 * Não lança: erros por ótica/registro são logados e a varredura continua.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import { sendWhatsappMessage, checkWhatsappEligibility } from "@/lib/whatsapp-send";
import type { SendWhatsappInput } from "@/lib/whatsapp-send";
import {
  DEFAULT_AUTOMATION_TEMPLATES,
} from "@/lib/whatsapp-automation-templates";
import { osDisplayNumber } from "@/lib/os-number";

const log = logger.child({ service: "whatsapp-automation" });

/** Formata Date → "dd/MM/yyyy" em America/Sao_Paulo. */
function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Chave de período do dia (yyyy-MM-dd) em America/Sao_Paulo. */
function dayKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA → "yyyy-MM-dd"
}

function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/** Um item da prévia (modo dryRun): o que seria enviado, sem enviar. */
export interface AutomationPreviewItem {
  type: string;
  customerName: string;
  phone: string;
  content: string;
}

export interface AutomationRunResult {
  companiesProcessed: number;
  sent: number;
  skipped: number;
  failed: number;
  byType: Record<string, { sent: number; skipped: number; failed: number }>;
  /** Preenchido só em dryRun: lista do que sairia (apenas os elegíveis). */
  preview: AutomationPreviewItem[];
}

interface CompanyCtx {
  companyId: string;
  oticaName: string;
  settings: {
    waOsReadyEnabled: boolean;
    waPostSaleEnabled: boolean;
    waBirthdayEnabled: boolean;
    waInstallmentDueEnabled: boolean;
    waOsReadyTemplate: string | null;
    waPostSaleTemplate: string | null;
    waBirthdayTemplate: string | null;
    waInstallmentDueTemplate: string | null;
    waPostSaleDays: number;
  };
}

/**
 * Executa a varredura das automações para as óticas elegíveis.
 * @param now data de referência (injetável p/ teste).
 * @param options.companyId quando informado, limita a varredura a essa ótica
 *   (usado pelo botão "Processar agora"). Sem ele, varre todas as conectadas
 *   (comportamento do cron diário). O escopo deve vir da sessão, nunca do body.
 * @param options.dryRun quando true, NÃO envia e NÃO persiste — apenas coleta
 *   em `result.preview` a lista do que sairia (só os elegíveis). Usado pela
 *   prévia ("simular sem enviar").
 */
export async function runWhatsappAutomations(
  now: Date = new Date(),
  options?: { companyId?: string; dryRun?: boolean },
): Promise<AutomationRunResult> {
  const dryRun = options?.dryRun ?? false;
  const result: AutomationRunResult = {
    companiesProcessed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    byType: {},
    preview: [],
  };

  // Óticas conectadas (status CONNECTED). A flag global+allowlist é checada
  // por empresa logo abaixo (e de novo dentro de sendWhatsappMessage).
  // Com options.companyId, restringe a uma única ótica (disparo manual).
  const connections = await prisma.whatsappConnection.findMany({
    where: options?.companyId
      ? { status: "CONNECTED", companyId: options.companyId }
      : { status: "CONNECTED" },
    select: { companyId: true },
  });

  for (const { companyId } of connections) {
    if (!isWhatsappEnabledForCompany(companyId)) continue;

    const settings = await prisma.companySettings.findUnique({
      where: { companyId },
      select: {
        displayName: true,
        waOsReadyEnabled: true,
        waPostSaleEnabled: true,
        waBirthdayEnabled: true,
        waInstallmentDueEnabled: true,
        waOsReadyTemplate: true,
        waPostSaleTemplate: true,
        waBirthdayTemplate: true,
        waInstallmentDueTemplate: true,
        waPostSaleDays: true,
      },
    });
    if (!settings) continue;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    const ctx: CompanyCtx = {
      companyId,
      oticaName: settings.displayName || company?.name || "nossa ótica",
      settings: {
        waOsReadyEnabled: settings.waOsReadyEnabled,
        waPostSaleEnabled: settings.waPostSaleEnabled,
        waBirthdayEnabled: settings.waBirthdayEnabled,
        waInstallmentDueEnabled: settings.waInstallmentDueEnabled,
        waOsReadyTemplate: settings.waOsReadyTemplate,
        waPostSaleTemplate: settings.waPostSaleTemplate,
        waBirthdayTemplate: settings.waBirthdayTemplate,
        waInstallmentDueTemplate: settings.waInstallmentDueTemplate,
        waPostSaleDays: settings.waPostSaleDays,
      },
    };

    result.companiesProcessed++;

    try {
      if (ctx.settings.waOsReadyEnabled) await runOsReady(ctx, now, result, dryRun);
      if (ctx.settings.waInstallmentDueEnabled) await runInstallmentDue(ctx, now, result, dryRun);
      if (ctx.settings.waPostSaleEnabled) await runPostSale(ctx, now, result, dryRun);
      if (ctx.settings.waBirthdayEnabled) await runBirthday(ctx, now, result, dryRun);
    } catch (err) {
      log.error("Falha ao processar automações da ótica", {
        companyId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

function tally(result: AutomationRunResult, type: string, status: "SENT" | "FAILED" | "SKIPPED") {
  const b = (result.byType[type] ??= { sent: 0, skipped: 0, failed: 0 });
  if (status === "SENT") { b.sent++; result.sent++; }
  else if (status === "FAILED") { b.failed++; result.failed++; }
  else { b.skipped++; result.skipped++; }
}

/**
 * Despacha um envio: em modo normal chama `sendWhatsappMessage` (envia + tally);
 * em `dryRun` chama `checkWhatsappEligibility` e, se elegível, coleta o item na
 * prévia (sem enviar, sem persistir). Os "não elegíveis" são omitidos da prévia
 * (decisão: a prévia mostra só quem vai receber de verdade).
 */
async function dispatch(
  input: SendWhatsappInput,
  customerName: string,
  result: AutomationRunResult,
  dryRun: boolean,
) {
  if (dryRun) {
    const elig = await checkWhatsappEligibility(input);
    if (elig.eligible) {
      result.preview.push({
        type: input.type,
        customerName,
        phone: elig.number ?? input.customer.phone ?? "",
        content: elig.content,
      });
    }
    return;
  }
  const r = await sendWhatsappMessage(input);
  tally(result, input.type, r.status);
}

/** OS pronta: status READY com readyAt nas últimas 24h (a janela do cron). */
async function runOsReady(ctx: CompanyCtx, now: Date, result: AutomationRunResult, dryRun: boolean) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const orders = await prisma.serviceOrder.findMany({
    where: { companyId: ctx.companyId, status: "READY", readyAt: { gte: since, lte: now } },
    select: {
      id: true, number: true, readyAt: true, isWarranty: true, isRework: true, isMedicalError: true,
      warrantySeq: true, originalOrder: { select: { number: true } },
      customer: { select: { id: true, name: true, phone: true, acceptsMarketing: true } },
    },
  });

  const template = ctx.settings.waOsReadyTemplate ?? DEFAULT_AUTOMATION_TEMPLATES.OS_READY;

  for (const os of orders) {
    if (!os.customer) continue;
    await dispatch({
      companyId: ctx.companyId,
      customer: os.customer,
      type: "OS_READY",
      transactional: true,
      template,
      variables: { cliente: os.customer.name ?? "", otica: ctx.oticaName, validade: osDisplayNumber(os) },
      referenceId: os.id,
      periodKey: dayKey(os.readyAt ?? now),
    }, os.customer.name ?? "", result, dryRun);
  }
}

/** Crediário a vencer: AccountReceivable PENDING com dueDate em até 3 dias. */
async function runInstallmentDue(ctx: CompanyCtx, now: Date, result: AutomationRunResult, dryRun: boolean) {
  const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const rows = await prisma.accountReceivable.findMany({
    where: {
      companyId: ctx.companyId,
      status: "PENDING",
      customerId: { not: null },
      dueDate: { gt: now, lte: in3d },
    },
    select: {
      id: true, amount: true, dueDate: true, installmentNumber: true, totalInstallments: true,
      customer: { select: { id: true, name: true, phone: true, acceptsMarketing: true } },
    },
  });

  const template = ctx.settings.waInstallmentDueTemplate ?? DEFAULT_AUTOMATION_TEMPLATES.INSTALLMENT_DUE;

  for (const ar of rows) {
    if (!ar.customer) continue;
    await dispatch({
      companyId: ctx.companyId,
      customer: ar.customer,
      type: "INSTALLMENT_DUE",
      transactional: true,
      template,
      variables: {
        cliente: ar.customer.name ?? "",
        otica: ctx.oticaName,
        valor: fmtBRL(Number(ar.amount)),
        validade: fmtDate(ar.dueDate),
        produto: `${ar.installmentNumber}/${ar.totalInstallments}`,
      },
      referenceId: ar.id,
      // dedupe pela data de vencimento → 1 lembrete por parcela (não 3×).
      periodKey: dayKey(ar.dueDate),
    }, ar.customer.name ?? "", result, dryRun);
  }
}

/** Pós-venda: OS entregue há exatamente waPostSaleDays dias (janela do dia). */
async function runPostSale(ctx: CompanyCtx, now: Date, result: AutomationRunResult, dryRun: boolean) {
  const days = ctx.settings.waPostSaleDays || 7;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const lo = new Date(start.getTime() - 12 * 60 * 60 * 1000);
  const hi = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  const orders = await prisma.serviceOrder.findMany({
    where: { companyId: ctx.companyId, status: "DELIVERED", deliveredAt: { gte: lo, lte: hi } },
    select: {
      id: true,
      customer: { select: { id: true, name: true, phone: true, acceptsMarketing: true } },
    },
  });

  const template = ctx.settings.waPostSaleTemplate ?? DEFAULT_AUTOMATION_TEMPLATES.POST_SALE;

  for (const os of orders) {
    if (!os.customer) continue;
    await dispatch({
      companyId: ctx.companyId,
      customer: os.customer,
      type: "POST_SALE",
      transactional: false, // marketing → respeita acceptsMarketing
      template,
      variables: { cliente: os.customer.name ?? "", otica: ctx.oticaName },
      referenceId: os.id,
      periodKey: dayKey(now),
    }, os.customer.name ?? "", result, dryRun);
  }
}

/** Aniversário: clientes que fazem aniversário hoje (mês+dia). */
async function runBirthday(ctx: CompanyCtx, now: Date, result: AutomationRunResult, dryRun: boolean) {
  // Compara mês/dia em America/Sao_Paulo (evita o bug de -1 dia em UTC-3).
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [, mm, dd] = fmt.split("-");

  const customers = await prisma.customer.findMany({
    where: {
      companyId: ctx.companyId,
      active: true,
      birthDate: { not: null },
    },
    select: { id: true, name: true, phone: true, acceptsMarketing: true, birthDate: true },
  });

  const template = ctx.settings.waBirthdayTemplate ?? DEFAULT_AUTOMATION_TEMPLATES.BIRTHDAY;

  for (const c of customers) {
    if (!c.birthDate) continue;
    const bFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(c.birthDate);
    const [, bmm, bdd] = bFmt.split("-");
    if (bmm !== mm || bdd !== dd) continue;

    await dispatch({
      companyId: ctx.companyId,
      customer: c,
      type: "BIRTHDAY",
      transactional: false, // marketing → respeita acceptsMarketing
      template,
      variables: { cliente: c.name ?? "", otica: ctx.oticaName },
      referenceId: c.id,
      periodKey: dayKey(now),
    }, c.name ?? "", result, dryRun);
  }
}
