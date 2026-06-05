// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/observability/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/health        → liveness enxuto (público, p/ uptime monitors)
 * GET /api/health?deep=1 → readiness com SELECT 1
 * NUNCA expõe libs/env/connection string (Regra de segurança §10).
 */
export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  const report = await checkHealth(deep);
  const httpStatus = report.status === "down" ? 503 : 200;
  return NextResponse.json(
    {
      status: report.status,
      uptime: report.uptimeS,
      version: report.version,
      timestamp: report.timestamp,
      ...(deep ? { db: report.db.status } : {}),
    },
    { status: httpStatus },
  );
}
