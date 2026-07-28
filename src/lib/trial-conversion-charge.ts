import type { BillingCycle } from "@prisma/client";

/**
 * Regras PURAS da COBRANÇA que converte um trial em assinatura paga.
 *
 * ⚠️ Não confundir com `trial-conversion.ts`, que é a MÉTRICA (quantos trials
 * viraram cliente). Aqui é dinheiro: quanto cobrar, por qual período, e o que
 * fazer quando já existe uma cobrança.
 *
 * Vive separado do serviço porque cada decisão abaixo é uma regra COMERCIAL, e
 * errar qualquer uma cobra o valor errado de um cliente real — precisa ser
 * exercitável sem banco, sem Asaas e sem rede.
 */

/** Prefixo da identidade da cobrança de conversão (gravado em `Invoice.source`). */
export const TRIAL_CONVERSION_SOURCE_PREFIX = "medical-trial-conversion:";

/**
 * Identidade ESTÁVEL por assinatura.
 *
 * É o que torna a operação idempotente sem migração: procurando por esta chave
 * antes de criar, dois cliques reusam a mesma fatura. Sem ela, o cliente pagaria
 * uma cobrança e a outra venceria — rebaixando quem acabou de pagar.
 */
export function trialConversionSource(subscriptionId: string): string {
  return `${TRIAL_CONVERSION_SOURCE_PREFIX}${subscriptionId}`;
}

export interface PeriodInput {
  status: string;
  trialEndsAt: Date | null;
  billingCycle: BillingCycle;
  /** Agora (injetável para teste). */
  now: Date;
}

export interface ConversionPeriod {
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Período que a cobrança de conversão cobre.
 *
 * 🔑 Duas regras, ambas com motivo comercial:
 *
 * - Ainda em TRIAL: o período pago começa quando o trial ACABA. Cobrar a partir
 *   de "agora" faria o cliente pagar por dias de teste que já são dele — quem
 *   antecipa o pagamento seria punido por isso.
 *
 * - Trial já expirado: começa AGORA, não na data de expiração. O intervalo em
 *   que a clínica ficou bloqueada não é serviço prestado; cobrá-lo entregaria um
 *   período que já nasce parcialmente consumido.
 *
 * O fim é por mês/ano de CALENDÁRIO conforme o ciclo — não "30 dias", que
 * derivaria alguns dias por ano e desalinharia do que o cliente entende por
 * mensalidade.
 */
export function resolveConversionPeriod(input: PeriodInput): ConversionPeriod {
  const base =
    input.status === "TRIAL" && input.trialEndsAt && input.trialEndsAt > input.now
      ? input.trialEndsAt
      : input.now;

  const periodStart = new Date(base);
  const periodEnd = new Date(periodStart);
  if (input.billingCycle === "YEARLY") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  return { periodStart, periodEnd };
}

export interface PriceInput {
  billingCycle: BillingCycle;
  priceMonthly: number;
  priceYearly: number;
  discountPercent: number | null;
  discountExpiresAt: Date | null;
  now: Date;
}

/**
 * Valor a cobrar, em centavos. FAIL-CLOSED.
 *
 * O desconto só vale VIGENTE: aplicar um expirado cobraria a menos, e a
 * diferença sairia do bolso do operador sem trilha nenhuma. Arredonda para
 * baixo (favorece o cliente) e nunca devolve valor <= 0 — cobrança de R$ 0 no
 * gateway é erro de configuração, não promoção, e liberaria acesso de graça.
 */
export function resolveConversionPriceCents(input: PriceInput): number {
  const base =
    input.billingCycle === "YEARLY" ? input.priceYearly : input.priceMonthly;

  if (!Number.isInteger(base) || base <= 0) {
    throw new Error(`Preço do plano inválido para cobrança: ${base}`);
  }

  const vigente =
    input.discountExpiresAt === null || input.discountExpiresAt > input.now;
  const temDesconto = input.discountPercent != null && input.discountPercent > 0;

  if (!temDesconto || !vigente) return base;

  // 🔑 Desconto >= 100% NÃO cai silenciosamente no preço cheio: isso cobraria
  // o valor integral de quem foi configurado como isento, e o cliente veria
  // uma fatura que ninguém prometeu. Também não emite R$ 0 (o gateway recusa e
  // liberaria acesso de graça). Estado incoerente → revisão humana.
  const withDiscount = Math.floor(base * (1 - input.discountPercent! / 100));
  if (withDiscount <= 0) {
    throw new Error(
      `Desconto de ${input.discountPercent}% zeraria a cobrança — revisar manualmente`,
    );
  }
  return withDiscount;
}

/**
 * O que fazer diante de uma cobrança de conversão que JÁ existe.
 *
 * Reusar é o comportamento correto: o retry no Asaas já é idempotente pela mesma
 * chave `invoice:<id>` (invoice-charge.service.ts), então o risco real não é
 * cobrar duas vezes no gateway — é criar uma SEGUNDA Invoice local.
 */
export type ExistingChargeDecision =
  | { action: "reuse" }
  | { action: "already_paid" }
  | { action: "needs_review"; reason: string };

export function decideOnExistingCharge(status: string): ExistingChargeDecision {
  if (status === "PENDING" || status === "OVERDUE") return { action: "reuse" };
  if (status === "PAID") return { action: "already_paid" };
  // CANCELED/REFUNDED: houve intervenção humana. Emitir outra por cima disso
  // silenciosamente esconderia um estorno ou um cancelamento deliberado.
  return { action: "needs_review", reason: `fatura de conversão em ${status}` };
}
