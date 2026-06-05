import { PrismaClient } from "@prisma/client";
import { registerAuditMiddleware } from "./prisma-audit-middleware";
import { registerTenantGuard } from "./prisma-tenant-guard";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Constrói a DATABASE_URL com connection_limit anexado quando
 * PRISMA_CONNECTION_LIMIT está definido. Em Vercel serverless, cada lambda
 * abre um pool — limitar evita esgotar slots do Neon (default 100 no plano free).
 * Default Prisma é num_physical_cpus * 2 + 1, alto demais pra serverless.
 */
function buildDatabaseUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  const limit = process.env.PRISMA_CONNECTION_LIMIT;
  if (!limit || /[?&]connection_limit=/.test(base)) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}connection_limit=${limit}`;
}

function createPrismaClient(): PrismaClient {
  const url = buildDatabaseUrl();
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(url && { datasources: { db: { url } } }),
  });
  registerTenantGuard(client);
  registerAuditMiddleware(client);

  const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 200);
  const queryLogEnabled = process.env.PRISMA_QUERY_LOG === "1";

  if (queryLogEnabled) {
    client.$use(async (params, next) => {
      const start = performance.now();
      const result = await next(params);
      const durationMs = performance.now() - start;
      if (durationMs >= SLOW_QUERY_MS) {
        try {
          const { metrics } = await import("./observability/metrics");
          const { logger } = await import("./logger");
          metrics.recordSlowQuery();
          logger.child({ module: "prisma" }).warn("slow query", {
            model: params.model,
            action: params.action,
            durationMs: Math.round(durationMs),
            // NUNCA logar params.args (PII)
          });
        } catch {
          /* nunca quebrar uma query por telemetria */
        }
      }
      return result;
    });
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
