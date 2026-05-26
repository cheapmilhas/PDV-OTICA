# Agent 3 — Backend Code Quality + API Design + Services Layer Audit

**Date**: 2026-05-26
**Auditor**: Agent 3 (Backend Quality)
**Scope**: `src/app/api/**`, `src/services/**`, `src/lib/` cross-cutting concerns
**Stack**: Next.js 14 App Router, Prisma ORM, PostgreSQL (Neon), TypeScript, NextAuth

---

## Executive Summary — Top 5 Findings

1. **In-memory rate limiter resets on every Vercel cold start** — provides zero protection in production serverless environment; critical financial endpoints like `POST /api/quotes`, `POST /api/accounts-receivable/receive-multiple` have NO rate limiting at all.
2. **Cashback race condition: balance check outside transaction, debit inside** — two concurrent sale requests for the same customer can both pass the pre-flight `findUnique` balance check at line 254 of `sale.service.ts`, then both commit the debit inside the transaction, resulting in a negative cashback balance.
3. **Sequential `create` calls inside `$transaction` loops for SaleItems, AccountReceivables, CardReceivables** — `applyPaymentsInTx` uses `for...of` + `await tx.create()` for installments (up to 12 iterations), adding N sequential round-trips inside an already-30-second-budgeted transaction.
4. **`logger` module created but almost entirely unused** — `src/lib/logger.ts` exists and is imported by exactly 1 file (`sale.service.ts`); 77 other `console.error`/`console.warn` calls in services and 67 in API routes bypass structured logging. No Sentry SDK is installed; structured log correlation is aspirational.
5. **`/api/cash/debug` route is guarded by `NODE_ENV !== "development"` only, but the front-end page `/dashboard/diagnostico-caixa/page.tsx` calls it and exposes internal cash register data** — this page has no explicit route-based guard that would remove it from production navigation.

---

## Findings by Severity

---

### CRITICAL

**None confirmed** (no hardcoded secrets, no SQL injection, no auth bypass in core paths).

---

### HIGH

---

**[HIGH-1] Cashback Race Condition: Balance Check Outside Transaction**

File: `src/services/sale.service.ts:253-268`

```typescript
// OUTSIDE the $transaction (line 449):
const cashback = await prisma.customerCashback.findUnique({ ... });
if (!cashback || Number(cashback.balance) < cashbackUsed) {
  throw new AppError(...);          // ← check happens here
}
// ... 200 lines later ...
// INSIDE the $transaction:
await applyCashbackUsageInTx(tx, { cashbackUsed, ... });  // ← debit happens here
```

**Issue**: The balance validation at line 254 reads `CustomerCashback.balance` with an uncommitted read. Two concurrent POST requests for the same customer and branch will both pass the validation check, then both proceed to `applyCashbackUsageInTx` which does `{ decrement: cashbackUsed }` without a `WHERE balance >= cashbackUsed` guard. The balance can go negative.

**Fix**: Move the balance check inside the transaction using an atomic conditional update:

```typescript
// Inside $transaction — atomic check-and-debit:
const result = await tx.$executeRaw`
  UPDATE "CustomerCashback"
  SET balance = balance - ${cashbackUsed}, "totalUsed" = "totalUsed" + ${cashbackUsed}
  WHERE "customerId" = ${customerId} AND "branchId" = ${branchId}
    AND balance >= ${cashbackUsed}
`;
if (result === 0) throw new AppError(ERROR_CODES.VALIDATION_ERROR, "Saldo insuficiente", 400);
```

**Effort**: 2h | **Impact**: Financial integrity — customers can overdraw cashback balance.

---

**[HIGH-2] In-Memory Rate Limiter Provides No Protection in Serverless Production**

File: `src/lib/rate-limit.ts:1-7`

```typescript
// Resets on every cold start — no shared state between Vercel instances
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
```

The comment in the file itself acknowledges this: "Para Vercel serverless, cada cold start reseta o Map". Because Vercel runs many concurrent Lambda instances, each with its own memory, the rate limiter only counts within a single function invocation container. A burst attacker with 20 concurrent clients will distribute requests across 20 containers and never be blocked.

