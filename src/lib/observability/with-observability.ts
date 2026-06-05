// src/lib/observability/with-observability.ts
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { metrics } from "./metrics";
import { readRequestId, REQUEST_ID_HEADER } from "./request-context";

const log = logger.child({ module: "observability" });

type Handler = (req: NextRequest, ctx: any) => Promise<NextResponse> | NextResponse;

/**
 * Envolve um route handler: cronometra, loga JSON {requestId,method,route,status,durationMs},
 * alimenta o coletor de métricas e garante x-request-id na resposta.
 */
export function withObservability(routeLabel: string, handler: Handler): Handler {
  return async (req, ctx) => {
    const requestId = readRequestId(req.headers);
    const started = performance.now();
    let status = 500;
    try {
      const res = await handler(req, ctx);
      status = res.status;
      res.headers.set(REQUEST_ID_HEADER, requestId);
      return res;
    } finally {
      const durationMs = Math.round(performance.now() - started);
      metrics.recordRequest({ route: routeLabel, status, durationMs });
      log.info("request", { requestId, method: req.method, route: routeLabel, status, durationMs });
    }
  };
}
