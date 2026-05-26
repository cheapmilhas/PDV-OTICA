# Agent 2 — Database / Prisma / Performance / Integrity Audit
**Date:** 2026-05-26
**Scope:** prisma/schema.prisma, src/services/**, src/app/api/**, prisma/migrations/**
**Reviewer:** Agent 2 (Database)

---

## Executive Summary (Top 5)

1. **CRITICAL — Audit middleware bypasses `prisma.$transaction` and uses unreliable `result?.companyId` lookup**
   `src/lib/prisma-audit-middleware.ts:38-83`. The Prisma middleware (`$use`) does **not** fire for queries executed inside `client.$extends` (which is what `prisma-tenant.ts` produces) and behaves inconsistently for nested writes. Worse, it tries to fetch `oldData` with `findUnique({ where: params.args.where })` — but `params.args.where` for `updateMany`/`deleteMany`/`upsert` is **not a unique selector** and silently returns null. Result: audit log has gaps for most critical writes (Sale cancel, refund, etc.), and the “companyId not found → skip” path will silently drop audit entries when payload lacks `companyId`. This is a compliance and forensics hole.

2. **CRITICAL — N+1 query inside `prisma.$transaction` on every sale creation**
   `src/services/sale.service.ts:282-308` (`for (item of items) await prisma.product.findUnique`) runs **before** the transaction (pre-validation), then `src/services/sale.service.ts:472-486` and `src/services/finance-entry.service.ts:291-345` run **another loop** inside the tx. For a sale with N items, this is `3·N` round-trips serialized inside a 30s tx. Under Neon’s ~50–150 ms cold latency, a 10-item sale already burns 4–5 s of round-trips and is the proximate cause of the documented `P2028` timeouts that forced the `timeout: 30_000` band-aid (`sale.service.ts:529-531`).

3. **HIGH — `prisma-tenant.ts` is DEAD CODE / not registered anywhere**
   The defensive multi-tenant Prisma Extension at `src/lib/prisma-tenant.ts` is never imported. The exported `prisma` from `src/lib/prisma.ts` is the **un-extended** client. Multi-tenant scoping relies entirely on developer discipline (`where: { id, companyId }`). I found ≥ 6 places that update by `id` only after an explicit ownership check — acceptable defense-in-depth, but **single bug** in a helper bypassing the check leaks a tenant row. The tenant extension exists, looks correct, but is not wired.

4. **HIGH — Dead `deletedAt` columns + soft-delete helper that nobody calls**
   Schema has `deletedAt` on `Customer`, `Product`, `Sale`, `ServiceOrder`, `Quote`, `ProductCampaign` (6 models, lines 389/648/826/994/1069/2446 of schema). The helper `src/lib/soft-delete.ts` has zero importers. All services soft-delete via `active=false` instead. Risk: future devs will add `where: { deletedAt: null }` to a few queries, creating inconsistent visibility (a deleted-by-active record will reappear). Either remove the columns or finish the migration.

5. **HIGH — Missing indexes on hot foreign keys + finance reports scan the whole `FinanceEntry` table**
   Several FKs are unindexed (see Schema Audit §1 below). The dashboard `/api/dashboard/metrics` runs **15 sequential** aggregations (not parallelized) — average response includes >10 round-trips. `/api/reports/branch-comparison` issues **5 queries per branch** in a `branches.map` — for a 10-branch network, 50 queries instead of 5 `groupBy`. The DRE report `getDynamicDRE` is correct but lacks an index on `FinanceEntry(companyId, entryDate, type, side)` to support the `groupBy(by: [type, side])`.

---

## Findings by Severity

### CRITICAL

#### C-1 — Audit middleware is unreliable
**File:** `src/lib/prisma-audit-middleware.ts:27-83`
**Symptom:** `AuditLog` rows are silently dropped for most update/delete paths (especially `updateMany`, `upsert`, nested writes, raw SQL).

**Why broken:**
- Line 38: `if ((action === "update" || action === "delete") && params.args?.where?.id)` — only fires for **unique-by-id** queries. All `updateMany`/`deleteMany` writes (≥ 30 in the codebase, e.g. `sale.service.ts:617,650,738`) are not audited.
- Line 41: `oldData = await modelClient?.findUnique({ where: params.args.where })` — `params.args.where` is the user-provided filter, which for non-unique queries throws inside `findUnique`. The `try/catch` swallows it ⇒ `oldData = null`.
- Line 51: `Promise.resolve().then(...)` — fire-and-forget after `next(params)`. On serverless (Vercel), the function may terminate before the audit write commits. **In serverless edge runtime audit writes can be lost.**
- Line 65: `if (!companyId) return;` — for any payload lacking `companyId` in `data`/`oldData`, the log is silently skipped. Examples: `SalePayment.update`, `CashMovement.create` (no companyId field in schema).
- **Doesn’t capture userId** (documented limitation line 24) — every audit log has `userId: null`.

**Fix:**
```ts
// 1. Stop using $use() — use $extends({ query: { ... }}) so it interoperates
//    with prisma-tenant.ts.
// 2. For non-unique writes, capture oldData via tx.findMany(args.where) BEFORE
//    the write, store the IDs, then write audit records per-id after the write.
// 3. Use AsyncLocalStorage to thread userId from the request context (Node
//    runtime). For Edge runtime, pass userId explicitly via Prisma extension args.
// 4. Make audit synchronous inside the same $transaction as the mutation; the
//    fire-and-forget pattern is too lossy.
```

**Impact:** Compliance (LGPD trail), forensics, undo features. Effort: **L (2–3 days)**.

---

#### C-2 — N+1 product fetches in `sale.service.create` (×3) and inside the transaction
**File:** `src/services/sale.service.ts`
**Lines:** 282–308 (validation), 465–469 (cost fetch — already batched, good), 472–486 (item creation — sequential).
**Also:** `applyStockDebitInTx` at `src/services/sale-side-effects.service.ts:84-115` debits **one product at a time**, sequentially.
**Also:** `generateSaleEntries` at `src/services/finance-entry.service.ts:291-345` upserts CMV per item, sequentially.

**Current pattern (simplified):**
```ts
for (const item of items) {
  const product = await prisma.product.findUnique({ where: { id: item.productId } });  // line 283
  // ... validation
}
// later, inside tx:
for (const item of items) {
  await tx.saleItem.create({ ... });                                                    // line 475
}
// later, applyStockDebitInTx:
for (const item of items) {
  await atomicStockDebit(item.productId, ...);                                          // ×4 SQL each
  await tx.stockMovement.create({...});
}
// later, generateSaleEntries:
for (const item of sale.items) {
  await consumeInventoryFIFO(...);
  await tx.financeEntry.upsert({...});                                                  // CMV per item
}
```

**Total round-trips for a 10-item sale:** ~80–100 sequential SQL calls inside a 30 s transaction.

**Fix:**
1. **Pre-fetch all products in one query** (already done at line 465 — extend to validation):
   ```ts
   const products = await prisma.product.findMany({
     where: { id: { in: productIds }, companyId },
     select: { id: true, name: true, stockQty: true, stockControlled: true },
   });
   const byId = new Map(products.map(p => [p.id, p]));
   for (const item of items) {
     const product = byId.get(item.productId);
     if (!product) throw notFoundError(...);
     // ...
   }
   ```
2. **Batch `saleItem.createMany`** instead of loop (when `costPrice` per row is OK as bulk insert).
3. **Single `UPDATE … WHERE id IN (...)` for stock** — but lose atomic per-row check; alternative is one `executeRawUnsafe` with CASE WHEN, or accept current pattern but use Promise.all (race-safe because each `updateMany` has its own `quantity >= qty` guard).
4. **Batch `stockMovement.createMany`** (currently one per item).
5. **FinanceEntry per item is harder to batch** because of the `upsert` on composite unique; consider deferring to a queue if not strictly transactional.

**Impact:** PDV checkout latency. Current: 3–8 s for a 10-item sale on Neon. After fix: ~500 ms. Effort: **M (1 day)**.

---

#### C-3 — `prisma-tenant.ts` is never imported (defense-in-depth disabled)
**File:** `src/lib/prisma-tenant.ts` (whole file)
**Verification:** `grep -rn "createTenantPrismaClient\|TenantPrismaClient\|from .*prisma-tenant" src/` returns 0 hits outside the file itself.

The `createTenantPrismaClient` Extension exists with a `TENANT_TABLES` allowlist (line 7) and correct write/read scoping (lines 40-89). It is **not** registered in `src/lib/prisma.ts` (only `registerAuditMiddleware` is). All services use the bare `prisma` import.

**Risks:**
- Any new endpoint that forgets `where: { companyId }` ⇒ tenant data leak.
- The `prisma-tenant.ts` allowlist excludes important tables: **`SalePayment`** (no companyId field, but reachable via `saleId`), **`SaleItem`**, **`StockMovement`** (lower-case `stockmovement` IS in list — fine), **`FinanceEntry`** (not in list — needs adding), **`FinanceAccount`** (missing), **`CardReceivable`** (missing).

**Fix options:**
A. **Wire it up properly.** Replace `prisma` import in services with a per-request `getTenantPrisma(companyId)` factory and update `TENANT_TABLES` to include everything with a `companyId` column. This is invasive (touch ~30 services).
B. **Drop the file** and rely on explicit checks + add a `eslint-plugin-prisma`-style lint rule that flags missing `companyId` in `where`.
C. **Postgres RLS** (Row-Level Security). The most defensible long-term answer; pair with `SET LOCAL app.company_id = …` per request.

**Impact:** Multi-tenant leak risk. Effort: **L (2–4 days for option A or C)**.

---

#### C-4 — `prisma.$transaction` callback signature loses `Prisma.TransactionClient` typing in audit / finance entry paths
**File:** `src/services/finance-entry.service.ts:5-8`
```ts
type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
```
This locally redefines the Prisma transaction client type because of a long-known TS issue. The result: when `generateRefundEntries` is called from `src/app/api/sales/[id]/refund/route.ts:162` with `generateRefundEntries(tx as any, ...)`, all type safety is lost. There is currently no compile-time check that `tx` actually supports the operations called.

**Fix:** Use `Prisma.TransactionClient` (the official one) and remove the local `Omit` type. If a runtime issue caused this workaround, document it inline.
**Impact:** Type-safety regression risk. Effort: **S (30 min)**.

---

### HIGH

#### H-1 — Missing indexes on foreign keys / hot filters

Below are FK or filter columns I could not find covered by any `@@index` / `@@unique`:

| Table | Column(s) | Reason | Schema line |
|---|---|---|---|
| `CashShift` | `(branchId, status)` exists; missing `(companyId, branchId, status)` for cross-branch admin queries | Used in `sale.service.ts:354,569,802,706` (`findFirst by branchId+status`) — covered. ✅ OK |
| `SalePayment` | `saleId` alone (no `@@index([saleId])`) — only `@@index([saleId, status])` exists | covers, but `select * from SalePayment where saleId = X` is the common case | 1153 |
| `CashMovement` | `salePaymentId` is FK with no index | Reverse lookups in refund flow | 1286 |
| `Refund` | `branchId` unindexed | Branch-level refund reports | 2802 |
| `RefundItem` | both indexes exist ✅ | 2825-2826 |
| `CustomerCashback` | `(branchId)` exists, but `(customerId, branchId)` unique covers — ✅ |
| `Commission` | `(saleId)` exists ✅ — also `(userId, status)` ✅ |
| `Quote` | covered, but missing `(deletedAt, status)` partial — see H-3 |
| `AccountReceivable` | **MISSING `(customerId, companyId, status, dueDate)`** | `validateCreditLimit` at `installment-utils.ts:146-167` does `findFirst({ customerId, companyId, status: "PENDING", dueDate: { lt: cutoff } })` for **every sale to credit customer**. Current `@@index([customerId, status])` is fine, but a 4-col composite covering `(customerId, companyId, status, dueDate)` would let PG use index-only scan. | 1577-1581 |
| `AccountReceivable` | sumAggregate at `installment-utils.ts:171-178` — same as above |
| `CardReceivable` | `(saleId)` missing (`salePaymentId` exists). | When cancelling a sale, `tx.cardReceivable.deleteMany({ where: { saleId } })` (`sale.service.ts:617`) — currently table-scan if many sales | 1189-1193 |
| `StockMovement` | `(branchId, productId, createdAt)` — only `(branchId, createdAt)` exists | Stock kardex by product per branch is a real query | 955-959 |
| `BillingEvent` | `externalEventId` is unique ✅; missing `(processedAt)` partial (`WHERE processedAt IS NULL`) for retry-queue scans | 2064-2066 |
| `EmailQueue` | only `@@index([status])` — should be `(status, createdAt)` for FIFO worker | 2391 |
| `Reminder` | covered, but `(scheduledFor)` alone, no `(status, scheduledFor)` for "due reminders" worker | 1844-1848 |
| `CustomerReminder` | same — only single-column indexes, no `(status, scheduledFor)` | 2572-2577 |
| `FinanceEntry` | **`(companyId, entryDate, type, side)`** would speed up the DRE `groupBy` significantly. Current indexes are `(companyId, entryDate)`, `(companyId, cashDate)`, `(companyId, type)` — none covers the 4-tuple. | 2737-2743 |
| `BranchStock` | `(productId)` ✅. Missing `(branchId, quantity)` for "low stock per branch" reports (`/api/dashboard/metrics` LEFT JOIN). For now PG can use FK index, but a partial `WHERE quantity <= min_stock` would be 10× faster. | 2299 |
| `Sale` | `(serviceOrderId)` unique ✅; missing `(completedAt)` for revenue reports (only `createdAt` indexed). Multiple finance reports filter by `completedAt` | 1094-1097 |
| `Sale` | `(status, completedAt)` — `finance-report.service.ts:285,298` does `status: "COMPLETED", completedAt: { gte, lte }` repeatedly; no index covers this | — |

**Quick wins to add (single migration):**
```sql
CREATE INDEX CONCURRENTLY "Sale_status_completedAt_idx"        ON "Sale"("status", "completedAt");
CREATE INDEX CONCURRENTLY "Sale_companyId_completedAt_idx"     ON "Sale"("companyId", "completedAt");
CREATE INDEX CONCURRENTLY "FinanceEntry_companyId_entryDate_type_side_idx"
  ON "FinanceEntry"("companyId", "entryDate", "type", "side");
CREATE INDEX CONCURRENTLY "CardReceivable_saleId_idx"          ON "CardReceivable"("saleId");
CREATE INDEX CONCURRENTLY "AccountReceivable_customerId_companyId_status_dueDate_idx"
  ON "AccountReceivable"("customerId", "companyId", "status", "dueDate");
CREATE INDEX CONCURRENTLY "EmailQueue_status_createdAt_idx"    ON "email_queue"("status", "createdAt");
CREATE INDEX CONCURRENTLY "BillingEvent_processedAt_null_idx"  ON "BillingEvent"("createdAt") WHERE "processedAt" IS NULL;
CREATE INDEX CONCURRENTLY "Reminder_status_scheduledFor_idx"   ON "Reminder"("status", "scheduledFor");
CREATE INDEX CONCURRENTLY "CustomerReminder_status_scheduledFor_idx"
  ON "customer_reminders"("status", "scheduledFor");
CREATE INDEX CONCURRENTLY "CashMovement_salePaymentId_idx"     ON "CashMovement"("salePaymentId");
CREATE INDEX CONCURRENTLY "Refund_branchId_idx"                ON "Refund"("branchId");
CREATE INDEX CONCURRENTLY "BranchStock_branchId_quantity_idx"  ON "branch_stocks"("branch_id", "quantity");
```
**Impact:** 3–10× speedup on hot reports. Effort: **S (use `CREATE INDEX CONCURRENTLY` to avoid lock; ~1 h)**.

---

#### H-2 — Connection pooling is undocumented / under-configured for Neon Serverless

**Files:** `src/lib/prisma.ts:6-12`, `.env.example:7`.
**Issue:**
- `DATABASE_URL` has **no pool parameters**. `.env.example` line 7 shows a bare URL. Neon needs `?pgbouncer=true&connection_limit=1` for serverless functions, plus `directUrl` for migrations (`prisma/schema.prisma:8` uses `DIRECT_URL` but it's not in `.env.example`).
- Default Prisma `connection_limit` is `num_cpus * 2 + 1` — on Vercel a single function gets dozens of connections, multiplied by concurrent invocations = pool exhaustion. Symptom: occasional `Can't reach database server`.
- README at line 256 documents Supabase pooler, but the codebase currently runs on Neon (per memory & docs). Mismatch.

**Fix:**
```ts
// .env.example
DATABASE_URL="postgresql://user:pwd@host/db?sslmode=require&pgbouncer=true&connection_limit=1&pool_timeout=10"
DIRECT_URL="postgresql://user:pwd@host/db?sslmode=require"  # for migrations only
```
And in `src/lib/prisma.ts`, document that a single `PrismaClient` instance per lambda is intentional via the `globalThis` cache.
**Impact:** Production stability. Effort: **S (30 min + redeploy)**.

---

#### H-3 — Schema drift: `deletedAt` columns + soft-delete helper are dead
**Files:** `src/lib/soft-delete.ts`, `prisma/schema.prisma:389/648/826/994/1069/2446`
**Symptom:** Helper not imported anywhere; no query filters on `deletedAt`; all services use `active=false`.
**Risks:**
- If someone adds `deletedAt: { not: null }` filter in one service, half of the codebase will silently lie about deleted state.
- Wasted columns on every Customer/Product/Sale/etc. row.

**Fix:**
A. **Remove the columns** (and `soft-delete.ts`) via a destructive migration after verifying via `psql: SELECT COUNT(*) FROM "Customer" WHERE "deletedAt" IS NOT NULL;` returns 0 for all 6 tables.
B. **OR** finish the migration: replace `active=false` semantics with `deletedAt = now()` + Prisma middleware to auto-exclude.
**Impact:** Tech debt, future bug surface. Effort: **S (1–2 h to drop columns) or M (1 day to fully adopt)**.

---

#### H-4 — Decimal serialization handled inconsistently
**Files:** `src/lib/serialize.ts` (excellent helper, written), plus 312+ `Number(x.field)` and 25 `JSON.parse(JSON.stringify(...))` calls scattered.
**Symptom (from memory):** Campaigns endpoint bug was “Decimal does not serialize” — already “fixed” via `JSON.parse(JSON.stringify())` (lossy, slow).
**Verification:**
```
grep -rn "JSON.parse(JSON.stringify" src/ | wc -l   # ≥25 occurrences (per serialize.ts docblock)
grep -rn "Number(.*\\.\\(.*\\)" src/services/ | head -5
```
**Fix:** Adopt `serializePrisma` consistently in `api-response.ts` so every NextResponse goes through it. The helper already supports arrays, nested objects, BigInt, Decimal, Date.
**Impact:** Hidden precision loss (`new Prisma.Decimal("0.10").toNumber()` is still 0.1, but `JSON.stringify` round-trips DateTime in inconsistent zones). Effort: **M (1 day for sweep)**.

---

#### H-5 — Dashboard metrics endpoint runs 15+ sequential queries
**File:** `src/app/api/dashboard/metrics/route.ts:32-260`
**Lines 32-89** issue 4 separate `prisma.sale.aggregate` and 2 `prisma.customer.count` calls **not** parallelized. Lines 92, 184, 194, 205, 218, 228, 250-260 issue more counts. Total: ~12 separate round-trips.

**Fix:** Wrap in a single `Promise.all([...])` — most queries are independent. Conservative estimate: 12 × 100 ms = 1.2 s currently → ~200 ms.

**Impact:** Dashboard load time. Effort: **S (1 h)**.

---

#### H-6 — `/api/reports/branch-comparison` issues 5 queries per branch
**File:** `src/app/api/reports/branch-comparison/route.ts:31-77`
**Pattern:** `branches.map(async (branch) => Promise.all([5 queries]))` — for 10 branches = 50 queries (50 round-trips because `branches.map` is itself sequential **across** branches due to no outer `Promise.all`).

Wait — actually `Promise.all(branches.map(...))` (line 31) does fan-out across branches. But it still issues 5 × N_branches queries. Better is **5 queries with `groupBy([branchId])`** then map results.

**Fix:**
```ts
const [salesAgg, osTotal, osDelivered, newCustomers, stockValue] = await Promise.all([
  prisma.sale.groupBy({ by: ["branchId"], where: { companyId, createdAt: dateFilter, status: "COMPLETED" }, _sum: { total: true }, _count: true }),
  prisma.serviceOrder.groupBy({ by: ["branchId"], where: { companyId, createdAt: dateFilter }, _count: true }),
  prisma.serviceOrder.groupBy({ by: ["branchId"], where: { companyId, status: "DELIVERED", deliveredAt: dateFilter }, _count: true }),
  prisma.customer.groupBy({ by: ["originBranchId"], where: { companyId, createdAt: dateFilter }, _count: true }),
  prisma.$queryRaw`SELECT bs."branch_id" as id, SUM(bs.quantity * p."costPrice")::float as value FROM "branch_stocks" bs JOIN "Product" p ON p.id=bs."product_id" WHERE p."companyId" = ${companyId} GROUP BY bs."branch_id"`,
]);
```
**Impact:** Report latency. Effort: **S (1 h)**.

---

#### H-7 — `for (item of items) { findUnique salePrice }` inside ServiceOrder transactions
**File:** `src/services/service-order.service.ts:222-247` (create) and 309-334 (update)
**Same antipattern** as C-2 but smaller blast radius (OS items are usually 1–3).
**Fix:** Batch with `findMany({ where: { id: { in: productIds }, companyId } })` then map.
**Impact:** OS creation latency. Effort: **S (30 min)**.

---

#### H-8 — `validateCreditLimit` issues 5 queries per credit sale
**File:** `src/lib/installment-utils.ts:83-195`
- 1× `customer.findFirst` (line 92)
- 3× `systemRule.findUnique` (lines 111-121, **already** `Promise.all`-ed — good)
- 1× `accountReceivable.findFirst` (line 146)
- 1× `accountReceivable.aggregate` (line 171)

Total: 5 round-trips synchronously **inside** the validation, called **inside** the sale validation loop (`sale.service.ts:338`). If a sale has 2 STORE_CREDIT payments, this fires **twice** (= 10 round-trips, ~1 s).

**Fix:**
1. Call `validateCreditLimit` once per (customerId, totalCreditRequested) — sum the credit payments first.
2. Cache `SystemRule` lookups for the request lifetime (they almost never change).
3. Combine `accountReceivable.findFirst(overdue)` + `aggregate(open)` into one raw query returning both.

**Impact:** Credit sale latency. Effort: **S (1 h)**.

---

#### H-9 — `FinanceEntry` lookups by `chartOfAccounts` repeat the same SELECT 8–12× per sale
**File:** `src/services/finance-entry.service.ts:14-26, 200-209`
The `chartAccountCache` (lines 202-209) helps for *within* a single sale's generateSaleEntries, but: each call to `getChartAccountByCode` still does one DB round-trip per unique code. For a typical sale that's 6 unique codes (1.1.03, 3.1.01, 4.1.0x for each item type, 1.1.0x for each payment method, 5.1.01).

**Fix:** Pre-load ALL the company’s `ChartOfAccounts` rows once at the start of `generateSaleEntries` (typically 30–50 rows) and look up from the in-memory map.
**Impact:** Tx duration (and P2028 risk). Effort: **S (30 min)**.

---

#### H-10 — Sale `cancel` loops do N+1 stock updates + N+1 financeAccount lookups
**File:** `src/services/sale.service.ts:582-700`
- Line 583: `for (item of sale.items) { branchStock.upsert + product.update + stockMovement.create }` (×3 round-trips per item, sequential).
- Line 685: `for (payment of sale.payments) { financeAccount.findFirst + financeAccount.update }` (×2 per payment).

**Fix:** Same as C-2 — batch product IDs and use `updateMany` where possible; pre-fetch all FinanceAccounts by type once.
**Impact:** Cancel sale latency. Effort: **S (1 h)**.

---

#### H-11 — Raw SQL queries that *do* parameterize correctly but **also** skip `companyId` in one spot
**File:** `src/services/product-campaign.service.ts:1061-1075`
```ts
SELECT si."productId", ...
FROM "CampaignBonusEntry" cbe
JOIN "SaleItem" si ON si.id = cbe."saleItemId"
WHERE cbe."campaignId" = ${campaignId}    -- no companyId filter
```
The `campaignId` was fetched by a previous query scoped to `companyId`, so this is logically safe — but defense-in-depth says always include `cbe."companyId" = ${companyId}`.
**Effort:** **S (5 min)**.

---

### MEDIUM

#### M-1 — Transactions wrap external imports / dynamic `await import()`
**File:** `src/services/sale-side-effects.service.ts:183, 428`
Both `calculateCardFee` (line 183) and `generateSaleEntries` (line 428) are loaded with `await import(...)` **inside** a `$transaction`. This works but adds 10–50 ms cold-start to every sale. Move imports to top of file.

#### M-2 — `prisma.$transaction` with `timeout: 30_000` is a code smell
**File:** `src/services/sale.service.ts:528-531`
The comment is honest ("`applyFinanceEntriesInTx` faz 6-12 queries sequenciais"). Solution: **move financeEntries out of the transaction** and into the post-commit side-effects (`applyPostCommitSideEffects`). DRE is a derived view — eventual consistency is acceptable.

#### M-3 — `oldData` capture races with `result?.id`
**File:** `src/lib/prisma-audit-middleware.ts:38-45`
For `update`, `params.args.where` may include a relation filter (e.g. `where: { saleId: X }` for updateMany). The middleware silently falls through. Use `args.data` only if `params.action === 'update'` AND there is an `id` in `where`.

#### M-4 — Many `Decimal` columns where `Int` suffices
**Lines:**
- `LoyaltyProgram.pointsPerReal: Decimal(5,2)` (line 1394) — points are usually integers
- `LoyaltyProgram.reaisPerPoint: Decimal(5,2)` (line 1395)
- `CashbackConfig.minPurchaseMultiplier: Decimal(3,1)` (line 1736)
- These are configs, not money. Switching to `Int` cents would save ~5% storage and avoid float-rounding bugs in JS.

#### M-5 — Inconsistent monetary precision
- `salePrice Decimal(12,2)` (Product line 631)
- `grossRevenue Decimal(14,2)` (DREReport line 1450)
- `priceMonthly Int` (Plan line 1923 — integers in cents)
- `totalRevenue Decimal(10,2)` (UsageSnapshot line 2270 — only 10 digits, **can overflow at R$ 99,999,999.99**)
- `cashbackBalance Decimal(10,2)` (CustomerReminder line 2561) — same overflow risk
- `Sale.total Decimal(12,2)` ✅ — but `Commission.commissionAmount Decimal(12,2)` and `Decimal(10,2)` in some places

**Fix:** Standardize on `Decimal(14,2)` for any aggregated total, `Decimal(12,2)` for per-transaction.

#### M-6 — `cascade` rules are inconsistent / risky
**File:** `prisma/schema.prisma`, multiple lines
- `Quote → QuoteItem (Cascade)` ✅
- `Sale → SaleItem` — **no cascade**; soft-delete pattern. If `sale.deletedAt` is dead code (H-3), and there's no `onDelete`, the table holds orphans forever.
- `Company → users / sales / products` — no cascade defined ⇒ cannot ever hard-delete a Company without breaking 50+ FKs. Currently safe (we soft-delete via `isBlocked`).
- `Permission → RolePermission (Cascade)` ✅ — but `User.customPermissions → UserPermission (Cascade)` ✅. OK.
- **Risky:** `Invite → Company (Cascade)` (line 2371) — deleting a Company nukes pending invites. That's wanted.
- **Missing:** `ServiceOrder → ServiceOrderItem` has NO cascade. If a draft OS is hard-deleted, items become orphans.

**Recommendation:** Audit all "child of X" relations and add `onDelete: Cascade` consistently for cases where hard-delete is supported (Invites, OnboardingSteps, BonusEntries) and `onDelete: Restrict` for everything else (default Prisma behavior is `Restrict` so this is mostly fine; explicit > implicit).

#### M-7 — `Customer.cpf` `@@unique([companyId, cpf])` permits multiple NULL CPFs ✅, but **NOT** indexed for case-insensitive search
**File:** `src/services/sale.service.ts:78-83`, `customer.service.ts:101-106`
**Query:** `{ cpf: { contains: search, mode: "insensitive" } }` — `insensitive` on a non-ICU collation triggers a sequential scan unless there's a functional `lower()` index. For Customer.name & cpf & phone, add:
```sql
CREATE INDEX "Customer_companyId_name_lower_idx" ON "Customer"("companyId", lower("name"));
CREATE INDEX "Customer_companyId_cpf_idx" ON "Customer"("companyId", "cpf"); -- already covered by unique
```
**Better:** Use `pg_trgm` for prefix/substring matches: `CREATE EXTENSION pg_trgm; CREATE INDEX ON "Customer" USING gin (name gin_trgm_ops);`

#### M-8 — `birthdayMonth` filter in customers does **2** sequential queries (raw + Prisma)
**File:** `src/services/customer.service.ts:113-122`
First `$queryRaw` collects IDs, then `findMany({ where: { id: { in: ids } } })`. If the company has 10k customers and 800 birthdays in a month, this transports 800 IDs over the wire then back. Use `EXTRACT(MONTH FROM "birthDate")` directly in the Prisma where via raw — or store `birthMonth: Int` denormalized column with index.

#### M-9 — `applyStockDebitInTx` has an inconsistency: cache update uses `$executeRaw` outside BranchStock update
**File:** `src/services/stock.service.ts:67-72`
The `branchStock.updateMany` (line 41) and `$executeRaw "UPDATE Product"` (line 67) are TWO separate statements inside the transaction. If the transaction commits but `Product.stockQty` cache update fails, the cache diverges from `BranchStock`. Better: one PG function or merge into a CTE. Or accept eventual recompute via a scheduled job. Currently this is silently a known inconsistency in the system.

#### M-10 — Index `@@index([companyId, type])` on Product but no `@@index([type])` alone — fine
But: `@@index([companyId, abcClass])` (line 680) and `abcClass` is almost never populated (no service computes it). Either compute it or drop the index.

#### M-11 — `StockMovement.quantity` is `Int` (correct), but `StockMovement.type` enum has 10 values yet schema also accepts NULL `branchId` (line 935). On a `SALE` movement with NULL `branchId`, the auditor cannot reconstruct which branch was charged. Make `branchId` `NOT NULL` for `SALE`/`TRANSFER_OUT` types (DB check constraint) or just `NOT NULL` always.

#### M-12 — `Sale.legacyId / legacySource` columns (lines 1074-1075) lack indexes
If used for import deduplication, add `@@unique([companyId, legacyId])` or at least `@@index([legacyId])`.

#### M-13 — `RolePermission.role` is a `String` (line 1669), but elsewhere we use `UserRole` enum
**File:** `prisma/schema.prisma:1669`
Inconsistency. Use the enum here to prevent typos like `"VENDEOR"` ending up in the table. The seed at `permission.service.ts` is documented to handle this manually (per MEMORY.md) — make it type-safe.

#### M-14 — `Counter.value Int` could overflow at ~2 billion
For OS numbers per company (`getNextSequence(companyId, "service_order")`), `Int` is fine. But for global counters consider `BigInt`. Low priority.

---

### LOW

#### L-1 — Naming inconsistency: snake_case `@@map` for some tables, camelCase for others
`networks`, `invites`, `email_queue`, `branch_stocks` use snake_case mapping; `Customer`, `Product`, `Sale` etc. use PascalCase table names directly. PostgreSQL convention is snake_case. Migrate all (large effort, no functional gain unless adopting tools like Hasura).

#### L-2 — `CompanySettings.companyId` is unique (1:1) but defined with explicit `@@index([companyId])` (line 1725) — redundant with `@unique`.

#### L-3 — `Permission.code @unique` but no index on `module + category` — used for grouping in admin UI. Minor.

#### L-4 — Several String fields with no `@db.VarChar(N)` constraint. PG allows TEXT for free but if you intend to limit (e.g. CPF to 11), add constraints at DB level.

#### L-5 — `SalePayment.feePercent Decimal(5,4)` allows 9.9999 — enough for percentages up to ~10× revenue. OK.

#### L-6 — `cuid()` IDs (default everywhere) are sortable but **not monotonic across servers**. For high-write tables (`StockMovement`, `CashMovement`, `FinanceEntry`), `cuid2` or UUIDv7 would yield better index locality on inserts. Low priority.

#### L-7 — No `Counter` row guards (sequence races): `getNextSequence(companyId, "service_order", tx)` uses an upsert+increment. As long as it's always called inside a `$transaction` with SERIALIZABLE isolation or with row-level lock, OK. Confirm `prisma/lib/counter.ts` uses `SELECT ... FOR UPDATE` or `INSERT ... ON CONFLICT DO UPDATE RETURNING`.

#### L-8 — `Product.images String[]` — Postgres arrays are fine for ≤20 items but resist indexing. If product galleries can be large, normalize to `ProductImage` table.

#### L-9 — `prescriptionData Json?` on `ServiceOrder` (line 819) and `QuoteItem.prescriptionData Json?` (line 1041) — duplicate semantics. `PrescriptionValues` table exists for this. Consolidate.

#### L-10 — `JSON` columns lack JSONB indexes anywhere. If `Reminder.metadata`, `SystemRule.value`, `BillingEvent.payload`, `FinanceEntry.calculationDetails` are ever filtered, add `@@index([..., metadata], type: Gin)` (Prisma supports it now).

---

## Migrations & Drift

**Files:** `prisma/migrations/*.sql` (7 migrations) + `neon_migration.sql` (46K, not a Prisma migration), plus `prisma/seed.ts`, `prisma/seed-mock.ts`, `prisma/seed-plans.ts`, `prisma/seed-sla.ts`.

### Findings

1. **Drift evidence in latest migration** — `20260522204337_add_branch_stock_prices/migration.sql` literally says:
   > "Adiciona colunas de preço/margem em branch_stocks que existem no schema.prisma mas estavam ausentes no banco — drift causava 500 em /api/products"
   This means at some point production drifted from schema.prisma without a corresponding migration file. **Add a CI step** (`npx prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ...`) to fail builds on drift.

2. **Missing `_meta` migration history** — only 7 dated folders. The `neon_migration.sql` and `create_database_complete.sql` at the project root suggest legacy SQL bootstraps. Risk: rebuilding a new env may apply both → conflicts.

3. **No down-migrations** — Prisma doesn't generate them, but for irreversible columns (`CardReceivable` table create) a rollback plan should live in a runbook.

4. **`IF NOT EXISTS` used in `20260522`** — good defensive pattern but means migration is idempotent only if columns were never created with a different type. Safe here.

5. **No data migration validation** — `20260505_add_customer_credit_limit` adds nullable columns with sensible defaults. No risk.

6. **Recommendation:** Adopt `prisma migrate deploy` in CI; never run `prisma db push` in production (which is what drift suggests happened).

---

## Multi-Tenancy Integrity

I sampled ~30 services and ~50 API routes. Findings:

- **Good defaults:** Almost every `findFirst/findMany/aggregate/count` includes `companyId`. The codebase respects multi-tenancy.
- **Patterns of concern:**
  - **Update by ID without companyId** (~ 20 occurrences listed earlier). All I checked do an explicit `findFirst({ id, companyId })` first → defense-in-depth. But it's brittle.
  - **`AdminUser` / `Plan` / `Network` / `Tag`** are intentionally global. OK.
  - **`SalePayment`, `SaleItem`, `Commission`, `StockReservation`** scoped via FK only (saleId). Defensible because parent (Sale) is scoped. But: `paymentMethod` filter on `Sale` (`sale.service.ts:58-62`) uses `payments: { some: { method } }` which is fine because `payments` is filtered through `saleId`.
  - **`FinanceEntry.sourceType="SalePayment"` lookups by `sourceId` only** — the `sale.service.ts:678` deletes finance entries for payments without checking `companyId`. Defense-in-depth would also filter by companyId.

### Concrete tenant-scoping gaps
| Location | Issue |
|---|---|
| `src/services/product-campaign.service.ts:1061` | Raw SQL doesn't include `companyId` (campaignId derives it but defense-in-depth recommended) |
| `src/lib/prisma-tenant.ts` | **NOT REGISTERED** — see C-3 |
| `src/lib/prisma-audit-middleware.ts:67` | `AuditLog.companyId` may be null → skipped |
| `src/app/api/sales/[id]/refund/route.ts:184` | `tx.sale.update({ where: { id: saleId } })` — saleId came from URL; **does NOT include companyId**. The fetch at line 28 verifies ownership ✅, so it's safe, but I’d still add `companyId` for belt-and-suspenders. |

---

## Transactions

### Critical flows audit

| Flow | File | Wrapped in tx? | Atomicity holes |
|---|---|---|---|
| Sale create | `sale.service.ts:445-531` | ✅ Yes (30 s timeout — see M-2) | `applyPostCommitSideEffects` runs **outside** the tx. If side effects fail (cashback earn, campaign), sale still succeeds with structured logs. **Documented behavior** — acceptable, but ensure replay job exists for `finance_entries_generation_failed`. |
| Sale cancel | `sale.service.ts:573-701` | ✅ Yes (no timeout override, default 5 s) | **Risk:** 8+ sequential ops (stock revert + payment void + cardReceivable.deleteMany + AR cancel + commissions cancel + financeEntry delete + financeAccount decrement) — likely to time out with many items/payments. Add explicit timeout. |
| Quote → Sale convert | `quote.service.ts:792-905` | ✅ Yes | Same as sale create. Has Bug #1 fix (sale-side-effects.service.ts shared with sale.create). |
| Refund | `sales/[id]/refund/route.ts:26-191` | ✅ Yes | OK |
| Cash close shift | (not audited in this pass — recommend follow-up) | ? | ? |
| OS deliver | `service-order.service.ts:437-461` | ✅ Yes | Single update + history — small, OK |
| AccountReceivable receive | `accounts-receivable/route.ts:466-…` | ✅ Yes | OK |
| FinanceEntry generation | `finance-entry.service.ts:200+` | ✅ runs inside caller's tx | But blocking the parent tx, leading to timeouts (M-2) |

### Recommendations
1. **Move FinanceEntry generation OUT of the sale transaction.** Use an outbox pattern: write `OutboxEvent` row inside tx; a worker drains it. Reduces sale tx from 8 s to 1 s.
2. **Add `timeout: 15_000` to `sale.cancel`** explicitly — currently uses 5 s default.
3. **Document SERIALIZABLE vs READ COMMITTED choice** — Prisma defaults to READ COMMITTED. The stock UPDATE WHERE quantity >= X pattern (`stock.service.ts`) is race-safe under READ COMMITTED; the Counter increment pattern needs verification.

---

## Connection Pooling (Neon Serverless)

**Current state:** Default Prisma client, single global instance per lambda cold start. `DATABASE_URL` has no pool params per `.env.example`.

**Neon-specific recommendations:**
1. Use the **Neon pooler endpoint** (`-pooler.region.aws.neon.tech`) for `DATABASE_URL`.
2. Use the **direct endpoint** for `DIRECT_URL` (migrations).
3. Add `?pgbouncer=true&connection_limit=1&pool_timeout=10` to the pooler URL.
4. Wait — Prisma 5+ on serverless: **use the Data Proxy** or `PRISMA_CLIENT_ENGINE_TYPE=binary` with explicit connection limits.
5. Add `NEON_DATABASE_URL` documentation to `.env.example`.
6. Monitor: enable Neon's "Slow query" log + Vercel function metrics. Alert if median p95 sale.create > 2 s.

---

## Audit Logs (Critical Mutations)

**Current state:** `prisma-audit-middleware.ts` (broken — see C-1) + `AuditLog` table (only `companyId, action, entityType, entityId, oldData, newData, userId?, ip?`) + `GlobalAudit` (admin actions) + `ActivityLog` (system events).

### Coverage gaps
| Mutation | Audited? |
|---|---|
| Sale create | ❌ (middleware misses tx) |
| Sale cancel | ❌ (updateMany / payment void not captured) |
| Refund | ❌ |
| Payment reversal | ❌ |
| AR/AP status change | ❌ (only single update via `id` captured, and not always) |
| Customer creditLimit change | ❌ |
| Product price change | ❌ (audited per-row only if updated by id) |
| User permission grant | ❌ |
| StockAdjustment approval | ❌ |
| ImpersonationSession | ✅ (separate table — good) |

### Fix
- Replace middleware with explicit `auditLog.create` calls in each service after mutation, inside the same transaction.
- Add `userId` via AsyncLocalStorage or pass `userId` explicitly to every service method.
- Move from JSON `oldData/newData` to a structured diff (e.g. `jsonpatch`) so the table doesn't grow 10× the original table size.

---

## Reports / Aggregations Efficiency

| Endpoint | Current | Recommended |
|---|---|---|
| `/api/dashboard/metrics` | 12+ sequential queries (H-5) | `Promise.all` all aggregations |
| `/api/reports/branch-comparison` | N × 5 queries (H-6) | 5 `groupBy` queries total |
| `/api/finance/reports/dre` | 2 `groupBy` + 1 `findMany` ✅ | Add index `(companyId, entryDate, type, side)` (H-1) |
| `/api/finance/reports/cash-flow` | Pulls every entry & aggregates in JS | Move aggregation to SQL `date_trunc('day', cashDate)` |
| `/api/finance/dashboard` | 5+ separate queries + groupBy | `Promise.all` already used ✅ |
| `/api/dashboard/metrics` low-stock list | Raw SQL ✅ uses `LEFT JOIN` + index | Add `idx_branch_stocks_quantity_min` (H-1) |

### DailyAgg recommendation
The `DailyAgg` table (line 2829) exists but **I found no service writing to it**. If it's intended as a denormalized aggregate, build a scheduled job. Until then, all dashboard queries re-aggregate raw data — fine for ≤ 10k sales, painful at scale.

---

## Quick Wins (< 30 min each)

| # | Action | File | Effort |
|---|---|---|---|
| Q1 | Parallelize dashboard metrics with `Promise.all` | `src/app/api/dashboard/metrics/route.ts:32-89` | 20 min |
| Q2 | Add `CardReceivable_saleId_idx` | new migration | 10 min |
| Q3 | Add `Sale_status_completedAt_idx` | new migration | 10 min |
| Q4 | Add `FinanceEntry(companyId, entryDate, type, side)` index | new migration | 10 min |
| Q5 | Add `AccountReceivable(customerId, companyId, status, dueDate)` index | new migration | 10 min |
| Q6 | Move `await import()` calls out of transactions | `sale-side-effects.service.ts:183, 428` | 10 min |
| Q7 | Add `cb."companyId" = ${companyId}` to raw SQL in product-campaign | `product-campaign.service.ts:1061` | 5 min |
| Q8 | Document Neon pooler URL in `.env.example` | `.env.example` | 15 min |
| Q9 | Add explicit `timeout: 15_000` to `sale.cancel` transaction | `sale.service.ts:573` | 5 min |
| Q10 | Add `BillingEvent_processedAt_null_idx` partial index | new migration | 10 min |
| Q11 | Pre-fetch `ChartOfAccounts` once at start of `generateSaleEntries` | `finance-entry.service.ts:200` | 25 min |
| Q12 | Add `EmailQueue(status, createdAt)` for worker FIFO scan | new migration | 10 min |
| Q13 | Verify CASCADE on `ServiceOrder → ServiceOrderItem` (currently missing — orphan risk) | schema | 5 min |
| Q14 | Replace `JSON.parse(JSON.stringify())` with `serializePrisma` in 5 hottest endpoints | various | 30 min |
| Q15 | Decide: drop `deletedAt` columns or wire up filter (H-3) | schema | 30 min decision |

---

## Suggested Observability

1. **pg_stat_statements** — Enable in Neon. Identify top 10 slowest queries weekly.
2. **Prisma query logging in production at WARN level** — currently dev-only (`prisma.ts:8`). Sample 1% of queries in prod to capture slow ones.
3. **Sentry breadcrumb on `$transaction` retries** — `P2028 Transaction expired` should auto-page.
4. **Vercel Analytics:** alert if `/api/sales` POST p95 > 3 s.
5. **Custom metric: `finance_entries_generation_failed` log count** — there's already a structured log (sale-side-effects.service.ts:431). Hook it to a counter + alert when > 1% of sales.
6. **Connection pool exhaustion** — Vercel logs `Can't reach database` → trigger PagerDuty.
7. **Audit log gap detector** — for any `Sale.update` not matched by an `AuditLog` row within 1 s, log warning. Validates middleware coverage.
8. **Neon’s "compute time" metric** — track per-day; spike = under-pooled.
9. **Materialized view for DRE** — `CREATE MATERIALIZED VIEW dre_daily AS SELECT ... FROM "FinanceEntry" GROUP BY date, type, side` refreshed nightly. Cuts dashboard latency 10×.
10. **Long-running tx detector** — PG `pg_stat_activity` query for `state='idle in transaction' AND xact_start < now() - interval '5s'`. Any such row = a leaking tx in code.

---

## Closing Notes

The schema is large (3,824 lines, ~120 models) but generally well-structured: composite indexes are present in most hot tables, foreign keys are explicit, monetary fields use `Decimal`. The **most impactful** issues are:

1. **C-1 (audit middleware unreliable)** — compliance & forensics risk.
2. **C-2 (N+1 in sale.create)** — direct user-visible latency on PDV checkout.
3. **C-3 (tenant extension dead code)** — latent multi-tenant leak.
4. **H-1 (missing indexes)** — easy wins, big impact.
5. **H-2 (Neon pooling)** — undocumented; one production incident away from being a Sev1.

Other findings are tech debt that can be paid down sprint by sprint. The codebase already shows evidence of careful work: the transaction timeout band-aid is documented, the Decimal serialization helper exists, the soft-delete pattern is consistent (even if `deletedAt` is dead). The team’s next opportunity is finishing what was started: wire up `prisma-tenant.ts`, finish migrating to `serializePrisma`, decide on soft-delete strategy, and fix the audit middleware.

— Agent 2 (Database)