Additionally, the following high-value endpoints have **no rate limiting at all**:
- `POST /api/quotes` (create quote)
- `POST /api/accounts-receivable/receive-multiple` (bulk payment receipt)
- `POST /api/data-management/delete` (bulk data deletion — ADMIN only, but still)
- `POST /api/service-orders` (create OS)

**Fix**: Replace the in-memory map with a Redis-backed or Upstash rate limiter. If Redis is not available short-term, add `@vercel/kv` or use the Vercel Edge rate limiting pattern. At minimum, add rate limiting to the quote and bulk-receive endpoints.

**Effort**: 4h (Upstash `@upstash/ratelimit`) | **Impact**: Spam/abuse prevention on financial write operations.

---

**[HIGH-3] Sequential DB `create` Calls Inside Transaction Loop for Installments**

File: `src/services/sale-side-effects.service.ts:154-310`

```typescript
for (const payment of payments) {
  const salePayment = await tx.salePayment.create({ ... });      // sequential
  // ...
  for (const inst of installments) {
    await tx.accountReceivable.create({ ... });                  // N sequential
  }
  for (let i = 1; i <= numInstallments; i++) {
    await tx.cardReceivable.create({ ... });                     // M sequential
  }
}
```

A 12-installment STORE_CREDIT sale creates 12 AccountReceivable rows sequentially inside the transaction. Combined with stock debit, commission, finance entries, and CashMovement, this is 20-35 sequential DB round-trips inside a single 30s-budgeted transaction over Neon (US-East → São Paulo latency ~120ms each = 2.4-4.2 seconds just for installments). Under concurrent load this compounds.

**Fix**: Replace sequential creates with `createMany` where order does not matter:

```typescript
await tx.accountReceivable.createMany({
  data: installments.map(inst => ({ companyId, customerId, saleId, ... })),
});
await tx.cardReceivable.createMany({
  data: Array.from({ length: numInstallments }, (_, i) => ({ ... })),
});
```

**Effort**: 3h | **Impact**: Transaction latency reduction; reduces P2028 timeout risk.

---

**[HIGH-4] `logger` Module Created but Effectively Unused — 77 Unstructured `console.error` Calls in Production Paths**

File: `src/lib/logger.ts` (adopted by 1 file only: `sale.service.ts`)

The codebase has a well-designed structured logger with JSON output in production, `child()` contexts, and log level filtering. It is imported by exactly **1** service file. The remaining 77 `console.error` and 10 `console.warn` calls in services, and 67 in API routes, emit unstructured text that cannot be easily queried, correlated, or forwarded to Sentry/Datadog.

Examples of missed structured logging:
- `src/services/sale.service.ts:416,419` — uses raw `console.error` for cashback reversal failures
- `src/app/api/goals/sellers-ranking/route.ts:91` — catches errors and logs to `console.error` then returns a 500 with no structured context
- `src/app/api/webhooks/asaas/route.ts:221` — unstructured `console.error("[ASAAS_WEBHOOK] erro ao processar", ...)`

**Fix**: Replace all `console.error`/`console.warn` in service and API route files with `logger.error()`/`logger.warn()` calls, passing context objects (saleId, companyId, etc.).

**Effort**: 4h (mechanical replacement, can be partially scripted) | **Impact**: Observability, incident response speed.

---

**[HIGH-5] `goals/sellers-ranking` and `goals/monthly-summary` Bypass `handleApiError` — Inconsistent Error Response Shape**

File: `src/app/api/goals/sellers-ranking/route.ts:89-95`

```typescript
  } catch (error) {
    console.error("Erro ao buscar ranking de vendedores:", error);
    return NextResponse.json(
      { error: "Erro ao buscar ranking de vendedores" },  // ← plain string, not ErrorResponse shape
      { status: 500 }
    );
  }
```

These two routes do not use `handleApiError` and return `{ error: "string" }` instead of the documented `{ error: { code, message } }` envelope. Any frontend code that tries to read `error.code` or `error.message` from these endpoints will receive `undefined`.

**Fix**:
```typescript
} catch (error) {
  return handleApiError(error);  // consistent shape
}
```

