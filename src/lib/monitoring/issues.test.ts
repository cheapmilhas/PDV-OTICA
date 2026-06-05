import { describe, it, expect } from "vitest";
import { detectSystemIssues, detectErrorRateIssue } from "./issues";
import type { SystemPulse } from "./system-pulse";

function pulse(over: Partial<SystemPulse> = {}): SystemPulse {
  return {
    status: "ok",
    db: { status: "ok", latencyMs: 40 },
    uptimeS: 100, version: "abc", timestamp: "2026-06-05T00:00:00.000Z",
    reqCount: 100, errorCount: 0, errorRatePct: 0,
    p50Ms: 50, p95Ms: 200, slowQueries: 0,
    cacheHits: 0, cacheMisses: 0, cacheHitRatePct: null,
    memoryRssMb: 100, memoryHeapUsedMb: 60,
    ...over,
  };
}

describe("detectSystemIssues — sistema lento/fora do ar", () => {
  it("não dispara quando db ok e status ok", () => {
    expect(detectSystemIssues(pulse())).toEqual([]);
  });
  it("dispara warning quando db degraded", () => {
    const issues = detectSystemIssues(pulse({ db: { status: "degraded", latencyMs: 900 }, status: "degraded" }));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].category).toBe("system");
    expect(issues[0].id).toBe("system_slow");
  });
  it("dispara critical quando sistema down", () => {
    const issues = detectSystemIssues(pulse({ db: { status: "down", latencyMs: null }, status: "down" }));
    expect(issues[0].severity).toBe("critical");
  });
});

describe("detectErrorRateIssue", () => {
  it("não dispara abaixo do limiar", () => {
    expect(detectErrorRateIssue(pulse({ reqCount: 100, errorRatePct: 2 }))).toBeNull();
  });
  it("não dispara com poucas requests (evita falso positivo)", () => {
    expect(detectErrorRateIssue(pulse({ reqCount: 5, errorRatePct: 50 }))).toBeNull();
  });
  it("dispara critical quando erro >= 5% com requests suficientes", () => {
    const i = detectErrorRateIssue(pulse({ reqCount: 100, errorRatePct: 8 }));
    expect(i?.severity).toBe("critical");
    expect(i?.id).toBe("error_rate");
    expect(i?.action?.kind).toBe("link");
  });
});
