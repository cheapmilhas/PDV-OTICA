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
