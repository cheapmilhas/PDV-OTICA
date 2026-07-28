import { prisma as defaultPrisma } from "@/lib/prisma";
import { advisoryKeyForCompany } from "@/lib/advisory-lock";
import { ensureAsaasCustomer } from "@/services/asaas-customer.service";
import { ensureInvoiceCharge } from "@/services/invoice-charge.service";
import { nextSaasInvoiceNumber } from "@/lib/saas-invoice-number";
import { logger } from "@/lib/logger";
import {
  decideOnExistingCharge,
  resolveConversionPeriod,
  resolveConversionPriceCents,
  trialConversionSource,
} from "@/lib/trial-conversion-charge";

const log = logger.child({ service: "trial-conversion-charge" });

/**
 * Cria (ou reusa) a cobrança que converte o trial de uma clínica em assinatura
 * paga — a fatura da MENSALIDADE, com PIX/boleto reais.
 *
 * É deliberadamente ESTREITO: converte trial de cliente medical, nada mais. Um
 * "motor genérico de ciclos" precisaria de renovação recorrente, proration e
 * política de reajuste — decisões que ninguém tomou ainda, e que não cabem numa
 * entrega com prazo.
 *
 * Difere de `createManualCharge` no que importa: aquela grava `isManual: true`
 * (cobrança avulsa, NÃO controla acesso). Esta grava `isManual: false`, porque é
 * a mensalidade — quando paga, o webhook ATIVA a assinatura e publica o
 * entitlement que destrava a clínica no Domus.
 */

export type TrialChargeResult =
  | {
      kind: "ok";
      invoiceId: string;
      amountCents: number;
      reused: boolean;
      paymentUrl: string | null;
      pixCode: string | null;
      dueDate: Date | null;
    }
  | { kind: "already_paid"; invoiceId: string }
  | { kind: "error"; code: TrialChargeErrorCode; message: string };

export type TrialChargeErrorCode =
  | "company_not_found"
  | "not_medical"
  | "no_eligible_subscription"
  | "ambiguous_subscription"
  | "missing_document"
  | "invalid_price"
  | "needs_review";

/** Dias até o vencimento da cobrança de conversão. */
const DUE_IN_DAYS = 5;

interface Deps {
  prismaClient?: typeof defaultPrisma;
  ensureCustomerFn?: typeof ensureAsaasCustomer;
  ensureChargeFn?: typeof ensureInvoiceCharge;
  now?: Date;
}

