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

let acc = emptyAcc();

export const metrics = {
  recordRequest({ status, durationMs }: { route: string; status: number; durationMs: number }) {
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
  _resetForTests() {
    acc = emptyAcc();
  },
};