**Effort**: 15min | **Impact**: Frontend error handling consistency.

---

### MEDIUM

---

**[MED-1] Upsert Anti-Pattern: Sentinel String `"____new____"` as Fake UUID**

File: `src/app/api/billing/checkout/route.ts:149-150`

```typescript
const subscription = await prisma.subscription.upsert({
  where: { id: existingSub?.id ?? "____new____" },  // ← magic sentinel
```

This abuses Prisma's `upsert` by using a fabricated non-existent ID as the `where` condition, forcing it into the `create` branch. If the Prisma schema's `id` field ever has a validation constraint that rejects non-UUID strings, this will fail. It also reads as a bug to maintainers.

**Fix**: Use explicit branching:
```typescript
const subscription = existingSub
  ? await prisma.subscription.update({ where: { id: existingSub.id }, data: { ... } })
  : await prisma.subscription.create({ data: { companyId, planId, ... } });
```

**Effort**: 30min | **Impact**: Code clarity, prevents future schema constraint failures.

---

**[MED-2] `SaleService.getByCustomer()` Has No Pagination or LIMIT**

File: `src/services/sale.service.ts:913-943`

```typescript
async getByCustomer(customerId: string, companyId: string) {
  const sales = await prisma.sale.findMany({
    where: { customerId, companyId, status: { notIn: ["CANCELED", "REFUNDED"] } },
    include: { items: { ... }, payments: { ... } },
    orderBy: { createdAt: "desc" },
    // ← no take:, no pagination
  });
  return sales;
}
```

A customer with 5 years of purchase history could have hundreds of sales. This returns all of them with full `items` and `payments` includes, potentially serializing megabytes.

**Fix**: Add `take: 50` and expose pagination, or limit to recent records with a date filter by default. The endpoint calling this should also pass a `limit` param.

**Effort**: 30min | **Impact**: Memory, response latency, Vercel response size limits.

---

**[MED-3] `applyFinanceEntriesInTx` Runs Inside 30-Second Transaction But Is Allowed to Silently Fail**

File: `src/services/sale-side-effects.service.ts:419-443`

```typescript
export async function applyFinanceEntriesInTx(tx: Tx, ...) {
  try {
    const { generateSaleEntries } = await import("@/services/finance-entry.service");
    await generateSaleEntries(tx, saleId, companyId);   // 6-12 sequential queries
  } catch (financeError) {
    console.error(JSON.stringify({ ... }));
    // NÃO throw — comportamento documentado
  }
}
```

The rationale is correct (finance entries should not block the sale), but the implementation has two issues:
1. The finance entries run **inside** the transaction. If they fail, the transaction still commits (because the error is swallowed), but finance data is silently incomplete.
2. A timeout inside `generateSaleEntries` (which the comment says can happen under Neon latency) causes the entire 30-second transaction budget to be consumed before failing silently.

**Fix**: Move `applyFinanceEntriesInTx` to `applyPostCommitSideEffects` so it runs after the transaction commits. This also removes the motivation for the 30-second transaction timeout. The function already catches and logs errors, so the fire-and-forget pattern is preserved.

**Effort**: 2h (test carefully — ordering matters) | **Impact**: Transaction reliability, eliminates P2028 risk from finance entries.

---

**[MED-4] `data-management/delete/route.ts` Uses Raw Prisma Inside Transaction Without Defensive `try/catch` Per Category**

File: `src/app/api/data-management/delete/route.ts:54-323`

The entire multi-category bulk deletion runs inside a single `$transaction` with a 2-minute timeout. If the FK order is wrong for any combination of categories (e.g., deleting `products` when `serviceOrders` still reference them), the entire operation fails and rolls back with no partial progress.

Additionally, the function body inside the transaction contains 20+ nested `if` blocks and 50+ sequential DB calls, making the 337-line route handler the longest API file in the project and violating the 800-line-file guideline.

**Fix**: Extract each category deletion into its own named function (e.g., `deleteSalesForCompany(tx, companyId)`). Consider breaking into a dedicated service.

**Effort**: 3h | **Impact**: Maintainability, reduced rollback risk.

---

