// src/lib/observability/health.ts
import { prisma } from "@/lib/prisma";

export type HealthStatus = "ok" | "degraded" | "down";

export interface HealthReport {
  status: HealthStatus;
  db: { status: HealthStatus; latencyMs: number | null };
  uptimeS: number;
  version: string;
  timestamp: string;
}

const SLOW_DB_MS = 500;

/**
 * Lógica pura de classificação (testável sem banco).
 */
export function buildHealthReport(input: {
  dbOk: boolean;
  dbLatencyMs: number | null;
  uptimeS: number;
  version: string;
}): HealthReport {
  const dbStatus: HealthStatus = !input.dbOk
    ? "down"
    : (input.dbLatencyMs ?? 0) > SLOW_DB_MS
      ? "degraded"
      : "ok";
  const status: HealthStatus = dbStatus === "down" ? "down" : dbStatus === "degraded" ? "degraded" : "ok";
  return {
    status,
    db: { status: dbStatus, latencyMs: input.dbLatencyMs },
    uptimeS: input.uptimeS,
    version: input.version,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Versão "viva" — toca o banco com timeout curto. deep=false pula o SELECT 1.
 */
export async function checkHealth(deep: boolean): Promise<HealthReport> {
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
  const uptimeS = Math.round(process.uptime());

  if (!deep) {
    return buildHealthReport({ dbOk: true, dbLatencyMs: null, uptimeS, version });
  }

  let dbOk = false;
  let dbLatencyMs: number | null = null;
  const started = performance.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, rej) => setTimeout(() => rej(new Error("db timeout")), 2000)),
    ]);
    dbOk = true;
    dbLatencyMs = Math.round(performance.now() - started);
  } catch {
    dbOk = false;
    dbLatencyMs = null;
  }
  return buildHealthReport({ dbOk, dbLatencyMs, uptimeS, version });
}
