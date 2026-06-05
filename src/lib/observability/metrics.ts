import { percentile } from "./percentiles";

interface Accumulator {
  reqCount: number;
  errorCount: number;
  durations: number[];
  slowQueries: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface MetricsSnapshot {
  reqCount: number;
  errorCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  slowQueries: number;
  cacheHits: number;
  cacheMisses: number;
}

function emptyAcc(): Accumulator {
  return { reqCount: 0, errorCount: 0, durations: [], slowQueries: 0, cacheHits: 0, cacheMisses: 0 };
}

const WINDOW_MS = 5 * 60 * 1000;

function windowOf(ms: number): number {
  return Math.floor(ms / WINDOW_MS);
}

function defaultFlushSink(s: MetricsSnapshot): void {
  void (async () => {
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.metricSample.create({
        data: {
          windowMin: 5,
          reqCount: s.reqCount,
          errorCount: s.errorCount,
          p50Ms: s.p50Ms,
          p95Ms: s.p95Ms,
          slowQueries: s.slowQueries,
          cacheHits: s.cacheHits,
          cacheMisses: s.cacheMisses,
        },
      });
    } catch {
      /* flush é best-effort; não propaga */
    }
  })();
}

let acc = emptyAcc();
let currentWindow: number | null = null;
let flushSink: (s: MetricsSnapshot) => void = defaultFlushSink;

export const metrics = {
  recordRequest({
    status,
    durationMs,
    nowMs = Date.now(),
  }: {
    route: string;
    status: number;
    durationMs: number;
    nowMs?: number;
  }) {
    const w = windowOf(nowMs);
    if (currentWindow !== null && w !== currentWindow) {
      flushSink(this.snapshot());
      acc = emptyAcc();
    }
    currentWindow = w;
    acc.reqCount++;
    if (status >= 500) acc.errorCount++;
    // cap defensivo do buffer de durações (evita crescer sem limite numa instância longeva)
    if (acc.durations.length < 5000) acc.durations.push(durationMs);
  },
  recordSlowQuery() {
    acc.slowQueries++;
  },
  cacheHit() {
    acc.cacheHits++;
  },
  cacheMiss() {
    acc.cacheMisses++;
  },
  snapshot(): MetricsSnapshot {
    return {
      reqCount: acc.reqCount,
      errorCount: acc.errorCount,
      p50Ms: percentile(acc.durations, 50),
      p95Ms: percentile(acc.durations, 95),
      slowQueries: acc.slowQueries,
      cacheHits: acc.cacheHits,
      cacheMisses: acc.cacheMisses,
    };
  },
  _setFlushSink(fn: (s: MetricsSnapshot) => void) {
    flushSink = fn;
  },
  _resetForTests() {
    acc = emptyAcc();
    currentWindow = null;
    flushSink = defaultFlushSink;
  },
};
