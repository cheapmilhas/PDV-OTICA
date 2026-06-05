# Cockpit de Monitoramento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a aba `/admin/monitoramento` (cockpit) no super-admin, unificando saúde do sistema (observabilidade) e saúde dos clientes (negócio), com um motor de ações declarativo (blueprints Zod + auditoria).

**Architecture:** Quatro camadas isoladas — coleta de sistema (`src/lib/observability/`), agregação (`src/lib/monitoring/`), motor de ações (`src/lib/admin-actions/`), e UI (`src/app/admin/monitoramento/`). Métricas de tendência usam *flush write-on-request por janela* (não cron, por causa do Vercel Hobby). Reaproveita logger/sentry/error-handler/health-score/admin-auth existentes.

**Tech Stack:** Next.js 16 (App Router), Prisma + PostgreSQL (Neon), TypeScript, Zod, Vitest (`npm test` → `vitest run`), Vercel Hobby.

**Spec de referência:** `docs/superpowers/specs/2026-06-05-cockpit-monitoramento-design.md`

---

## Convenções deste plano (ler antes de começar)

- **Testes:** Vitest. Arquivos `.test.ts` colocados ao lado do código (ex.: `src/lib/foo.ts` → `src/lib/foo.test.ts`). Import: `import { describe, it, expect } from "vitest";`. Rodar um arquivo: `npm test -- src/lib/foo.test.ts`. Rodar tudo: `npm test`.
- **Cobertura:** o vitest só mede `src/lib/**` e `src/services/**`. Portanto **toda lógica testável deve morar em `src/lib/`** (funções puras), nunca dentro de route handlers ou componentes.
- **Auth admin:** usar `requireAdminAuth()` / `requireAdminRole([...])` de `@/lib/admin-auth-helpers`. Enum `AdminRole = SUPER_ADMIN | ADMIN | SUPPORT | BILLING` (de `@prisma/client`).
- **Erros de API:** `handleApiError(error)` de `@/lib/error-handler`. Respostas de sucesso podem usar `successResponse`/`createdResponse` de `@/lib/api-response`.
- **Checagem de fim de fase (REGRA DO PROJETO):** ao fim de CADA fase, rodar nesta ordem e só seguir se tudo passar:
  1. `npx tsc --noEmit`
  2. `npm run build`
  3. `npm test`
  4. review (dispatch code-reviewer no diff da fase)
- **Migrations:** `npx prisma migrate dev --name <nome>` em dev. O build em prod roda `prisma migrate deploy` automaticamente.
- **Commits frequentes:** um commit por tarefa concluída (teste+impl juntos). Tipo conventional: `feat:`/`test:`/`chore:`.
- **NÃO reiniciar o dev server repetidamente** (corrompe Turbopack → 500). Aprendizado registrado do projeto.

---

## File Structure (mapa de decomposição)

**Fase 1 — Observabilidade de sistema:**
- Create: `src/lib/observability/request-context.ts` — gera/lê request id (Edge-safe). Responsabilidade: identidade de request.
- Create: `src/lib/observability/request-context.test.ts`
- Create: `src/lib/observability/metrics.ts` — coletor in-memory (contadores + percentis + flush). Responsabilidade: agregação in-instance.
- Create: `src/lib/observability/metrics.test.ts`
- Create: `src/lib/observability/percentiles.ts` — função pura p50/p95. Responsabilidade: estatística (isolada p/ testar).
- Create: `src/lib/observability/percentiles.test.ts`
- Create: `src/lib/observability/health.ts` — `checkHealth(deep)`. Responsabilidade: liveness/readiness.
- Create: `src/lib/observability/health.test.ts`
- Create: `src/lib/observability/with-observability.ts` — wrapper de route handler.
- Create: `src/app/api/health/route.ts` — endpoint público.
- Modify: `src/proxy.ts` — injetar `x-request-id` em todos os caminhos de retorno.
- Modify: `src/lib/prisma.ts` — slow-query timing via `$use` (gated por env).
- Modify: `src/lib/plan-features-cache.ts` + `src/lib/idempotency.ts` — chamar `metrics.cacheHit/Miss`.

**Fase 2 — Persistência de tendências:**
- Modify: `prisma/schema.prisma` — model `MetricSample`.
- Modify: `src/lib/observability/metrics.ts` — flush grava `MetricSample` ao virar janela.
- Modify: cron diário existente (`src/app/api/cron/mark-delayed/route.ts`) — retenção 30d.

**Fase 3 — Motor de ações:**
- Modify: `prisma/schema.prisma` — model `AdminActionLog`.
- Create: `src/lib/admin-actions/types.ts` — interface `AdminActionBlueprint`.
- Create: `src/lib/admin-actions/validate.ts` — validação de input + guarda de risco (pura).
- Create: `src/lib/admin-actions/validate.test.ts`
- Create: `src/lib/admin-actions/blueprints/*.ts` — um arquivo por categoria (client.ts, etc.).
- Create: `src/lib/admin-actions/registry.ts` — agrega blueprints.
- Create: `src/lib/admin-actions/registry.test.ts`
- Create: `src/app/api/admin/actions/[id]/route.ts` — rota única executora.

**Fase 4 — Agregação:**
- Create: `src/lib/monitoring/system-pulse.ts` + test
- Create: `src/lib/monitoring/system-trends.ts` + test
- Create: `src/lib/monitoring/client-health-snapshot.ts` + test

**Fase 5 — UI:**
- Create: `src/app/admin/monitoramento/page.tsx` (server component)
- Create: `src/app/admin/monitoramento/cockpit-client.tsx` (polling do pulso)
- Create: `src/app/admin/monitoramento/action-modal.tsx` (modal gerado por schema)
- Create: `src/app/api/admin/observability/route.ts` (payload do cockpit)
- Modify: `src/app/admin/admin-nav.tsx` — item "Monitoramento"

**Fase 6 — Alertas + deploy guard:**
- Create: `src/lib/monitoring/alert-rules.ts` + test
- Create: `scripts/post-deploy-smoke.ts`
- Create: `docs/runbooks/rollback.md`

---