export async function createTrialConversionCharge(
  companyId: string,
  deps: Deps = {},
): Promise<TrialChargeResult> {
  const prisma = deps.prismaClient ?? defaultPrisma;
  const ensureCustomerFn = deps.ensureCustomerFn ?? ensureAsaasCustomer;
  const ensureChargeFn = deps.ensureChargeFn ?? ensureInvoiceCharge;
  const now = deps.now ?? new Date();

  // ── Fase 1: decidir e RESERVAR a fatura sob advisory lock ──────────────────
  //
  // O lock serializa por empresa e usa a MESMA chave do checkout
  // (advisory-lock.ts), senão as duas operações passariam juntas achando que
  // estavam protegidas. O trabalho externo (Asaas) fica FORA da transação:
  // segurar uma tx aberta durante chamada de rede prende conexão do pooler.
  //
  // ⚠️ A unicidade da cobrança de conversão é garantida pelo LOCK, não pelo
  // schema: `Invoice.source` não tem constraint unique. Quem criar outro
  // caminho que emita fatura com esta mesma `source` PRECISA pegar o mesmo
  // advisory lock — senão duas faturas nascem e a que vencer rebaixa quem
  // pagou a outra. Uma unique parcial resolveria de vez, mas exige migração.
  const decision = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKeyForCompany(companyId)})`;

    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { id: true, platformProduct: true, cnpj: true, blockedReason: true },
    });
    if (!company) {
      return { kind: "error" as const, code: "company_not_found" as const, message: "Empresa não encontrada" };
    }
    if (company.platformProduct !== "VIS_MEDICAL") {
      return {
        kind: "error" as const,
        code: "not_medical" as const,
        message: "Esta cobrança é exclusiva de clientes Vis Medical",
      };
    }
    // Documento é pré-requisito do gateway: sem 11/14 dígitos,
    // `resolveAsaasCustomerId` lança. Falhar aqui dá mensagem acionável em vez
    // de estourar no meio da criação da cobrança.
    const doc = (company.cnpj ?? "").replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14) {
      return {
        kind: "error" as const,
        code: "missing_document" as const,
        message: "Cadastre o CPF ou CNPJ da clínica antes de cobrar",
      };
    }

    // Até 2 para DETECTAR ambiguidade: `Subscription.companyId` tem índice, não
    // unicidade. Escolher "a mais recente" cobraria a assinatura errada.
    const subs = await tx.subscription.findMany({
      where: { companyId, status: { in: ["TRIAL", "TRIAL_EXPIRED"] } },
      select: {
        id: true,
        status: true,
        trialEndsAt: true,
        billingCycle: true,
        discountPercent: true,
        discountExpiresAt: true,
        plan: { select: { priceMonthly: true, priceYearly: true, name: true } },
      },
      take: 2,
    });
    if (subs.length === 0) {
      return {
        kind: "error" as const,
        code: "no_eligible_subscription" as const,
        message: "Nenhuma assinatura em trial para converter",
      };
    }
    if (subs.length > 1) {
      return {
        kind: "error" as const,
        code: "ambiguous_subscription" as const,
        message: "Mais de uma assinatura em trial — resolver manualmente",
      };
    }

    const sub = subs[0];
    const source = trialConversionSource(sub.id);

    // Já existe cobrança de conversão para esta assinatura?
    const existing = await tx.invoice.findFirst({
      where: { subscriptionId: sub.id, source },
      select: { id: true, status: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      const d = decideOnExistingCharge(existing.status);
      if (d.action === "already_paid") {
        return { kind: "already_paid" as const, invoiceId: existing.id };
      }
      if (d.action === "needs_review") {
        return { kind: "error" as const, code: "needs_review" as const, message: d.reason };
      }
      return { kind: "reuse" as const, invoiceId: existing.id };
    }

    let amountCents: number;
    try {
      amountCents = resolveConversionPriceCents({
        billingCycle: sub.billingCycle,
        priceMonthly: sub.plan.priceMonthly,
        priceYearly: sub.plan.priceYearly,
        discountPercent: sub.discountPercent,
        discountExpiresAt: sub.discountExpiresAt,
        now,
      });
    } catch (e) {
      return {
        kind: "error" as const,
        code: "invalid_price" as const,
        message: e instanceof Error ? e.message : "Preço inválido",
      };
    }

    const { periodStart, periodEnd } = resolveConversionPeriod({
      status: sub.status,
      trialEndsAt: sub.trialEndsAt,
      billingCycle: sub.billingCycle,
      now,
    });
    const dueDate = new Date(now.getTime() + DUE_IN_DAYS * 86_400_000);

    const invoice = await tx.invoice.create({
      data: {
        subscriptionId: sub.id,
        number: await nextSaasInvoiceNumber(tx),
        subtotal: amountCents,
        total: amountCents,
        discount: 0,
        status: "PENDING",
        billingType: "PIX",
        periodStart,
        periodEnd,
        dueDate,
        description: `Assinatura ${sub.plan.name}`,
        // 🔑 isManual FALSE: esta é a mensalidade. É o que autoriza o webhook a
        // ativar a assinatura quando ela for paga (asaas-payment-target.ts).
        isManual: false,
        source,
      },
      select: { id: true },
    });

    return { kind: "created" as const, invoiceId: invoice.id, amountCents };
  });

  if (decision.kind === "error" || decision.kind === "already_paid") return decision;

  // ── Fase 2: garantir customer + cobrança no Asaas (fora da transação) ──────
  //
  // Se falhar aqui, a Invoice JÁ existe e a próxima chamada a REUSA pela chave
  // `source` — o retry não cria fatura nova, e `ensureInvoiceCharge` é
  // idempotente no Asaas por `invoice:<id>`.
  try {
    await ensureCustomerFn(companyId);
    const charged = await ensureChargeFn(decision.invoiceId);
    return {
      kind: "ok",
      invoiceId: decision.invoiceId,
      // Na REUSA o valor vem da fatura já emitida, não de um recálculo: o preço
      // é CONGELADO no momento da emissão. Recalcular aqui faria uma mudança de
      // tabela alterar o valor de uma cobrança que o cliente já recebeu — e o
      // PIX dele continuaria com o valor antigo.
      amountCents:
        decision.kind === "created" ? decision.amountCents : charged.total,
      reused: decision.kind === "reuse",
      paymentUrl: charged.paymentUrl ?? null,
      pixCode: charged.pixCode ?? null,
      dueDate: charged.dueDate ?? null,
    };
  } catch (e) {
    log.error("Falha ao gerar cobrança de conversão no Asaas", {
      companyId,
      invoiceId: decision.invoiceId,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
