import { describe, it, expect } from "vitest";
import { evaluateAlerts, alertMetricsFromPulse, DEFAULT_ALERT_RULES, type AlertMetrics } from "./alert-rules";
import type { SystemPulse } from "./system-pulse";

function metrics(over: Partial<AlertMetrics> = {}): AlertMetrics {
  return {
    dbStatus: "ok",
    errorRatePct: 0,
    reqCount: 100,
    p95Ms: 200,
    ...over,
  };
}

describe("evaluateAlerts", () => {
  it("não dispara nada com sistema saudável", () => {
    expect(evaluateAlerts(metrics(), DEFAULT_ALERT_RULES)).toEqual([]);
  });

  it("dispara alerta de db down", () => {
    const fired = evaluateAlerts(metrics({ dbStatus: "down" }), DEFAULT_ALERT_RULES);
    expect(fired.map((a) => a.id)).toContain("db_down");
    expect(fired.find((a) => a.id === "db_down")?.level).toBe("error");
  });

  it("dispara alerta de taxa de erro acima de 5% (com requests suficientes)", () => {
    const fired = evaluateAlerts(metrics({ errorRatePct: 8, reqCount: 100 }), DEFAULT_ALERT_RULES);
    expect(fired.map((a) => a.id)).toContain("error_rate_high");
  });

  it("NÃO dispara taxa de erro com poucas requests (evita falso positivo)", () => {
    const fired = evaluateAlerts(metrics({ errorRatePct: 50, reqCount: 3 }), DEFAULT_ALERT_RULES);
    expect(fired.map((a) => a.id)).not.toContain("error_rate_high");
  });

  it("dispara alerta de p95 acima de 2000ms", () => {
    const fired = evaluateAlerts(metrics({ p95Ms: 2500 }), DEFAULT_ALERT_RULES);
    expect(fired.map((a) => a.id)).toContain("latency_high");
    expect(fired.find((a) => a.id === "latency_high")?.level).toBe("warning");
  });

  it("não dispara p95 quando não há amostra (p95 null)", () => {
    const fired = evaluateAlerts(metrics({ p95Ms: null }), DEFAULT_ALERT_RULES);
    expect(fired.map((a) => a.id)).not.toContain("latency_high");
  });

  it("pode disparar múltiplos alertas de uma vez", () => {
    const fired = evaluateAlerts(metrics({ dbStatus: "down", errorRatePct: 10, reqCount: 100 }), DEFAULT_ALERT_RULES);
    expect(fired.length).toBeGreaterThanOrEqual(2);
  });
});

describe("alertMetricsFromPulse", () => {
  it("projeta o pulso nas métricas de alerta", () => {
    const pulse = {
      status: "degraded", db: { status: "down", latencyMs: null },
      uptimeS: 10, version: "x", timestamp: "t",
      reqCount: 42, errorCount: 5, errorRatePct: 12,
      p50Ms: 100, p95Ms: 3000, slowQueries: 0,
      cacheHits: 0, cacheMisses: 0, cacheHitRatePct: null,
      memoryRssMb: 100, memoryHeapUsedMb: 60,
    } as SystemPulse;
    expect(alertMetricsFromPulse(pulse)).toEqual({
      dbStatus: "down", errorRatePct: 12, reqCount: 42, p95Ms: 3000,
    });
  });
});