# FASE 1 — Espinha de observabilidade de sistema

*Sem migration. Entrega: request id rastreável, /api/health, slow-query log, contadores de cache.*

### Task 1.1: Request context (request id)

**Files:**
- Create: `src/lib/observability/request-context.ts`
- Test: `src/lib/observability/request-context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/observability/request-context.test.ts
import { describe, it, expect } from "vitest";
import { newRequestId, readRequestId, REQUEST_ID_HEADER } from "./request-context";

describe("request-context", () => {
  it("newRequestId gera id com prefixo req_ e sem hifens", () => {
    const id = newRequestId();
    expect(id).toMatch(/^req_[a-f0-9]{16}$/);
  });

  it("newRequestId gera ids distintos", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });

  it("readRequestId reusa o header existente quando presente", () => {
    const h = new Headers();
    h.set(REQUEST_ID_HEADER, "req_existing");
    expect(readRequestId(h)).toBe("req_existing");
  });

  it("readRequestId gera um novo quando ausente", () => {
    expect(readRequestId(new Headers())).toMatch(/^req_/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/observability/request-context.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/observability/request-context.ts
/**
 * Identidade de request para rastreabilidade (Regra 1).
 * Edge-safe: usa apenas crypto.randomUUID (disponível no runtime Edge).
 */
export const REQUEST_ID_HEADER = "x-request-id";

export function newRequestId(): string {
  return "req_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function readRequestId(headers: Headers): string {
  const existing = headers.get(REQUEST_ID_HEADER);
  if (existing && existing.startsWith("req_")) return existing;
  return newRequestId();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/observability/request-context.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/observability/request-context.ts src/lib/observability/request-context.test.ts
git commit -m "feat(observability): request id context (Regra 1)"
```

---

### Task 1.2: Percentis (função pura)

**Files:**
- Create: `src/lib/observability/percentiles.ts`
- Test: `src/lib/observability/percentiles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/observability/percentiles.test.ts
import { describe, it, expect } from "vitest";
import { percentile } from "./percentiles";

describe("percentile", () => {
  it("retorna null para lista vazia", () => {
    expect(percentile([], 50)).toBeNull();
  });
  it("p50 de [10,20,30] é 20", () => {
    expect(percentile([10, 20, 30], 50)).toBe(20);
  });
  it("p95 escolhe o valor próximo ao topo", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(xs, 95)).toBe(95);
  });
  it("não depende da ordem de entrada", () => {
    expect(percentile([30, 10, 20], 50)).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/observability/percentiles.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/observability/percentiles.ts
/**
 * Percentil "nearest-rank" sobre uma amostra de durações (ms).
 * Puro e determinístico — base das métricas p50/p95.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/observability/percentiles.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/observability/percentiles.ts src/lib/observability/percentiles.test.ts
git commit -m "feat(observability): percentil puro p50/p95"
```

---

### Task 1.3: Coletor de métricas in-memory (sem flush ainda)

**Files:**
- Create: `src/lib/observability/metrics.ts`
- Test: `src/lib/observability/metrics.test.ts`

Nota: nesta fase o coletor só acumula e dá `snapshot()`. O flush para o banco entra na Fase 2.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/observability/metrics.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/observability/metrics.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/observability/metrics.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/observability/metrics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/observability/metrics.ts src/lib/observability/metrics.test.ts
git commit -m "feat(observability): coletor de métricas in-memory (Regras 6,7)"
```

---

### Task 1.4: Health check (`checkHealth`)

**Files:**
- Create: `src/lib/observability/health.ts`
- Test: `src/lib/observability/health.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/observability/health.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildHealthReport } from "./health";

