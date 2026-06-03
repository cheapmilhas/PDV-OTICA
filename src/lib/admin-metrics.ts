/**
 * Métricas do dashboard admin (Fase B — visão geral acionável).
 *
 * Lógica PURA de tendência (variação período atual vs. anterior), testável sem
 * banco. As queries de contagem/soma ficam no server component; aqui só a
 * matemática da comparação — que é onde um sinal errado (↑ vs ↓) confunde.
 */

export type TrendDirection = "up" | "down" | "flat";

export interface Trend {
  current: number;
  previous: number;
  /** Variação percentual arredondada (inteiro). null quando não é calculável. */
  percent: number | null;
  direction: TrendDirection;
}

/**
 * Compara o valor atual com o do período anterior.
 *
 * - previous 0 e current > 0 → "up" com percent null (crescimento "do zero",
 *   percentual não faz sentido; a UI mostra "novo" em vez de "+∞%").
 * - previous 0 e current 0 → "flat", percent 0.
 * - senão → percent = round((current-previous)/previous * 100), direção pelo sinal.
 */
export function computeTrend(current: number, previous: number): Trend {
  if (previous === 0) {
    if (current === 0) return { current, previous, percent: 0, direction: "flat" };
    return { current, previous, percent: null, direction: "up" };
  }
  const raw = ((current - previous) / previous) * 100;
  const percent = Math.round(raw);
  const direction: TrendDirection = percent > 0 ? "up" : percent < 0 ? "down" : "flat";
  return { current, previous, percent, direction };
}

/**
 * Texto curto de tendência para a UI. Ex.: "+12%", "-8%", "novo", "estável".
 */
export function formatTrend(trend: Trend): string {
  if (trend.percent === null) return trend.direction === "up" ? "novo" : "—";
  if (trend.percent === 0) return "estável";
  const sign = trend.percent > 0 ? "+" : "";
  return `${sign}${trend.percent}%`;
}

// ────────────────────────────────────────────────────────────────────────────
// MRR / Churn (Fase F4) — lógica PURA, em centavos (inteiro), testável sem banco.
// ────────────────────────────────────────────────────────────────────────────

export type SubscriptionCycle = "MONTHLY" | "YEARLY";

/** Dados mínimos de uma subscription para o cálculo de MRR. */
export interface SubscriptionForMRR {
  priceMonthly: number; // centavos (Plan.priceMonthly)
  priceYearly: number; // centavos (Plan.priceYearly)
  billingCycle: SubscriptionCycle;
  discountPercent: number | null;
  discountExpiresAt: Date | null;
}

/** Um desconto vigente em `now`: percent>0 e (sem expiração OU expira no futuro). */
function isDiscountActive(
  discountPercent: number | null,
  discountExpiresAt: Date | null,
  now: Date
): boolean {
  if (!discountPercent || discountPercent <= 0) return false;
  // null = permanente (vigente); data no passado = expirado.
  return discountExpiresAt === null || discountExpiresAt.getTime() > now.getTime();
}

/**
 * Valor recorrente MENSAL efetivo de UMA subscription, em centavos.
 *
 * - Normaliza o ciclo: YEARLY → priceYearly/12 (arredondado ao centavo); MONTHLY → priceMonthly.
 * - Aplica o desconto SOMENTE se vigente em `now` (discountExpiresAt null = permanente).
 *
 * Arredonda ao centavo por subscription antes de somar (pode haver ±centavos vs
 * somar-depois-dividir — aceito; ver L1 do plano).
 */
export function monthlyValueOfSubscription(sub: SubscriptionForMRR, now: Date): number {
  const base = sub.billingCycle === "YEARLY" ? Math.round(sub.priceYearly / 12) : sub.priceMonthly;
  if (!isDiscountActive(sub.discountPercent, sub.discountExpiresAt, now)) {
    return base;
  }
  const discount = Math.round((base * (sub.discountPercent as number)) / 100);
  return Math.max(0, base - discount);
}

/**
 * MRR (receita recorrente mensal), em centavos. Soma o valor mensal efetivo das
 * subscriptions passadas — o CALLER deve passar SÓ as ACTIVE (decisão F4: MRR é
 * receita recorrente realizada; TRIAL/PAST_DUE/SUSPENDED ficam de fora).
 */
export function computeMRR(activeSubscriptions: SubscriptionForMRR[], now: Date): number {
  return activeSubscriptions.reduce((acc, sub) => acc + monthlyValueOfSubscription(sub, now), 0);
}

/**
 * Taxa de churn do período (0..1): canceladas no período ÷ base ativa no início.
 * Base 0 → 0 (evita divisão por zero e "churn infinito").
 *
 * NOTA: a base inicial é uma ESTIMATIVA (status atual ≠ status passado; não há
 * snapshot histórico de status). Ver C3 do plano.
 */
export function computeChurnRate(args: {
  canceledInPeriod: number;
  activeAtPeriodStart: number;
}): number {
  if (args.activeAtPeriodStart <= 0) return 0;
  return args.canceledInPeriod / args.activeAtPeriodStart;
}
