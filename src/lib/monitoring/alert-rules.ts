// src/lib/monitoring/alert-rules.ts
//
// Regras de alerta do sistema (Fase 6). Avaliação PURA e testável: recebe as métricas
// do pulso e devolve os alertas disparados. O disparo externo (Sentry captureMessage)
// fica no caller (endpoint observability) — aqui é só a decisão "passou do limiar?".
// Limiares em constantes (não editáveis pela UI — YAGNI), alinhados ao detector de
// issues: erro >5%, p95 >2000ms, db down.
import type { HealthStatus } from "@/lib/observability/health";
import type { SystemPulse } from "./system-pulse";

export interface AlertMetrics {
  dbStatus: HealthStatus;
  errorRatePct: number;
  reqCount: number;
  p95Ms: number | null;
}

/** Projeta o pulso do sistema nas métricas que as regras avaliam (puro). */
export function alertMetricsFromPulse(pulse: SystemPulse): AlertMetrics {
  return {
    dbStatus: pulse.db.status,
    errorRatePct: pulse.errorRatePct,
    reqCount: pulse.reqCount,
    p95Ms: pulse.p95Ms,
  };
}

export type AlertLevel = "warning" | "error";

export interface AlertRule {
  id: string;
  level: AlertLevel;
  message: string;
  /** Predicado puro: true = alerta dispara. */
  test: (m: AlertMetrics) => boolean;
}

export interface FiredAlert {
  id: string;
  level: AlertLevel;
  message: string;
}

// Limiares (espelham issues.ts p/ coerência cockpit↔alerta).
export const ALERT_ERROR_RATE_PCT = 5;
export const ALERT_MIN_REQ = 20;
export const ALERT_P95_MS = 2000;

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: "db_down",
    level: "error",
    message: "Banco de dados não está respondendo (db down)",
    test: (m) => m.dbStatus === "down",
  },
  {
    id: "error_rate_high",
    level: "error",
    message: `Taxa de erro acima de ${ALERT_ERROR_RATE_PCT}%`,
    test: (m) => m.reqCount >= ALERT_MIN_REQ && m.errorRatePct >= ALERT_ERROR_RATE_PCT,
  },
  {
    id: "latency_high",
    level: "warning",
    message: `Latência p95 acima de ${ALERT_P95_MS}ms`,
    test: (m) => m.p95Ms !== null && m.p95Ms >= ALERT_P95_MS,
  },
];

/**
 * Avalia as regras contra as métricas e retorna os alertas disparados (puro).
 */
export function evaluateAlerts(metrics: AlertMetrics, rules: AlertRule[] = DEFAULT_ALERT_RULES): FiredAlert[] {
  return rules
    .filter((r) => r.test(metrics))
    .map((r) => ({ id: r.id, level: r.level, message: r.message }));
}