describe("buildHealthReport", () => {
  it("status ok quando db responde", () => {
    const r = buildHealthReport({ dbOk: true, dbLatencyMs: 40, uptimeS: 100, version: "abc" });
    expect(r.status).toBe("ok");
    expect(r.db.status).toBe("ok");
  });
  it("status degraded quando db lento", () => {
    const r = buildHealthReport({ dbOk: true, dbLatencyMs: 800, uptimeS: 100, version: "abc" });
    expect(r.status).toBe("degraded");
  });
  it("status down quando db falha", () => {
    const r = buildHealthReport({ dbOk: false, dbLatencyMs: null, uptimeS: 100, version: "abc" });
    expect(r.status).toBe("down");
    expect(r.db.status).toBe("down");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/observability/health.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/observability/health.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/observability/health.ts src/lib/observability/health.test.ts
git commit -m "feat(observability): checkHealth + classificação pura (Regra 4)"
```

---

### Task 1.5: Endpoint `/api/health` (público, enxuto)

**Files:**
- Create: `src/app/api/health/route.ts`

Nota: `"api/health"` já está numa allowlist em `src/lib/with-plan-feature.ts` e o proxy permite rotas públicas — confirmar que `/api/health` não cai no guard de auth (é fora de `/dashboard` e `/api/admin`). Se cair, adicionar à lista `publicRoutes`/bypass do `src/proxy.ts`.

- [ ] **Step 1: Implementar a rota**

```ts
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
  // público: só campos seguros
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
```

- [ ] **Step 2: Verificar manualmente (dev já rodando; NÃO reiniciar à toa)**

Run: `curl -s localhost:3000/api/health | head` e `curl -s 'localhost:3000/api/health?deep=1'`
Expected: JSON `{status:"ok",uptime:...}`; com deep, inclui `db:"ok"`. Status 200.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/health/route.ts
git commit -m "feat(observability): GET /api/health público (Regra 4)"
```

---

### Task 1.6: Wrapper `withObservability`

**Files:**
- Create: `src/lib/observability/with-observability.ts`

Nota: testar wrapper de route handler com `NextRequest` é frágil; a lógica testável (percentis, metrics, request-id) já tem testes próprios. Aqui o foco é integração — validar por uso real na Task 1.8.

- [ ] **Step 1: Implementar**

```ts
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
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/observability/with-observability.ts
git commit -m "feat(observability): wrapper withObservability (Regras 1,3,7)"
```

---

### Task 1.7: Request id no `proxy.ts` (todos os caminhos de retorno)

**Files:**
- Modify: `src/proxy.ts`

Atenção (M7 da review): o proxy tem múltiplos `return` antecipados (401 de API, redirects). O `x-request-id` deve ser setado em TODOS.

- [ ] **Step 1: Ler o proxy e identificar os pontos de retorno**

Run: `grep -n "return " src/proxy.ts`

- [ ] **Step 2: Adicionar helper e aplicar**

No topo de `src/proxy.ts`, importar e criar um helper que carimba qualquer `NextResponse`:

```ts
import { readRequestId, REQUEST_ID_HEADER } from "@/lib/observability/request-context";

function withRequestId(res: NextResponse, req: NextRequest): NextResponse {
  const id = readRequestId(req.headers);
  res.headers.set(REQUEST_ID_HEADER, id);
  return res;
}
```

Em cada `return NextResponse.json(...)` / `NextResponse.redirect(...)` / `NextResponse.next(...)` do proxy, envolver com `withRequestId(<resp>, request)`. Também propagar no request que chega ao RSC: dentro de `nextWithCurrentPath`, adicionar `requestHeaders.set(REQUEST_ID_HEADER, readRequestId(request.headers))` antes do `NextResponse.next`.

- [ ] **Step 3: Verificar tipos e smoke**

Run: `npx tsc --noEmit`
Run: `curl -si localhost:3000/api/health | grep -i x-request-id` (deve aparecer o header)
Expected: header `x-request-id: req_...` presente.

- [ ] **Step 4: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(observability): propaga x-request-id em todos os caminhos do proxy (Regra 1)"
```

---

### Task 1.8: Aplicar `withObservability` nas rotas críticas

**Files:**
- Modify: rotas de `src/app/api/sales/`, `src/app/api/finance/`, `src/app/api/cash-registers/`, `src/app/api/service-orders/` (handlers POST/GET principais).

Não aplicar nas 200+ rotas — só as críticas, conforme spec. Padrão de migração por arquivo:

- [ ] **Step 1: Identificar handlers críticos**

Run: `ls src/app/api/sales/route.ts src/app/api/finance/*/route.ts src/app/api/cash-registers/route.ts 2>/dev/null`

- [ ] **Step 2: Envolver o handler exportado**

Antes:
```ts
export async function POST(req: NextRequest) { /* ... */ }
```
Depois:
```ts
import { withObservability } from "@/lib/observability/with-observability";
async function postHandler(req: NextRequest) { /* ... corpo original ... */ }
export const POST = withObservability("POST /api/sales", postHandler);
```

- [ ] **Step 3: Verificar build**

Run: `npx tsc --noEmit && npm run build`
Expected: build verde.

- [ ] **Step 4: Commit**

```bash
git add src/app/api
git commit -m "feat(observability): instrumenta rotas críticas com withObservability"
```

---

### Task 1.9: Slow-query log no Prisma (via `$use`, gated)

**Files:**
- Modify: `src/lib/prisma.ts`

Atenção (M1 da review): NÃO mexer no array `log` estático. Usar `$use` (o projeto já usa middleware). Não logar parâmetros (PII).

- [ ] **Step 1: Adicionar middleware de timing**

Em `createPrismaClient()`, após os middlewares existentes, registrar:

```ts
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 200);
const queryLogEnabled = process.env.PRISMA_QUERY_LOG === "1";

if (queryLogEnabled) {
  client.$use(async (params, next) => {
    const start = performance.now();
    const result = await next(params);
    const durationMs = performance.now() - start;
    if (durationMs >= SLOW_QUERY_MS) {
      // import dinâmico evita ciclo entre prisma.ts e metrics/logger
      const { metrics } = await import("./observability/metrics");
      const { logger } = await import("./logger");
      metrics.recordSlowQuery();
      logger.child({ module: "prisma" }).warn("slow query", {
        model: params.model,
        action: params.action,
        durationMs: Math.round(durationMs),
        // NUNCA logar params.args (PII)
      });
    }
    return result;
  });
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/prisma.ts
git commit -m "feat(observability): slow-query log via \$use gated por PRISMA_QUERY_LOG (Regra 5)"
```

---

### Task 1.10: Instrumentar caches (hit/miss)

**Files:**
- Modify: `src/lib/plan-features-cache.ts`
- Modify: `src/lib/idempotency.ts`

- [ ] **Step 1: Em `plan-features-cache.ts`, marcar hit/miss**

No `getCachedPlanFeatures`, após `const hit = cache.get(companyId);`:
```ts
import { metrics } from "./observability/metrics";
// ...
if (hit) { metrics.cacheHit(); return hit; }
metrics.cacheMiss();
```

- [ ] **Step 2: (Pular `idempotency.ts` — não é um cache in-memory.)** A review do plano confirmou: `src/lib/idempotency.ts` só exporta `canonicalize`/`hashPayload` (funções puras), não tem hit/miss. Se houver um *store* de idempotência consumindo `hashPayload` com decisão "já existe?", instrumentar lá; caso contrário, só `plan-features-cache.ts` é instrumentado nesta fase. Não inventar um ponto de hit/miss inexistente.

- [ ] **Step 3: Verificar tipos + testes existentes**

Run: `npx tsc --noEmit && npm test -- src/lib/plan-features-cache`
Expected: testes existentes do cache continuam verdes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/plan-features-cache.ts
git commit -m "feat(observability): cache hit/miss tracking no plan-features-cache (Regra 6)"
```

---

### ✅ Checagem de fim de FASE 1

- [ ] `npx tsc --noEmit` → sem erros
- [ ] `npm run build` → verde
- [ ] `npm test` → tudo verde
- [ ] Review: dispatch code-reviewer no diff da fase (`git diff <sha-início-fase>..HEAD`)
- [ ] Commit de fechamento se a review pedir ajustes

---

# FASE 2 — Persistência de tendências (flush write-on-request)

*Migration MetricSample + flush por janela. SEM cron de métricas (Hobby).*

### Task 2.1: Model `MetricSample`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Adicionar o model** (campos conforme spec §8)

```prisma
model MetricSample {
  id          String   @id @default(cuid())
  capturedAt  DateTime @default(now())
  windowMin   Int
  route       String?
  reqCount    Int      @default(0)
  errorCount  Int      @default(0)
  p50Ms       Int?
  p95Ms       Int?
  slowQueries Int      @default(0)
  cacheHits   Int      @default(0)
  cacheMisses Int      @default(0)

  @@index([capturedAt])
}
```

- [ ] **Step 2: Gerar migration**

Run: `npx prisma migrate dev --name add_metric_sample`
Expected: migration criada e aplicada; `prisma generate` roda.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(observability): model MetricSample (migration aditiva)"
```

---

### Task 2.2: Flush por janela no coletor

**Files:**
- Modify: `src/lib/observability/metrics.ts`
- Test: `src/lib/observability/metrics.test.ts` (estender)

Mecanismo (spec §5): cada instância carimba a janela atual (`Math.floor(now / WINDOW_MS)`). Quando uma request detecta que a janela virou, faz flush da janela anterior (grava `MetricSample`) e zera. O flush é injetável p/ testar sem banco.

- [ ] **Step 1: Escrever o teste do disparo de flush**

```ts
// adicionar em src/lib/observability/metrics.test.ts
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
```

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- src/lib/observability/metrics.test.ts`
Expected: FAIL (sem `_setFlushSink`, `nowMs` ignorado)

- [ ] **Step 3: Implementar janela + sink**

Alterar `metrics.ts`: adicionar `WINDOW_MS = 5*60*1000`, `currentWindow`, `flushSink`. `recordRequest` aceita `nowMs` opcional (default um relógio injetável). Ao detectar `windowOf(nowMs) !== currentWindow`, chamar `flushSink(snapshot())`, resetar `acc`, atualizar `currentWindow`. Default `flushSink` grava em `MetricSample` (import dinâmico do prisma p/ evitar ciclo; em test usa `_setFlushSink`).

```ts
const WINDOW_MS = 5 * 60 * 1000;
function windowOf(ms: number) { return Math.floor(ms / WINDOW_MS); }
let currentWindow: number | null = null;
let flushSink: (s: MetricsSnapshot) => void = defaultFlushSink;

function defaultFlushSink(s: MetricsSnapshot) {
  void (async () => {
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.metricSample.create({
        data: { windowMin: 5, reqCount: s.reqCount, errorCount: s.errorCount,
          p50Ms: s.p50Ms, p95Ms: s.p95Ms, slowQueries: s.slowQueries,
          cacheHits: s.cacheHits, cacheMisses: s.cacheMisses },
      });
    } catch { /* flush é best-effort; não propaga */ }
  })();
}
// recordRequest: aceitar nowMs?: number (default Date.now()); antes de acumular,
// se currentWindow !== null && windowOf(nowMs) !== currentWindow → flushSink(snapshot()); reset.
// _setFlushSink(fn) e _resetForTests também limpa currentWindow.
```

- [ ] **Step 4: Run → PASS**

Run: `npm test -- src/lib/observability/metrics.test.ts`
Expected: PASS (incluindo os testes antigos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/observability/metrics.ts src/lib/observability/metrics.test.ts
git commit -m "feat(observability): flush write-on-request por janela → MetricSample (§5)"
```

---

### Task 2.3: Retenção 30d num cron diário existente

**Files:**
- Modify: `src/app/api/cron/mark-delayed/route.ts`

- [ ] **Step 1: Adicionar limpeza ANTES do `return` de sucesso do handler**

Atenção (review): o handler tem um `return NextResponse.json({ ok: true ... })`. Inserir o `deleteMany` **antes** desse return — senão vira código morto. Ler o arquivo primeiro (`grep -n "return" src/app/api/cron/mark-delayed/route.ts`) e posicionar a limpeza logo antes do return de sucesso, dentro do try.

```ts
// imediatamente antes do return de sucesso (dentro do try):
const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
await prisma.metricSample.deleteMany({ where: { capturedAt: { lt: cutoff } } });
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/mark-delayed/route.ts
git commit -m "chore(observability): retenção 30d de MetricSample no cron diário"
```

---

### ✅ Checagem de fim de FASE 2
- [ ] tsc · build · test · review (mesmo ritual)

---

# FASE 3 — Motor de ações (registry de blueprints)

*Migration AdminActionLog + registry tipado + rota executora. Maior cobertura de testes (toca produção).*

### Task 3.1: Model `AdminActionLog`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Adicionar model** (spec §8; sem FK p/ Company)

```prisma
model AdminActionLog {
  id         String   @id @default(cuid())
  adminId    String
  actionId   String
  companyId  String?
  riskLevel  String
  input      Json
  result     Json
  reason     String?
  requestId  String?
  createdAt  DateTime @default(now())

  @@index([companyId])
  @@index([adminId, createdAt])
}
```

- [ ] **Step 2: Migration**

Run: `npx prisma migrate dev --name add_admin_action_log`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(admin-actions): model AdminActionLog (migration aditiva)"
```

---

### Task 3.2: Tipos do blueprint

**Files:**
- Create: `src/lib/admin-actions/types.ts`

- [ ] **Step 1: Definir interface** (spec §7)

```ts
// src/lib/admin-actions/types.ts
import { z } from "zod";
import { AdminRole } from "@prisma/client";

export type RiskLevel = "low" | "medium" | "high";

export interface ActionContext {
  adminId: string;
  adminName?: string;   // preenchido pela rota a partir da session — evita re-buscar nos logs
  adminEmail?: string;  // idem (usado em globalAudit.metadata)
  requestId?: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

export interface AdminActionBlueprint<TInput = any> {
  id: string;
  label: string;
  description: string;
  category: "client" | "system";
  icon: string;
  riskLevel: RiskLevel;
  schema: z.ZodType<TInput>;
  confirm?: { requireReason: boolean; typeToConfirm?: "companyName" };
  allowedRoles: AdminRole[];
  /** companyId-alvo extraído do input, p/ auditoria dupla (null em ações de sistema) */
  targetCompanyId?: (input: TInput) => string | null;
  execute: (ctx: ActionContext, input: TInput) => Promise<ActionResult>;
}
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin-actions/types.ts
git commit -m "feat(admin-actions): tipos do blueprint (§7)"
```

---

### Task 3.3: Validação + guarda de risco (pura, testada)

**Files:**
- Create: `src/lib/admin-actions/validate.ts`
- Test: `src/lib/admin-actions/validate.test.ts`

- [ ] **Step 1: Escrever testes**

```ts
// src/lib/admin-actions/validate.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validateActionRequest } from "./validate";
import type { AdminActionBlueprint } from "./types";

const lowBp: AdminActionBlueprint<{ days: number }> = {
  id: "extend_trial", label: "", description: "", category: "client", icon: "",
  riskLevel: "low", schema: z.object({ days: z.number().int().min(1).max(30) }),
  allowedRoles: ["SUPER_ADMIN"], execute: async () => ({ ok: true, message: "" }),
};
const highBp: AdminActionBlueprint<{}> = {
  id: "delete", label: "", description: "", category: "client", icon: "",
  riskLevel: "high", schema: z.object({}), confirm: { requireReason: true, typeToConfirm: "companyName" },
  allowedRoles: ["SUPER_ADMIN"], execute: async () => ({ ok: true, message: "" }),
};

describe("validateActionRequest", () => {
  it("rejeita role não permitida", () => {
    const r = validateActionRequest(lowBp, { role: "SUPPORT", input: { days: 5 } });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });
  it("rejeita input inválido", () => {
    const r = validateActionRequest(lowBp, { role: "SUPER_ADMIN", input: { days: 99 } });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });
  it("aceita input válido low-risk", () => {
    const r = validateActionRequest(lowBp, { role: "SUPER_ADMIN", input: { days: 5 } });
    expect(r.ok).toBe(true);
  });
  it("high-risk exige reason", () => {
    const r = validateActionRequest(highBp, { role: "SUPER_ADMIN", input: {}, companyName: "Ótica X", confirmName: "Ótica X" });
    expect(r.ok).toBe(false); // falta reason
  });
  it("high-risk exige confirmName == companyName", () => {
    const r = validateActionRequest(highBp, { role: "SUPER_ADMIN", input: {}, reason: "fraude", companyName: "Ótica X", confirmName: "errado" });
    expect(r.ok).toBe(false);
  });
  it("high-risk passa com reason + nome correto", () => {
    const r = validateActionRequest(highBp, { role: "SUPER_ADMIN", input: {}, reason: "fraude", companyName: "Ótica X", confirmName: "Ótica X" });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- src/lib/admin-actions/validate.test.ts`

- [ ] **Step 3: Implementar**

```ts
// src/lib/admin-actions/validate.ts
import { AdminRole } from "@prisma/client";
import type { AdminActionBlueprint } from "./types";

export interface ValidateInput {
  role: AdminRole;
  input: unknown;
  reason?: string;
  companyName?: string;
  confirmName?: string;
}

export type ValidateResult =
  | { ok: true; input: any }
  | { ok: false; status: 400 | 403; message: string };

export function validateActionRequest(
  bp: AdminActionBlueprint,
  req: ValidateInput,
): ValidateResult {
  if (!bp.allowedRoles.includes(req.role)) {
    return { ok: false, status: 403, message: "Sem permissão para esta ação" };
  }
  const parsed = bp.schema.safeParse(req.input);
  if (!parsed.success) {
    return { ok: false, status: 400, message: "Dados inválidos" };
  }
  if (bp.riskLevel === "high" || bp.confirm?.requireReason) {
    if (bp.confirm?.requireReason && !req.reason?.trim()) {
      return { ok: false, status: 400, message: "Motivo é obrigatório" };
    }
    if (bp.confirm?.typeToConfirm === "companyName" && req.confirmName !== req.companyName) {
      return { ok: false, status: 400, message: "Confirmação não confere" };
    }
  }
  return { ok: true, input: parsed.data };
}
```

- [ ] **Step 4: Run → PASS**

Run: `npm test -- src/lib/admin-actions/validate.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-actions/validate.ts src/lib/admin-actions/validate.test.ts
git commit -m "feat(admin-actions): validação + guarda de risco (§7,§10)"
```

---

### Task 3.4: Blueprints de cliente (migra os 8 cases; impersonate fica à parte)

**Files:**
- Create: `src/lib/admin-actions/blueprints/client.ts`
- Create: `src/lib/admin-actions/registry.ts`
- Test: `src/lib/admin-actions/registry.test.ts`
- Referência (copiar lógica de execução): `src/app/api/admin/clientes/[id]/actions/route.ts`

**ATENÇÃO (correções da review do plano — ler antes de codar):**
- São **8 blueprints** (os 8 cases). **`impersonate` NÃO entra no registry** — ele é um fluxo de token+redirect client-side (POST devolve `{token,sessionId}`, o browser abre `/impersonate?token=...`; encerrar é `DELETE /api/admin/impersonate/[id]`). Não cabe no shape `execute()→ActionResult`. Permanece como botão especial na UI (ver Fase 5), chamando o endpoint existente. **Não criar blueprint para impersonate.**
- **Auditoria TRIPLA por ação — não dropar nada.** Cada case do route atual grava DOIS logs hoje: `prisma.globalAudit.create({ actorType:"ADMIN_USER", actorId, companyId, action, metadata })` E `logActivity({ ..., actorId: admin.id, actorType: ActorType.ADMIN, actorName: admin.name })`. O `execute()` do blueprint deve **portar ambos verbatim** (o `AdminActionLog` novo é gravado pela ROTA, à parte — Task 3.5). `GlobalAudit` foi omitido na 1ª versão do plano — é o sistema de auditoria admin que já existe.
- **Portar campos de dados verbatim:** ex. `block` seta `blockedReason:"ADMIN_ACTION", blockedAt: new Date()`, não só `isBlocked:true`.
- **`extend_trial` é +7 dias FIXO, sem parâmetro `days`** — lê a subscription `status:"TRIAL"`, 400 se não houver. Não inventar `days`.
- **Invariante:** todo blueprint tem `companyId` no schema; a UI sempre injeta. `execute()` recebe `ctx: ActionContext` com `adminId` — usar para os logs.

- [ ] **Step 1: Ler a lógica COMPLETA de cada case** (é a fonte de verdade — portar verbatim, não de memória)

Run: `sed -n '26,330p' src/app/api/admin/clientes/[id]/actions/route.ts`

- [ ] **Step 2: Escrever o teste do registry** (estrutura, não execução de DB)

```ts
// src/lib/admin-actions/registry.test.ts
import { describe, it, expect } from "vitest";
import { actionRegistry, getBlueprint } from "./registry";

describe("registry", () => {
  it("contém os 8 blueprints de cliente (impersonate é tratado à parte, fora do registry)", () => {
    const ids = Object.keys(actionRegistry);
    for (const id of ["block","unblock","reactivate","extend_trial","change_plan","cancel_subscription","change_billing_cycle","delete"]) {
      expect(ids).toContain(id);
    }
    expect(ids).not.toContain("impersonate");
  });
  it("delete e cancel_subscription são SUPER_ADMIN-only", () => {
    expect(getBlueprint("delete")!.allowedRoles).toEqual(["SUPER_ADMIN"]);
    expect(getBlueprint("cancel_subscription")!.allowedRoles).toEqual(["SUPER_ADMIN"]);
  });
  it("delete tem confirm.typeToConfirm e todo blueprint tem companyId no schema", () => {
    expect(getBlueprint("delete")!.confirm?.typeToConfirm).toBe("companyName");
    // companyId obrigatório no schema de toda ação de cliente
    expect(getBlueprint("block")!.schema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run → FAIL**

- [ ] **Step 4: Implementar `client.ts`** — 8 blueprints. Dois exemplos FIÉIS ao route atual (replicar o padrão portando cada case verbatim, incluindo `globalAudit` + `logActivity` completo):

```ts
// src/lib/admin-actions/blueprints/client.ts
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/activity-log.service";
import { ActorType } from "@prisma/client";
import type { AdminActionBlueprint } from "../types";

const companyInput = z.object({ companyId: z.string().min(1) });

export const blockCompany: AdminActionBlueprint<{ companyId: string }> = {
  id: "block", label: "Bloquear empresa", description: "Bloqueia o acesso da empresa ao sistema.",
  category: "client", icon: "Ban", riskLevel: "medium",
  schema: companyInput, confirm: { requireReason: true },
  allowedRoles: ["SUPER_ADMIN", "ADMIN"],
  targetCompanyId: (i) => i.companyId,
  async execute(ctx, { companyId }) {
    await prisma.company.update({
      where: { id: companyId },
      data: { isBlocked: true, blockedReason: "ADMIN_ACTION", blockedAt: new Date() },
    });
    await prisma.globalAudit.create({
      data: { actorType: "ADMIN_USER", actorId: ctx.adminId, companyId, action: "COMPANY_BLOCKED", metadata: { adminEmail: ctx.adminEmail } },
    });
    await logActivity({ companyId, type: "COMPANY_BLOCKED", title: "Empresa bloqueada", actorId: ctx.adminId, actorType: ActorType.ADMIN, actorName: ctx.adminName });
    return { ok: true, message: "Empresa bloqueada" };
  },
};

export const extendTrial: AdminActionBlueprint<{ companyId: string }> = {
  id: "extend_trial", label: "Estender trial (+7 dias)", description: "Adiciona 7 dias ao trial.",
  category: "client", icon: "CreditCard", riskLevel: "low",
  schema: companyInput, // SEM days — é fixo +7
  allowedRoles: ["SUPER_ADMIN", "ADMIN", "SUPPORT"],
  targetCompanyId: (i) => i.companyId,
  async execute(ctx, { companyId }) {
    const sub = await prisma.subscription.findFirst({ where: { companyId, status: "TRIAL" } });
    if (!sub) return { ok: false, message: "Trial não encontrado" };
    const newEnd = new Date(sub.trialEndsAt ?? new Date());
    newEnd.setDate(newEnd.getDate() + 7);
    await prisma.subscription.update({ where: { id: sub.id }, data: { trialEndsAt: newEnd } });
    await prisma.globalAudit.create({
      data: { actorType: "ADMIN_USER", actorId: ctx.adminId, companyId, action: "TRIAL_EXTENDED", metadata: { newTrialEnd: newEnd.toISOString() } },
    });
    await logActivity({ companyId, type: "TRIAL_EXTENDED", title: `Trial estendido até ${newEnd.toLocaleDateString("pt-BR")}`, detail: { newTrialEnd: newEnd.toISOString() }, actorId: ctx.adminId, actorType: ActorType.ADMIN, actorName: ctx.adminName });
    return { ok: true, message: `Trial estendido até ${newEnd.toLocaleDateString("pt-BR")}` };
  },
};

// + unblock, reactivate, change_plan (medium, [SUPER_ADMIN,ADMIN]),
//   cancel_subscription (high, requireReason, [SUPER_ADMIN]),
//   change_billing_cycle (medium, [SUPER_ADMIN,ADMIN]),
//   delete (high, requireReason + typeToConfirm:"companyName", [SUPER_ADMIN]).
// Cada um: portar o case correspondente verbatim, mantendo globalAudit + logActivity completos.
```

Os exemplos usam `ctx.adminName`/`ctx.adminEmail` (preenchidos pela rota a partir da session — ver Task 3.2/3.5), evitando re-buscar o admin. O importante: **não perder nenhum campo dos logs** (`globalAudit.metadata`, `logActivity` actor*).

- [ ] **Step 5: Implementar `registry.ts`**

```ts
// src/lib/admin-actions/registry.ts
import type { AdminActionBlueprint } from "./types";
import * as client from "./blueprints/client";

const all: AdminActionBlueprint[] = Object.values(client);

export const actionRegistry: Record<string, AdminActionBlueprint> =
  Object.fromEntries(all.map((bp) => [bp.id, bp]));

export function getBlueprint(id: string): AdminActionBlueprint | undefined {
  return actionRegistry[id];
}
```

- [ ] **Step 6: Run → PASS**

Run: `npm test -- src/lib/admin-actions/registry.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin-actions
git commit -m "feat(admin-actions): blueprints de cliente + registry (8 ações, §7)"
```

---

### Task 3.5: Rota executora `POST /api/admin/actions/[id]`

**Files:**
- Create: `src/app/api/admin/actions/[id]/route.ts`

Nota: a rota preenche `ActionContext` com `adminName`/`adminEmail` da session (o `execute()` os usa para `globalAudit`/`logActivity` sem re-buscar). `AdminActionLog` é a 3ª escrita de auditoria, adicional ao `globalAudit`+`logActivity` que o `execute()` já fez — não substitui.

- [ ] **Step 1: Implementar** (orquestra validate → execute → AdminActionLog)

```ts
// src/app/api/admin/actions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/admin-auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { getBlueprint } from "@/lib/admin-actions/registry";
import { validateActionRequest } from "@/lib/admin-actions/validate";
import { readRequestId } from "@/lib/observability/request-context";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminAuth();
    const { id } = await ctx.params;
    const bp = getBlueprint(id);
    if (!bp) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Ação desconhecida" } }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const requestId = readRequestId(req.headers);

    // companyName p/ typeToConfirm: buscar se a ação tem empresa-alvo
    const targetCompanyId = bp.targetCompanyId?.(body.input) ?? null;
    let companyName: string | undefined;
    if (targetCompanyId) {
      const c = await prisma.company.findUnique({ where: { id: targetCompanyId }, select: { name: true } });
      companyName = c?.name;
    }

    const v = validateActionRequest(bp, {
      role: session.user.role, input: body.input,
      reason: body.reason, companyName, confirmName: body.confirmName,
    });
    if (!v.ok) return NextResponse.json({ error: { code: "VALIDATION", message: v.message } }, { status: v.status });

    const result = await bp.execute(
      { adminId: session.user.id, adminName: session.user.name, adminEmail: session.user.email, requestId },
      v.input,
    );

    // 3ª trilha: log do motor de ações (adicional ao globalAudit+logActivity do execute)
    await prisma.adminActionLog.create({
      data: {
        adminId: session.user.id, actionId: bp.id, companyId: targetCompanyId,
        riskLevel: bp.riskLevel, input: body.input ?? {}, result: result as any,
        reason: body.reason ?? null, requestId,
      },
    });
    // logActivity (timeline do cliente) já é chamado dentro de execute() quando há empresa.

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: tsc + build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/actions
git commit -m "feat(admin-actions): rota POST /api/admin/actions/[id] (validate→execute→auditoria dupla)"
```

---

### Task 3.6: Migrar a UI de `company-actions.tsx` para a rota nova

**Files:**
- Modify: `src/app/admin/clientes/[id]/company-actions.tsx`

Remover `prompt()`/`alert()`; apontar para `/api/admin/actions/[id]`. (O modal rico vem na Fase 5; aqui só trocar o endpoint/contrato, mantendo confirm nativo temporário se necessário, mas preferir já um modal simples.)

- [ ] **Step 1: Trocar as chamadas** para `POST /api/admin/actions/${actionId}` com body `{ input, reason, confirmName }`.
- [ ] **Step 2: Smoke manual** numa empresa de teste: estender trial, bloquear/desbloquear.
- [ ] **Step 3: Commit**

```bash
git add src/app/admin/clientes/[id]/company-actions.tsx
git commit -m "refactor(admin-actions): company-actions usa rota de blueprints (remove prompt/alert)"
```

---

### ✅ Checagem de fim de FASE 3
- [ ] tsc · build · test · review. **Revisar com atenção a matriz de roles** (não tirar acesso indevidamente).

---

# FASE 4 — Agregação de dados

### Task 4.1: `getSystemPulse()`

**Files:**
- Create: `src/lib/monitoring/system-pulse.ts`
- Test: `src/lib/monitoring/system-pulse.test.ts`

- [ ] **Step 1: Teste da parte pura** (montagem do pulso a partir de inputs)
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implementar** — combina `checkHealth(true)` + `metrics.snapshot()` + `process.memoryUsage()`. Extrair a montagem para função pura `buildPulse(health, snapshot, mem)` testável.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `feat(monitoring): getSystemPulse (pulso ao vivo)`

---

### Task 4.2: `getSystemTrends()`

**Files:**
- Create: `src/lib/monitoring/system-trends.ts`
- Test: `src/lib/monitoring/system-trends.test.ts`

- [ ] **Step 1: Teste da agregação pura** sobre rows de `MetricSample` (somar reqCount/errorCount de várias instâncias; média ponderada de p95).
- [ ] **Step 2..4: TDD** — `aggregateTrends(samples)` pura + leitura `prisma.metricSample.findMany({ where: { capturedAt: { gte: 24h } } })`.
- [ ] **Step 5: Commit** `feat(monitoring): getSystemTrends (agrega frota via SQL)`

---

### Task 4.3: `getClientHealthSnapshot()`

**Files:**
- Create: `src/lib/monitoring/client-health-snapshot.ts`
- Test: `src/lib/monitoring/client-health-snapshot.test.ts`
- Referência: `src/lib/health-score.ts` (NÃO recalcula — lê `Company.healthScore/healthCategory`).

- [ ] **Step 1: Teste das funções puras** — MRR em risco, contagem de inadimplência, distribuição de categorias, a partir de fixtures de empresas/subscriptions/invoices.
- [ ] **Step 2..4: TDD** — extrair `computeMrrAtRisk(subs)`, `computeOverdueSummary(invoices)`, `bucketByCategory(companies)`; a função async só junta as queries (sempre com `companyId` no filtro quando aplicável).
- [ ] **Step 5: Commit** `feat(monitoring): getClientHealthSnapshot (risco/MRR/inadimplência/engajamento)`

---

### ✅ Checagem de fim de FASE 4
- [ ] tsc · build · test · review

---

# FASE 5 — Cockpit UI

*Usar skill `frontend-design` durante a implementação (dark, alinhado ao /admin atual, hierarquia de cockpit).*

### Task 5.1: Endpoint `/api/admin/observability`

**Files:**
- Create: `src/app/api/admin/observability/route.ts`

- [ ] **Step 1: Implementar** — `requireAdminAuth()`, retorna `{ pulse, trends, clientHealth }` chamando as 3 funções da Fase 4. Erros via `handleApiError`.
- [ ] **Step 2: tsc + smoke** (`curl` com cookie admin, ou via UI na 5.2)
- [ ] **Step 3: Commit** `feat(monitoring): GET /api/admin/observability`

---

### Task 5.2: Página do cockpit (server) + nav

**Files:**
- Create: `src/app/admin/monitoramento/page.tsx`
- Modify: `src/app/admin/admin-nav.tsx` (item "Monitoramento", ícone `Gauge`/`Activity`)

Lembrete (M6): rota é `monitoramento` (PT), distinta do túnel Sentry `monitoring` no matcher do proxy — não "corrigir".

- [ ] **Step 1: Server component** — `requireAdmin()`, busca o payload (server-side) e renderiza a faixa de status + 2 colunas (Sistema | Clientes), reusando `HealthBadge`. Banner honesto "pulso = instância · tendências = agregado".
- [ ] **Step 2: Item no nav.**
- [ ] **Step 3: Verificar no browser** `/admin/monitoramento`.
- [ ] **Step 4: Commit** `feat(monitoring): página cockpit /admin/monitoramento + nav`

---

### Task 5.3: Client de polling do pulso

**Files:**
- Create: `src/app/admin/monitoramento/cockpit-client.tsx`

- [ ] **Step 1: Componente client** que faz polling do `/api/admin/observability` a cada ~10s e atualiza só os cards de pulso (não a página toda).
- [ ] **Step 2: Commit** `feat(monitoring): polling ao vivo do pulso`

---

### Task 5.4: `<ActionModal>` gerado por schema

**Files:**
- Create: `src/app/admin/monitoramento/action-modal.tsx`

- [ ] **Step 1: Implementar** — recebe um blueprint (id, label, riskLevel, confirm) + os campos do schema serializados; renderiza inputs (number→stepper, enum→select, string→texto), campo "motivo" se `requireReason`, "digite o nome" se `typeToConfirm`. **Sempre injeta `companyId` no `input`** (invariante da spec §7). Submete para `/api/admin/actions/[id]`.

Nota (erro): o `handleApiError` devolve `errorId` (não `requestId`) no envelope `{ error: { code, message, errorId } }`. O `x-request-id` vem no **header** da resposta (setado pelo wrapper/proxy). No fail, o modal mostra `error.message` + o `errorId` do corpo **e/ou** o header `x-request-id` (ler via `res.headers.get("x-request-id")`) — ambos servem para achar o log. Não prometer um `requestId` no corpo que o `handleApiError` não coloca lá.

Nota (schema→fields): o `z.ZodType` não serializa para o client. Expor no payload do endpoint admin apenas a **descrição dos campos** (`[{name, type:"number"|"enum"|"string", options?}]`) derivada do schema no server (função `describeSchema(bp)`). `companyId` é um campo oculto preenchido pela UI, não um input visível.

- [ ] **Step 2: Botão de impersonate é especial** (NÃO passa pelo ActionModal/registry): mantém o fluxo atual — chama `POST /api/admin/impersonate`, lê `{token, sessionId}`, abre `/impersonate?token=...` em nova aba. Ver §7.

- [ ] **Step 3: Ligar os botões de ação dos cards de cliente** ao modal.
- [ ] **Step 4: Smoke** — executar uma ação low-risk e uma high-risk pelo cockpit; verificar que `GlobalAudit`, `ActivityLog` e `AdminActionLog` foram todos gravados.
- [ ] **Step 5: Commit** `feat(monitoring): ActionModal gerado por schema + wiring no cockpit`

---

### ✅ Checagem de fim de FASE 5
- [ ] tsc · build · test · review + revisão visual (skill frontend-design / design-review)

---

# FASE 6 — Alertas + deploy guard

### Task 6.1: Regras de alerta (config + avaliação pura)

**Files:**
- Create: `src/lib/monitoring/alert-rules.ts`
- Test: `src/lib/monitoring/alert-rules.test.ts`

- [ ] **Step 1: Teste** — `evaluateAlerts(snapshot, rules)` retorna as regras disparadas (ex.: taxa de erro > 5%, p95 > 2000ms, db down).
- [ ] **Step 2..4: TDD** — regras como array de objetos `{ id, metric, operator, threshold, message }`; avaliação pura.
- [ ] **Step 5:** disparo via `captureMessage` do Sentry, chamado no endpoint `/api/admin/observability` (ou cron diário) quando há regra disparada.
- [ ] **Step 6: Commit** `feat(monitoring): alertas configuráveis (Regra 9)`

---

### Task 6.2: Smoke pós-deploy + runbook de rollback

**Files:**
- Create: `scripts/post-deploy-smoke.ts`
- Create: `docs/runbooks/rollback.md`

- [ ] **Step 1: Script** `post-deploy-smoke.ts` — bate em `/api/health?deep=1` + 2-3 rotas-chave; exit 1 se 5xx/db down. Rodar manualmente após `vercel deploy --prod`.
- [ ] **Step 2: Runbook** — documenta `vercel rollback` (instant rollback do deployment anterior), quando usar, e o caminho de upgrade p/ Rolling Releases (rollback automático real é Pro+).
- [ ] **Step 3: Commit** `chore(deploy): smoke pós-deploy + runbook de rollback (Regra 10)`

---

### ✅ Checagem de fim de FASE 6
- [ ] tsc · build · test · review

---

## Encerramento

- [ ] Rodar `npm test` completo + `npm run build` final.
- [ ] Atualizar a memória do projeto (MEMORY.md) com o que foi entregue e pendências.
- [ ] Deploy manual: `vercel deploy --prod` (stash de mudanças não-relacionadas antes — o CLI envia a working tree, não o commit) e rodar `scripts/post-deploy-smoke.ts`.

## Não-objetivos (lembrete)
Métrica por-request; cron sub-diário; UI editável de alertas; rollback automático por canary; refatorar `health-score.ts`. (Ver spec §12.)