**[MED-5] `goals/sellers-ranking` Performs N+1 Pattern: `groupBy` then `findMany` for User Names**

File: `src/app/api/goals/sellers-ranking/route.ts:30-52`

```typescript
const salesByUser = await prisma.sale.groupBy({ by: ['sellerUserId'], ... });
const userIds = salesByUser.map(s => s.sellerUserId);
const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
// Then: users.find(u => u.id === sale.sellerUserId) in a loop
```

This is a 2-query pattern (not true N+1), but the in-memory join (`users.find(...)`) runs in a `map`, which is O(n*m). For companies with many sellers it degrades.

**Fix**: Use a single `prisma.sale.findMany` with `include: { sellerUser: { select: ... } }` and `groupBy` aggregation on the application side, or use a `$queryRaw` with a JOIN. Alternatively, the current 2-query pattern is acceptable if a `Map` lookup is used instead of `.find()`.

```typescript
const userMap = new Map(users.map(u => [u.id, u]));
// then: userMap.get(sale.sellerUserId) — O(1)
```

**Effort**: 30min | **Impact**: Performance at scale.

---

**[MED-6] `cash/debug` Route Is Reachable from the Production Dashboard**

File: `src/app/api/cash/debug/route.ts:11` and `src/app/(dashboard)/dashboard/diagnostico-caixa/page.tsx:65`

```typescript
// route.ts — only guards by NODE_ENV:
if (process.env.NODE_ENV !== "development") {
  return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });
}
```

The API route is correctly blocked in production. However, the dashboard page at `/dashboard/diagnostico-caixa/page.tsx` still exists in the production build and calls `fetch("/api/cash/debug")`. The page shows "Erro 404" to the user but is still reachable via direct URL. If `NODE_ENV` is ever misconfigured (e.g., during a build step), internal cash register data would be exposed.

The page renders shift IDs, movement amounts, payment method breakdowns, and companyId — operational data that should not be in a production UI.

**Fix**: Either remove the page and route entirely from production, or gate the page with a feature flag checked against an environment variable (`NEXT_PUBLIC_DEBUG_ENABLED`).

**Effort**: 30min | **Impact**: Defense in depth; reduces attack surface.

---

**[MED-7] Admin Routes in `src/app/api/admin/` Use a Different Auth Mechanism Without `handleApiError`**

Files: `src/app/api/admin/tickets/route.ts`, `src/app/api/admin/plans/route.ts`, `src/app/api/admin/company-users/route.ts`, etc.

These routes use `getAdminSession()` (a separate admin session system) and manually return `{ error: "string" }` responses without calling `handleApiError`. This creates two error schemas in the same application.

Additionally, `src/app/api/admin/seed/route.ts:199-200` catches errors and logs + returns `{ error: "Erro ao executar seed" }` without the standardized error envelope, breaking any admin dashboard that reads `error.code`.

**Fix**: Wrap admin route error handling in `handleApiError`, or create a parallel `handleAdminApiError` that uses the same `ErrorResponse` shape.

**Effort**: 2h | **Impact**: API consistency, frontend error handling.

---

### LOW

---

**[LOW-1] `product-campaign.service.ts` at 1,135 Lines Exceeds the 800-Line Limit**

File: `src/services/product-campaign.service.ts` (1,135 lines)

Violates the project's 800-line file maximum. The service mixes campaign CRUD, bonus calculation logic, tier evaluation, and campaign progress tracking.

**Fix**: Extract `calculateTieredBonus` and related tier helpers into `src/services/campaign-bonus.service.ts`.

**Effort**: 2h | **Impact**: Maintainability.

---

**[LOW-2] `sale.service.ts` at 1,022 Lines Exceeds the 800-Line Limit**

File: `src/services/sale.service.ts` (1,022 lines)

The `cancel()` method alone is 200 lines and handles 9 separate concerns (status update, stock reversal, card receivables, payment voiding, cash movements, AR cancellation, commission cancellation, finance entry deletion, account balance reversal). This makes it difficult to test in isolation.

**Fix**: Extract cancellation logic into a dedicated `SaleCancellationService` or at minimum into a private `cancelPaymentsInTx(tx, sale)` helper.

