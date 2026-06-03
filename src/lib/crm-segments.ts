import type { CustomerSegment } from "@prisma/client";

/**
 * Classificação de segmentos de CRM por cliente (lógica pura, sem I/O).
 *
 * Regra de negócio (decisão do dono): ANIVERSÁRIO TEM PRIORIDADE. Se o cliente
 * está no mês de aniversário, ele recebe SÓ o lembrete BIRTHDAY naquele ciclo —
 * os segmentos de pós-venda/inatividade são pulados. VIP é independente (segue
 * acumulando, pois é uma comunicação de relacionamento à parte).
 *
 * Antes os segmentos não eram exclusivos: BIRTHDAY e VIP usavam `if` solto e a
 * cadeia de inatividade usava `else if` interno — então um aniversariante 30-90d
 * sem comprar gerava BIRTHDAY *e* POST_SALE_30_DAYS, aparecendo nas duas abas.
 */

/** Segmentos de tempo-sem-comprar, mutuamente exclusivos entre si. */
export const TIME_BASED_SEGMENTS = [
  "POST_SALE_30_DAYS",
  "POST_SALE_90_DAYS",
  "INACTIVE_6_MONTHS",
  "INACTIVE_1_YEAR",
  "INACTIVE_2_YEARS",
  "INACTIVE_3_YEARS",
] as const satisfies readonly CustomerSegment[];

export interface SegmentThresholds {
  postSaleDays2: number; // 30
  postSaleDays3: number; // 90
  inactiveDays6Months: number;
  inactiveDays1Year: number;
  inactiveDays2Years: number;
  inactiveDays3Years: number;
  vipMinPurchases: number;
  vipMinTotalSpent: number;
}

export interface ClassifyInput {
  isBirthdayMonth: boolean;
  daysSinceLastPurchase: number | null;
  totalPurchases: number;
  totalSpent: number;
}

export interface SegmentAssignment {
  segment: CustomerSegment;
  priority: number;
}

/** Segmento de tempo-sem-comprar para uma quantidade de dias (ou null). */
export function timeBasedSegment(
  days: number | null,
  t: SegmentThresholds
): SegmentAssignment | null {
  if (days === null) return null;
  if (days >= t.postSaleDays2 && days < t.postSaleDays3)
    return { segment: "POST_SALE_30_DAYS", priority: 80 };
  if (days >= t.postSaleDays3 && days < t.inactiveDays6Months)
    return { segment: "POST_SALE_90_DAYS", priority: 70 };
  if (days >= t.inactiveDays6Months && days < t.inactiveDays1Year)
    return { segment: "INACTIVE_6_MONTHS", priority: 60 };
  if (days >= t.inactiveDays1Year && days < t.inactiveDays2Years)
    return { segment: "INACTIVE_1_YEAR", priority: 50 };
  if (days >= t.inactiveDays2Years && days < t.inactiveDays3Years)
    return { segment: "INACTIVE_2_YEARS", priority: 40 };
  if (days >= t.inactiveDays3Years)
    return { segment: "INACTIVE_3_YEARS", priority: 30 };
  return null;
}

/**
 * Retorna os segmentos que o cliente deve receber neste ciclo.
 * - Aniversariante: BIRTHDAY (prioridade) + VIP se aplicável. SEM tempo-sem-comprar.
 * - Não aniversariante: tempo-sem-comprar (1 faixa) + VIP se aplicável.
 */
export function classifyCustomerSegments(
  input: ClassifyInput,
  t: SegmentThresholds
): SegmentAssignment[] {
  const out: SegmentAssignment[] = [];

  if (input.isBirthdayMonth) {
    out.push({ segment: "BIRTHDAY", priority: 100 });
  } else {
    const timed = timeBasedSegment(input.daysSinceLastPurchase, t);
    if (timed) out.push(timed);
  }

  const isVip =
    input.totalPurchases >= t.vipMinPurchases &&
    input.totalSpent >= t.vipMinTotalSpent;
  if (isVip) out.push({ segment: "VIP_CUSTOMER", priority: 90 });

  return out;
}
