// src/lib/monitoring/system-trends.ts
//
// Tendências da FROTA (Fase 4 do cockpit): agrega as MetricSample persistidas pelo
// flush write-on-request por janela. Cada row é o agregado de UMA instância em UMA
// janela de 5 min, então somar os contadores reconstrói a visão de toda a frota.
// p50/p95 são percentis — não se somam; usamos média ponderada por reqCount
// (cada amostra "vale" o número de requests que a produziu).
import { prisma } from "@/lib/prisma";

export interface MetricSampleRow {
  reqCount: number;
  errorCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  slowQueries: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface SystemTrends {
  windowHours: number;
  sampleCount: number;
  reqCount: number;
  errorCount: number;
  errorRatePct: number;
  p50Ms: number | null;
  p95Ms: number | null;
  slowQueries: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRatePct: number | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Média ponderada por peso; ignora amostras com valor nulo. null se nenhum peso válido. */
function weightedAvg(rows: MetricSampleRow[], pick: (r: MetricSampleRow) => number | null): number | null {
  let weightSum = 0;
  let valueSum = 0;
  for (const r of rows) {
    const v = pick(r);
    if (v === null) continue;
    const w = r.reqCount > 0 ? r.reqCount : 1; // peso mínimo 1 p/ não descartar janelas sem req
    weightSum += w;
    valueSum += v * w;
  }
  return weightSum > 0 ? Math.round(valueSum / weightSum) : null;
}

/**
 * Agregação pura sobre as rows de MetricSample (testável sem banco).
 */
export function aggregateTrends(rows: MetricSampleRow[], windowHours = 24): SystemTrends {
  const reqCount = rows.reduce((s, r) => s + r.reqCount, 0);
  const errorCount = rows.reduce((s, r) => s + r.errorCount, 0);
  const slowQueries = rows.reduce((s, r) => s + r.slowQueries, 0);
  const cacheHits = rows.reduce((s, r) => s + r.cacheHits, 0);
  const cacheMisses = rows.reduce((s, r) => s + r.cacheMisses, 0);
  const cacheTotal = cacheHits + cacheMisses;

  return {
    windowHours,
    sampleCount: rows.length,
    reqCount,
    errorCount,
    errorRatePct: reqCount > 0 ? round1((errorCount / reqCount) * 100) : 0,
    p50Ms: weightedAvg(rows, (r) => r.p50Ms),
    p95Ms: weightedAvg(rows, (r) => r.p95Ms),
    slowQueries,
    cacheHits,
    cacheMisses,
    cacheHitRatePct: cacheTotal > 0 ? round1((cacheHits / cacheTotal) * 100) : null,
  };
}

/**
 * Lê as MetricSample das últimas `windowHours` horas e agrega a frota.
 */
export async function getSystemTrends(windowHours = 24): Promise<SystemTrends> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const rows = await prisma.metricSample.findMany({
    where: { capturedAt: { gte: since } },
    select: {
      reqCount: true,
      errorCount: true,
      p50Ms: true,
      p95Ms: true,
      slowQueries: true,
      cacheHits: true,
      cacheMisses: true,
    },
  });
  return aggregateTrends(rows, windowHours);
}
