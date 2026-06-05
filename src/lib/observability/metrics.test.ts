import { describe, it, expect, beforeEach } from "vitest";
import { metrics } from "./metrics";

beforeEach(() => metrics._resetForTests());

describe("metrics", () => {
  it("conta requests e erros e calcula percentis", () => {
    metrics.recordRequest({ route: "/a", status: 200, durationMs: 100 });
    metrics.recordRequest({ route: "/a", status: 500, durationMs: 300 });
    const s = metrics.snapshot();
    expect(s.reqCount).toBe(2);
    expect(s.errorCount).toBe(1);
    expect(s.p50Ms).not.toBeNull();
  });

  it("contabiliza cache hit/miss", () => {
    metrics.cacheHit();
    metrics.cacheHit();
    metrics.cacheMiss();
    expect(metrics.snapshot().cacheHits).toBe(2);
    expect(metrics.snapshot().cacheMisses).toBe(1);
  });

  it("conta slow queries", () => {
    metrics.recordSlowQuery();
    expect(metrics.snapshot().slowQueries).toBe(1);
  });

  it("dispara flush ao virar a janela, com os agregados da janela anterior", () => {
    const flushed: any[] = [];
    metrics._setFlushSink((s) => flushed.push(s));
    metrics.recordRequest({ route: "/a", status: 200, durationMs: 100, nowMs: 0 });
    metrics.recordRequest({ route: "/a", status: 500, durationMs: 200, nowMs: 0 });
    // vira a janela (WINDOW_MS = 5*60*1000 = 300000)
    metrics.recordRequest({ route: "/a", status: 200, durationMs: 50, nowMs: 300001 });
    expect(flushed.length).toBe(1);
    expect(flushed[0].reqCount).toBe(2);
    expect(flushed[0].errorCount).toBe(1);
  });
});