**Effort**: 3h | **Impact**: Testability, maintainability.

---

**[LOW-3] Hardcoded `cashbackBalance: 0` in CRM Message Template**

File: `src/app/api/crm/templates/[segment]/message/route.ts:87`

```typescript
cashbackBalance: 0, // TODO: buscar cashback real
```

CRM messages sent to customers include a hardcoded `cashbackBalance: 0`, meaning personalized messages will always say the customer has R$ 0.00 in cashback regardless of their actual balance. This is a data quality bug affecting customer-facing communications.

**Fix**: Query `CustomerCashback.balance` for the customer and branch before rendering the template. The `crm.service.ts` already has the infrastructure to do this (line 63 notes the same TODO).

**Effort**: 1h | **Impact**: Customer-facing data accuracy.

---

**[LOW-4] `as any` Used 20+ Times Across Service Layer**

Notable occurrences:
- `src/services/sale.service.ts:698,876` — `type faType as any`, `payment.method as any`
- `src/services/product.service.ts:287,355` — `data as any` to bypass type checking on product input
- `src/services/reports.service.ts:643,775,781` — accessing untyped Prisma relation fields

These `as any` casts suppress TypeScript's type checking and can hide real type mismatches. Most occur at Prisma enum boundaries where the correct fix is to define a mapped type or use a validated string literal union.

**Effort**: 2h | **Impact**: Type safety.

---

**[LOW-5] `service-order.service.ts:22` Uses `any` for Transaction Parameter**

File: `src/services/service-order.service.ts:22`

```typescript
private async getNextNumber(companyId: string, tx: any): Promise<number> {
```

The `tx` parameter should be typed as `Prisma.TransactionClient`. The correct type is already imported and used correctly in `sale-side-effects.service.ts` as `export type Tx = Prisma.TransactionClient`.

**Fix**: `private async getNextNumber(companyId: string, tx: Prisma.TransactionClient): Promise<number>`

**Effort**: 5min | **Impact**: Type safety.

---

**[LOW-6] Rate Limiter Missing on High-Frequency Financial POST Endpoints**

Endpoints with no rate limiting:
- `POST /api/quotes` (create quote — can trigger stock checks + commission)
- `POST /api/accounts-receivable/receive-multiple` (batch payment processing)
- `POST /api/service-orders` (creates OS with stock reservation)

Only 5 routes in the entire codebase apply `rateLimitResponse`. While the rate limiter itself is unreliable in serverless (see HIGH-2), the pattern should be applied consistently pending the fix.

**Effort**: 30min (adding the calls once a proper rate limiter is in place) | **Impact**: Abuse prevention.

---

## Pattern Violations vs. Documented Conventions

| Convention | Expected | Actual | Severity |
|---|---|---|---|
| Error handling | All routes use `handleApiError` | `goals/sellers-ranking`, `goals/monthly-summary`, all admin routes bypass it | HIGH |
| Response shape | `{ error: { code, message } }` | Admin routes return `{ error: "string" }`; goals routes return `{ error: "string" }` | HIGH |
| Structured logging | Use `logger` from `src/lib/logger.ts` | Only `sale.service.ts` uses it; 77 raw `console.error` calls elsewhere | HIGH |
| File size max 800 lines | 800 lines per file | `product-campaign.service.ts` 1,135; `sale.service.ts` 1,022; `quote.service.ts` 929 | LOW |
| No `any` types | Avoid `any` in app code | 47 `: any` usages in services | LOW |
| Immutable patterns | No mutation | Not violated in services — spread/Prisma operations are used | OK |

---

## Confirmed Good Practices

