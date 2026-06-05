// src/lib/monitoring/system-pulse.ts
//
// Pulso ao vivo do sistema (Fase 4 do cockpit): combina saúde do DB (checkHealth),
// os contadores in-memory da instância (metrics.snapshot) e o uso de memória do
// processo num único objeto consumível pela UI. É "ao vivo" e por-instância — a
// visão da frota inteira vem de getSystemTrends (agregado via MetricSample).
import { checkHealth, type HealthReport, type HealthStatus } from "@/lib/observability/health";
import { metrics, type MetricsSnapshot } from "@/lib/observability/metrics";

export interface MemoryUsage {
  rssBytes: number;
  heapUsedBytes: number;
}

export interface SystemPulse {
  status: HealthStatus;
  db: { status: HealthStatus; latencyMs: number | null };
  uptimeS: number;
  version: string;
  timestamp: string;
  reqCount: number;
  errorCount: number;
  errorRatePct: number;
  p50Ms: number | null;
  p95Ms: number | null;
  slowQueries: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRatePct: number | null;
  memoryRssMb: number;
  memoryHeapUsedMb: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function toMb(bytes: number): number {
  return round1(bytes / (1024 * 1024));
}

/**
 * Montagem pura do pulso a partir das três fontes — testável sem banco/processo.
 */
export function buildPulse(
  health: HealthReport,
  snapshot: MetricsSnapshot,
  mem: MemoryUsage,
): SystemPulse {
  const errorRatePct = snapshot.reqCount > 0 ? round1((snapshot.errorCount / snapshot.reqCount) * 100) : 0;
  const cacheTotal = snapshot.cacheHits + snapshot.cacheMisses;
  const cacheHitRatePct = cacheTotal > 0 ? round1((snapshot.cacheHits / cacheTotal) * 100) : null;

  return {
    status: health.status,
    db: health.db,
    uptimeS: health.uptimeS,
    version: health.version,
    timestamp: health.timestamp,
    reqCount: snapshot.reqCount,
    errorCount: snapshot.errorCount,
    errorRatePct,
    p50Ms: snapshot.p50Ms,
    p95Ms: snapshot.p95Ms,
    slowQueries: snapshot.slowQueries,
    cacheHits: snapshot.cacheHits,
    cacheMisses: snapshot.cacheMisses,
    cacheHitRatePct,
    memoryRssMb: toMb(mem.rssBytes),
    memoryHeapUsedMb: toMb(mem.heapUsedBytes),
  };
}

/**
 * Versão "viva": toca o banco (checkHealth deep) e lê o estado da instância atual.
 */
export async function getSystemPulse(): Promise<SystemPulse> {
  const health = await checkHealth(true);
  const snapshot = metrics.snapshot();
  const mem = process.memoryUsage();
  return buildPulse(health, snapshot, { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed });
}
