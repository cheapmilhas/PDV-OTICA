import { describe, it, expect } from "vitest";
import { buildPulse } from "./system-pulse";
import type { HealthReport } from "@/lib/observability/health";
import type { MetricsSnapshot } from "@/lib/observability/metrics";

const health: HealthReport = {
  status: "ok",
  db: { status: "ok", latencyMs: 40 },
  uptimeS: 1234,
  version: "abc1234",
  timestamp: "2026-06-05T00:00:00.000Z",
};

const snapshot: MetricsSnapshot = {
  reqCount: 200,
  errorCount: 4,
  p50Ms: 80,
  p95Ms: 350,
  slowQueries: 2,
  cacheHits: 90,
  cacheMisses: 10,
};

describe("buildPulse", () => {
  it("combina health + snapshot + memória num pulso único", () => {
    const p = buildPulse(health, snapshot, { rssBytes: 100 * 1024 * 1024, heapUsedBytes: 60 * 1024 * 1024 });
    expect(p.status).toBe("ok");
    expect(p.db.status).toBe("ok");
    expect(p.reqCount).toBe(200);
    expect(p.p95Ms).toBe(350);
    expect(p.memoryRssMb).toBe(100);
  });

  it("calcula taxa de erro em % com 1 casa", () => {
    const p = buildPulse(health, snapshot, { rssBytes: 0, heapUsedBytes: 0 });
    expect(p.errorRatePct).toBe(2); // 4/200
  });

  it("taxa de erro é 0 quando não há requests", () => {
    const p = buildPulse(health, { ...snapshot, reqCount: 0, errorCount: 0 }, { rssBytes: 0, heapUsedBytes: 0 });
    expect(p.errorRatePct).toBe(0);
  });

  it("calcula taxa de acerto de cache em %", () => {
    const p = buildPulse(health, snapshot, { rssBytes: 0, heapUsedBytes: 0 });
    expect(p.cacheHitRatePct).toBe(90); // 90/(90+10)
  });

  it("cacheHitRate é null quando não houve acesso ao cache", () => {
    const p = buildPulse(health, { ...snapshot, cacheHits: 0, cacheMisses: 0 }, { rssBytes: 0, heapUsedBytes: 0 });
    expect(p.cacheHitRatePct).toBeNull();
  });
});