- **Next.js 15 params**: All sampled dynamic route handlers correctly type `params` as `Promise<{...}>` and `await params`.
- **Multi-tenancy discipline**: Every service method and API route passes `companyId` from session into all Prisma queries. No tenant cross-contamination pattern found.
- **Atomic stock debit**: `atomicStockDebit` uses `UPDATE WHERE quantity >= requested` — race-safe for stock.
- **Idempotency in webhook**: `BillingEvent.externalEventId` unique constraint correctly prevents duplicate webhook processing.
- **Webhook token verification**: `asaas.verifyWebhookToken()` uses constant-time comparison to prevent timing attacks.
- **Transaction isolation**: Critical sale flow uses `prisma.$transaction` with explicit timeout + maxWait.
- **Zod validation**: All main API routes parse body/query with Zod schemas before processing.
- **Branch ownership validation**: `validateBranchOwnership()` called on sale create to prevent cross-tenant branch injection.
- **Pagination**: List endpoints in services use `getPaginationParams` with `pageSize` defaults — the only missing case is `getByCustomer`.
- **Idempotent finance entries**: `generateSaleEntries` uses `upsert` patterns to avoid duplicate DRE entries.
- **`getNextSequence` for OS numbers**: Counter-based sequential numbering is atomic and race-safe.

---

## Architectural Improvements

### 1. Move Finance Entries Out of the Sale Transaction (Priority: HIGH)

`applyFinanceEntriesInTx` currently runs inside the 30-second `$transaction`, contributing 6-12 sequential queries. Moving it to `applyPostCommitSideEffects` (already existing) removes the largest contributor to transaction timeouts without any data integrity risk (finance entries are advisory/DRE data, not operational).

### 2. Replace In-Memory Rate Limiter with Redis/Upstash

For a SaaS on Vercel, use `@upstash/ratelimit` with a Redis backend. This takes ~2 hours and requires one environment variable (`UPSTASH_REDIS_REST_URL`). The current implementation provides a false sense of security.

### 3. Adopt `logger` Consistently Across All Services

A one-time mechanical migration from `console.error(...)` to `logger.error(...)` across all 44 service files would enable production log correlation, Sentry integration, and structured search in Vercel Logs. The logger is already well-designed for this purpose.

### 4. Extract `cancel()` in `SaleService` Into a Dedicated Helper

The cancel flow handles: status update, stock reversal, card receivables deletion, payment voiding, cash movement creation, AR cancellation, commission cancellation, finance entry deletion, and account balance reversal. Each concern should be a named private method or extracted helper for testability.

### 5. Standardize Admin API Error Shape

Admin routes under `/api/admin/` use manual `{ error: "string" }` patterns. Wrapping them with `handleApiError` would unify the error contract across all 120+ API routes.

---

## Quick Wins (< 30 minutes each)

| # | Fix | File | Effort |
|---|---|---|---|
| 1 | Replace `"____new____"` sentinel with explicit create/update | `api/billing/checkout/route.ts:150` | 10min |
| 2 | Add `take: 50` to `getByCustomer()` | `services/sale.service.ts:914` | 5min |
| 3 | Fix `goals/sellers-ranking` error handler to use `handleApiError` | `api/goals/sellers-ranking/route.ts:89` | 5min |
| 4 | Fix `goals/monthly-summary` error handler to use `handleApiError` | `api/goals/monthly-summary/route.ts` | 5min |
| 5 | Type `tx` as `Prisma.TransactionClient` in `service-order.service.ts:22` | `services/service-order.service.ts:22` | 5min |
| 6 | Fix `cashbackBalance: 0` — query real balance | `api/crm/templates/[segment]/message/route.ts:87` | 20min |
| 7 | Remove or gate `/dashboard/diagnostico-caixa` page in production | `app/(dashboard)/dashboard/diagnostico-caixa/page.tsx` | 15min |
| 8 | Replace `as any` in `getNextNumber(tx: any)` | `services/service-order.service.ts:22` | 5min |

---

## Summary Table

| Severity | Count | Items |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 5 | Cashback race condition, serverless rate limiter, sequential creates in tx loop, unused logger, inconsistent error shape in goals |
| MEDIUM | 7 | Upsert sentinel, unbounded customer sales query, finance entries inside tx, bulk delete monster function, N+1 in rankings, debug page in production, admin error shape |
| LOW | 6 | File size violations (3), as any abuse, missing rate limiting coverage, hardcoded cashback zero |

**Verdict: WARNING** — No CRITICAL security issues found. HIGH-1 (cashback race condition) and HIGH-2 (ineffective rate limiter) should be resolved before next major release. HIGH-3 (sequential creates) should be addressed before Black Friday or peak periods.

