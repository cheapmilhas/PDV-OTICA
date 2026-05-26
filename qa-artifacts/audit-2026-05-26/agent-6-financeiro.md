# Agent 6 — Financeiro / Caixa / Billing — Audit Report
Date: 2026-05-26
Scope: src/services/finance-*.ts, src/services/cash.service.ts, src/services/reconciliation-*.ts, src/lib/asaas.ts, src/lib/penalty-utils.ts, src/lib/installment-utils.ts, src/lib/subscription.ts, src/app/api/finance/**, src/app/api/cash/**, src/app/api/billing/**, src/app/api/webhooks/asaas/**, src/app/api/accounts-receivable/**, src/app/api/sales/[id]/refund.

---

## Executive Summary — Top 5 Money-Losing Bugs

1. **CREDIT_CARD payment booked as cash on sale date instead of settlement date** — `src/services/finance-entry.service.ts:382`. Cash flow projections show money "in the bank" 30 days before it actually arrives. **Severity: CRITICAL.**
2. **Card adquirente account balance double-counted** — `finance-entry.service.ts:387-392` increments `FinanceAccount.balance` immediately on sale for CARD_ACQUIRER, then reconciliation/settlement is expected to add it again. No reconcile of the running balance. **Severity: CRITICAL — overstates available bank balance.**
3. **DRE / dashboards exposed to any authenticated user — no permission gate** — `src/app/api/finance/reports/dre/route.ts`, `dashboard/route.ts`, `bi/route.ts`, `entries/route.ts`, `cash-flow/route.ts`, `card-receivables/route.ts`. CASHIER/VENDEDOR can read full P&L. **Severity: HIGH.**
4. **Sale finance entries failure silently swallowed** — `src/services/sale-side-effects.service.ts:430-442`. Sale completes but DRE has hole. No table/queue marks "finance pending"; manual reconciliation impossible to find without grep'ing Vercel logs. **Severity: HIGH — silent revenue loss in DRE.**
5. **Receivable reversal (estorno) does NOT reverse CashMovement, does NOT reverse FinanceEntry** — `src/app/api/accounts-receivable/route.ts:373-427`. When user clicks "Estornar" on a received parcela, the AR returns to PENDING but the cash movement created at receipt stays, and no finance entry rollback. Caixa fechamento includes ghost cash. **Severity: CRITICAL.**

---

## Findings by Severity

### CRITICAL — Money or data lost / corrupted

#### F-1. CREDIT_CARD cashDate = sale date (cash flow is 30 days off)
- File: `src/services/finance-entry.service.ts:382`
- Current:
  ```ts
  cashDate: (payment.method === "STORE_CREDIT" || payment.method === "BALANCE_DUE")
    ? null
    : (payment.receivedAt ?? sale.completedAt ?? new Date()),
  ```
- Problem: CREDIT_CARD also doesn't settle on receivedAt — it settles in `payment.settlementDate` (already calculated by `card-fee.service.ts`, default T+30). But the PAYMENT_RECEIVED entry uses today as cashDate.
- Impact: Cash flow report (`finance-report.service.ts:getCashFlow`) shows inflow on sale day. Owner thinks they have R$ X today; reality is the money arrives in 30 days. For a store with R$ 100k/month in credit card sales, the displayed "available cash" is permanently inflated by R$ 100k. **Causes wrong sangria/withdrawal decisions, wrong supplier payment scheduling.**
- Proposed fix:
  ```ts
  cashDate: (payment.method === "STORE_CREDIT" || payment.method === "BALANCE_DUE")
    ? null
    : (payment.method === "CREDIT_CARD")
      ? (payment.settlementDate ?? null)  // settles on D+settlementDays, recognize then
      : (payment.receivedAt ?? sale.completedAt ?? new Date()),
  ```
- Better: split CREDIT_CARD into two entries — gross receivable (`type=PAYMENT_RECEIVED, side=DEBIT, debitAccount=Adquirente, creditAccount=Contas a Receber, cashDate=settlementDate`) and net cash on actual settlement event (currently never recorded). The system has `CardReceivable.status=SETTLED` but no FinanceEntry is generated when it flips.
- Effort: 1 day (with tests + backfill script).

#### F-2. FinanceAccount.balance double-counted for cards
- File: `src/services/finance-entry.service.ts:387-392`, `sale.service.ts:cancel:689-704`
- Current: On every CREDIT_CARD sale, `FinanceAccount.balance` of type CARD_ACQUIRER is incremented by gross amount. But cards take 30 days to settle. There is no event that increments it on actual settlement — and yet `CardReceivable` table tracks expected settlement separately.
- Impact: `getFinanceDashboard` returns `accountBalances` (`finance-report.service.ts:351-354`) showing CARD_ACQUIRER balance ≈ 30 days of card sales — but this money is *receivable*, not *available*. Dashboard's "saldo das contas" is **double the truth**: cash flow shows it as inflow AND balance shows it as available.
- Proposed fix: CREDIT_CARD payments should NOT increment FinanceAccount.balance in `generateSaleEntries`. Only when CardReceivable transitions to SETTLED should balance increment. Create new function `generateCardSettlementEntries(cardReceivableId)` triggered by reconciliation match.
- Effort: 1-2 days + backfill of existing balances.

#### F-3. AR reversal does not reverse CashMovement or FinanceEntry
- File: `src/app/api/accounts-receivable/route.ts:373-427`
- Current: PATCH with `action: "reverse"` resets AR to PENDING but does NOT delete the CashMovement created when the AR was received (lines 510-549) nor any FinanceEntry.
- Impact:
  - **Caixa fechamento** still counts the reversed receipt as cash IN; cashier ends with phantom money.
  - **DRE** under-counts AR balance (it sees PENDING again) but Receita stays correct — yet payment_received entry is orphaned.
  - Money discrepancy between "received cash today" and "AR closed today".
- Proposed fix: inside the reversal block, also:
  ```ts
  // Reverter CashMovement
  await tx.cashMovement.updateMany({
    where: { originType: "AccountReceivable", originId: reversal.id, direction: "IN" },
    data: { /* não tem soft-delete — criar contra-movimento */ },
  });
  // Melhor: criar movimento OUT compensatório, type=ADJUSTMENT, note="estorno AR <id>"
  ```
  Plus delete or invert FinanceEntry rows for this AR.
- Effort: 1 day (must transactionalize and account for already-closed shifts).

#### F-4. Receive-multiple AR — partial payment leaves status PENDING but receivedAmount/discountAmount overwritten
- File: `src/app/api/accounts-receivable/receive-multiple/route.ts:113-137`
- Current: When `totalReceived < totalExpected`, status stays PENDING (`newStatus`). BUT `receivedAmount`, `fineAmount`, `interestAmount`, `discountAmount` are written to the AR row. The AR is now PENDING with a `receivedAmount` set — making future partial payments overwrite (lose the previous partial). The `notes` field appends but `receivedAmount` does not.
- Impact: Partial-pay flow is broken: customer pays R$ 30 of R$ 100 today, R$ 70 next week — the second payment overwrites both `receivedAmount` and `notes` rather than accumulating. No AR_Payment child table exists for tracking partial receipts.
- Proposed fix: introduce an `AccountReceivablePayment` model (id, accountReceivableId, amount, method, receivedAt, userId). PATCH/receive-multiple inserts a row; AR.receivedAmount is computed (sum of children). Partial vs full computed from `receivedAmount = amount + penalties - discount`.
- Effort: 2 days (schema migration + UI changes).

#### F-5. Penalty calculation uses local clock and reference date can sneak past
- File: `src/lib/penalty-utils.ts:35-38`
- Current: uses `dueDate.getFullYear()/getMonth()/getDate()` from a Date stored UTC. For BR timezone (UTC-3), a dueDate stored as `2026-05-01T00:00:00Z` is interpreted as **April 30 23:00 local**. So `getDate()` on server (Vercel = UTC) returns 1; on client (BR) returns 30 — but both go through this function on server, so we're OK there. However: receivable `dueDate` is saved via `new Date(dueDate)` from string ISO at creation — the date depends on whoever called.
- Specific issue: `addDays(new Date(), 30)` in `sale-side-effects.service.ts:268` for BALANCE_DUE is computed in UTC now, then `getDate()` of that Date is used for grace comparison. Edge case at midnight BR (3 AM UTC) — grace can be off by one.
- Severity: medium (very narrow timing) but **clarify in tests**.
- Proposed fix: standardize on `startOfLocalDay(date, "America/Sao_Paulo")` from `date-utils.ts` for all due-date math.
- Effort: 4 hours.

---

### HIGH — Wrong numbers in reports / abusable APIs

#### F-6. Finance APIs lack permission gating (only `requireAuth`)
- Files (no `requirePermission("finance.view")` or similar):
  - `src/app/api/finance/reports/dre/route.ts:10`
  - `src/app/api/finance/reports/cash-flow/route.ts:11`
  - `src/app/api/finance/dashboard/route.ts:10`
  - `src/app/api/finance/bi/route.ts:11`
  - `src/app/api/finance/entries/route.ts:10, 70`
  - `src/app/api/finance/card-receivables/route.ts:8`
  - `src/app/api/finance/chart/route.ts`
  - `src/app/api/finance/accounts/route.ts`
  - `src/app/api/finance/reconciliation/**` (all routes)
- Impact: A VENDEDOR (seller) with valid session can curl `/api/finance/reports/dre?startDate=...&endDate=...` and download owner P&L. Ditto for cashier. Most use only `requireAuth` + `getCompanyId` — multi-tenant safe but role-irrelevant.
- Proposed fix: gate read with `finance.view`, write/POST with `finance.manage`. Memory note says permission enum is in `src/lib/permissions.ts`.
- Effort: 2 hours.

#### F-7. Subscription gating is layout-only, not API-level
- File: `src/middleware.ts:97-130` does NOT call `checkSubscription`. Only `src/app/(dashboard)/layout.tsx:28` does.
- Impact: A company in TRIAL_EXPIRED / SUSPENDED / PAST_DUE>7d still has all `/api/*` endpoints reachable by any authenticated user. They can keep creating sales, recording finance entries, even after their plan was canceled. Read-only mode (`subscriptionCheck.readOnly`) is purely UI suggestion.
- Proposed fix: middleware-level subscription check for `/api/*` (write endpoints), or shared `requireActiveSubscription()` helper in every POST/PATCH/DELETE route. Cache result in JWT/edge KV to avoid DB hit per request.
- Effort: 1 day.

#### F-8. Plan limits not enforced consistently
- File: `src/lib/plan-limits.ts:12`; only 3 grep'd usages (products/users/branches).
- Sales count (`SaleService.countActive`) exists but `maxSalesPerMonth` is NOT a plan limit field — no enforcement.
- Impact: Basic plan and Pro plan are functionally identical for usage. Customer pays Basic and can do unlimited sales/storage/etc.
- Proposed fix: extend `Plan` schema with `maxSalesPerMonth`, `maxOpenServiceOrders`, enforce in `SaleService.create` and `ServiceOrderService.create`.
- Effort: 1-2 days (UX for limit-reached, plus admin override).

#### F-9. `generateSaleEntries` silent failure has no monitoring or recovery
- File: `src/services/sale-side-effects.service.ts:430-442`
- Current: catches exception, logs JSON, continues. No `FinanceEntryBackfillQueue` table; no admin notification; no retry job.
- Impact: If `getChartAccountByCode("3.1.01")` fails (e.g., chart-of-accounts seed missed on a tenant), every sale silently lacks DRE rows. Memory notes a `backfill-expense-entries` exists — but for sales we have nothing. Owner sees R$ 0 revenue in DRE while sales table is full.
- Proposed fix: create `FinanceEntryRetry` table (`saleId`, `companyId`, `attempts`, `lastError`, `nextRetryAt`); cron job retries hourly. Alert admin after 3 failures.
- Effort: 1 day.

#### F-10. Refund finance entries swallowed too
- File: `src/app/api/sales/[id]/refund/route.ts:161-175`
- Same pattern as F-9: refund completes, restocks, marks REFUNDED, but if `generateRefundEntries` throws, DRE has revenue but not the reversal — **double-counts revenue forever**.
- Effort: shared with F-9.

#### F-11. Race condition: CashShift auto-close between sale finalize and CashMovement insert
- File: `src/services/sale.service.ts:357-434`, `applyPaymentsInTx` at line 218
- Current: Sale opens CashShift if none open (auto-open). But within the long transaction (timeout 30s), a concurrent operator can close the shift via `/api/cash/shift/close`. CashShift.status is checked once at the start, then `applyPaymentsInTx` happily inserts CashMovement into a now-closed shift — and `cashService.closeShift` already computed `closingExpectedCash` from movements at that moment.
- Impact: A cashier closing the till at 18:00 with R$ 5,000 declared; another seller finalizes a R$ 200 cash sale at 18:00:01 (same DB ts). The sale's CashMovement lands in the closed shift, but expectedCash was already snapshot. End: there's an extra R$ 200 in CashMovement but expectedCash says R$ 5,000. Discrepancy hidden until next-day report.
- Proposed fix: `closeShift` must `SELECT ... FOR UPDATE` the shift row, and `applyPaymentsInTx` must verify `status='OPEN'` inside the same tx (with `findFirst({ where: {id, status: 'OPEN'} })` + throw). Better: use SERIALIZABLE isolation or row-level lock.
- Effort: 1 day with proper concurrency test.

#### F-12. FIFO consumption race — same SKU, concurrent sales
- File: `src/services/finance-entry.service.ts:128-186` (`consumeInventoryFIFO`)
- Current: two `findMany` + `update qtyRemaining = qtyRemaining - consume`. No `SELECT FOR UPDATE`, no atomic check.
- Impact: Two parallel transactions consuming same lot → both read qty=10, both subtract 5, end qty=5 (should be 0). Cost calculation OK (each gets 5), but other consumers can now consume the negative remainder.
- Proposed fix: change update to conditional `updateMany({ where: { id: lot.id, qtyRemaining: { gte: consume } }, ... })` and if count=0 retry next lot. Like `atomicStockDebit` pattern.
- Effort: 4 hours.

#### F-13. `applyPaymentsInTx` for CREDIT_CARD computes settlementDate when fee is calc'd, but installmentAmount and CardReceivable.expectedDate use `addDays(now, 30*i)` regardless of acquirer T+N
- File: `src/services/sale-side-effects.service.ts:286-309`
- Current: Hard-coded 30-day intervals. Acquirer T+N is ignored. `payment.feePercent` was set but `payment.settlementDate` is the FIRST settlement, not Nth.
- Impact: 12x installment shows up as 12 monthly settlements in the receivables forecast, but Cielo D+30 from sale + D+60 + ... + D+390. The fee model has 30 days hardcoded too. If acquirer is 14 days, all forecasts are wrong.
- Proposed fix: pull `settlementDays` per installment from CardFeeRule, compute correct expectedDate per parcela.
- Effort: 1 day.

#### F-14. CARD_FEE entry uses `cashDate: payment.settlementDate` but `PAYMENT_RECEIVED` uses sale date — split temporality
- File: `finance-entry.service.ts:424` vs `382`
- Already covered in F-1, but worth noting independently: cardholder dashboard sees "fee deducted in 30 days" but "gross arriving today" — sign of a math bug.

#### F-15. Auto-match tolerance is 1% of payment amount — too loose for fraud detection
- File: `src/services/reconciliation-match.service.ts:70`
- Current: `amountTolerance = paymentAmount * 0.01` (R$ 10 on R$ 1,000 sale).
- Impact: A 1% skim by acquirer or fraud goes auto-matched as "EXACT" (confidence 70+). Should at least flag.
- Proposed fix: tighten to 0.1% AND flag entries with non-zero `differenceAmount` for review even if matched.
- Effort: 1 hour.

#### F-16. Reconciliation period margin is ±7 days at start, ±7 at end, but CSV's date can mismatch sale date by much more (esp. installments)
- File: `src/services/reconciliation-match.service.ts:33-38`
- Current: `periodStart - 7 days` to `periodEnd + 7 days`. For 12x credit installments settling D+30...D+390, payments outside this window are not loaded into `payments` array → never matched.
- Impact: Long-tail installments perpetually unmatched.
- Proposed fix: when reconciling card statements, query payments by `expectedSettlementDate` instead of `receivedAt`. Or expand window to D+400.
- Effort: 4 hours.

#### F-17. RENEGOTIATED status exists in enum but no logic creates/handles it
- File: `prisma/schema.prisma:3410` defines `RENEGOTIATED`; usage only in UI label (`financeiro/page.tsx:511`). No endpoint flips to it. No DRE rule for it.
- Impact: Dead enum value; if data ever hits it (e.g., manual SQL), reports may silently include/exclude inconsistently. The `getDynamicDRE` doesn't differentiate.
- Proposed fix: build renegotiation flow (new AR replaces old, both linked via `renegotiatedFromId`), or remove the enum value.
- Effort: 2-3 days for full flow, 30min to remove.

#### F-18. Asaas webhook trusts `event.id` for idempotency but allows the same payment to update Invoice multiple times in `updateMany`
- File: `src/app/api/webhooks/asaas/route.ts:127-159`
- Idempotency at BillingEvent level is OK, but `prisma.invoice.updateMany({where: {asaasPaymentId}})` updates ALL invoices with that asaas ID — if duplicate Invoice rows exist (data corruption), all flip to PAID. Better: `findFirst` + assert one match.
- Effort: 1 hour.

#### F-19. Asaas webhook on PAYMENT_CONFIRMED resets `currentPeriodStart = new Date()` losing prorated billing math
- File: `webhooks/asaas/route.ts:117-122`
- Current: `currentPeriodStart: new Date()` on every successful payment, but no `currentPeriodEnd` recalculation. Period accounting drifts.
- Effort: 1 hour.

#### F-20. Webhook does NOT verify the Asaas IP/HMAC, only a static shared token
- File: `src/lib/asaas.ts:216-230`, used at `webhooks/asaas/route.ts:46`
- Asaas supports HMAC signed webhooks in recent versions; static `asaas-access-token` header is fine but rotate exposure risk is high. Also no IP allow-list.
- Effort: 4 hours (rotate token in admin UI + add IP filter).

---

### MEDIUM — Process / correctness gaps

#### F-21. Sale cancel rolls back finance entries via `deleteMany`, but doesn't decrement card adquirente balance from F-2
- File: `src/services/sale.service.ts:677-704`
- Current: deletes FinanceEntry rows; for CASH/PIX decrements FinanceAccount balance; CREDIT_CARD also decrements adquirente balance (line 690-703). **But sale.service.cancel does correctly decrement CARD_ACQUIRER on cancel — the bug is that on the CREATE side, the increment happens too eagerly.** Note this asymmetry.
- See F-2 for resolution.

#### F-22. `calculateInstallments` last-parcela ajuste uses floor — can underbill last installment by cents
- File: `src/lib/installment-utils.ts:31-44`
- Current: `Math.floor((total / count) * 100) / 100`. E.g., 100.05 / 3 = 33.35, with remainder = 0; OK. But 10.00 / 3: baseAmount = floor(333.33)/100 = 3.33, total = 9.99, remainder = 0.01 → last parcela = 3.34. **OK.** But: rounding via `floor` causes baseAmount to be < truthful 1/3. Last parcela carries all remainder. Standard but UX is "you owe me R$ 3.33 + R$ 3.33 + R$ 3.34" — fine for BR.
- No fix needed beyond document.

#### F-23. Card fee `feePercent` semantics ambiguous in DB vs UI
- File: `src/services/card-fee.service.ts:54-58`, `prisma/schema.prisma:77` (`Decimal(5,4)`)
- Current: Seed values are `0.0199` meaning 1.99%. UI POST to `/api/card-fees` just passes `body.feePercent` directly. If user types `1.99` into the form thinking percent, DB stores `1.99`, calc `100 * 1.99 = R$ 199 fee`. There's no input transform.
- Impact: silently overcharges or undercharges depending on UI.
- Proposed fix: define a clear contract — DB stores fraction (0.0199 = 1.99%); UI displays/inputs as percent and converts.
- Effort: 4 hours including migration to validate existing rows.

#### F-24. Cashback usage not in DRE
- File: `finance-entry.service.ts` has no entry type for cashback used.
- `cashbackUsed` reduces `totalAfterCashback` in sale, but the discount is not recorded as a deduction in DRE. Receita is `sale.total` (which already excludes cashbackUsed via `applyCashback`). But where is the cashback liability accounted for?
- Cashback ganho = future liability (passivo); used = liability discharged. Today neither is in DRE/balance.
- Effort: 1 day (new ChartOfAccounts entry + entries on earn/spend).

#### F-25. CASH closing reconciles only `method = "CASH"` movements
- File: `src/services/cash.service.ts:115-122`
- Correct in spirit (you only count physical cash in drawer), but if a refund was made via `CASH` direction OUT, it's subtracted from `closingExpectedCash`. OK so far. But if a sangria/withdrawal uses `method = "PIX"` (line 33 schema allows it), it doesn't decrement physical cash — correct again. But: it also doesn't decrement PIX FinanceAccount balance. So a "PIX sangria" silently happens with no effect.
- Effort: 2 hours.

#### F-26. `cashService.closeShift` recomputes `closingExpectedCash` purely from movements in DB, but never compares against `openingFloatAmount`
- File: `src/services/cash.service.ts:115-122`
- Actually it includes opening movement (`type: OPENING_FLOAT, direction: IN`) so it includes opening — verify by reading creation (line 60-75). Yes, OPENING_FLOAT IN is added. Good.
- BUT: if `openingFloatAmount == 0`, no movement is created (line 60 condition `> 0`). Then `closingExpectedCash` excludes opening (which is 0). OK. Edge: company seeds opening = 0; cashier puts in R$ 50 mid-shift via SUPPLY; ok. **No fix needed.**

#### F-27. Refund proportional cost calc divides by `saleItem.qty` but if qty=0 (zero-qty item) → division by zero
- File: `src/app/api/sales/[id]/refund/route.ts:80`
- Defensive: `if (qtyReturned < saleItem.qty)` — only triggered if qty > qtyReturned so qty > 0. Safe.
- No fix needed.

#### F-28. `getDynamicDRE` ignores entries where `entryDate` is `null` for crediário
- File: `finance-report.service.ts:39-43`
- `where.entryDate.gte/lte` — STORE_CREDIT payment entries have `entryDate = receivedAt ?? sale.completedAt` set (not null) but `cashDate = null`. So DRE picks them up in `getTotal("PAYMENT_RECEIVED", "DEBIT")` — but DRE doesn't actually report `PAYMENT_RECEIVED` at all (look at `getDynamicDRE`: only SALE_REVENUE, REFUND, COGS, CARD_FEE, COMMISSION_EXPENSE, EXPENSE). So receipt of a crediário parcel doesn't move DRE — correct (revenue is on sale date, not receipt).
- BUT: when the customer pays a crediário parcel, the `accounts-receivable PATCH` only creates a `CashMovement` (line 535) — **no FinanceEntry is created for the actual cash receipt against AR**. So DRE remains static (correct), but cash flow `getCashFlow` queries `cashDate { not null }` — and there's NO FinanceEntry rows for that payment. Cash flow MISSES crediário receipts entirely.
- Impact: cash flow shows revenue + COGS but not the actual money coming in from old crediários. Owner sees less money than truly arrived.
- Effort: 1 day to add a `generateAccountReceivablePaymentEntry` and call it from `accounts-receivable PATCH` and `receive-multiple`.

#### F-29. `accounts-receivable` POST allows creating AR with arbitrary `amount` but no chart-of-accounts entry
- File: `src/app/api/accounts-receivable/route.ts:260-346`
- Manual AR creation creates the row but no FinanceEntry. Receita is not booked. DRE will never reflect this AR even when paid.
- Effort: 4 hours.

#### F-30. `differenceCash` allowed as any value with justification — no upper bound or admin alert
- File: `src/services/cash.service.ts:128-134`
- R$ 100,000 sobra or falta is permitted with a string justification. No notification to manager.
- Proposed fix: threshold (e.g., > R$ 50) sends admin notification; > R$ 500 requires GERENTE approval.
- Effort: 4 hours.

#### F-31. Multi-cashier handoff is not supported
- File: `src/services/cash.service.ts`
- Schema has `openedByUserId`, `closedByUserId` but no concept of mid-shift handoff or operator change. Two cashiers sharing one shift cannot be attributed individually.
- Effort: 1-2 days (CashShiftOperator child table).

#### F-32. Cash shift can be opened by any user even without cash_register assigned
- File: `src/services/sale.service.ts:381-393`
- Auto-open uses first active CashRegister or `null`. If null, the shift has no register → some reports filtering by register exclude it.
- Effort: 2 hours.

---

### LOW — Cosmetic / minor

#### F-33. Memory note about `/api/cash-registers/[id]/report` not existing is OUTDATED
- The historical report exists at `src/app/(dashboard)/dashboard/caixa/[id]/relatorio/page.tsx` (client-side) and uses `/api/cash/shift/[id]` (`src/app/api/cash/shift/[id]/route.ts`). The endpoint is real now.
- Action: update MEMORY.md.

#### F-34. `cash-registers/[id]/transactions` strips `direction` from response
- File: `src/app/api/cash-registers/[id]/transactions/route.ts:46-53`
- Data mapper does not include `direction`. Consumer expecting IN/OUT will get undefined. Cosmetic but breaks UI clients.
- Effort: 30 minutes.

#### F-35. `Math.round(x*100)/100` rounding used everywhere — not banker's rounding
- Bank rounding (round-half-to-even) is the BR financial standard for tax authorities. Current code uses round-half-up. Diff is bps for small values; for high-volume sums it slightly inflates rounding artifacts.
- Effort: 4 hours to centralize via `lib/money.ts`.

#### F-36. Currency stored as Decimal(12,2) — not cents
- Tradeoff: Decimal is fine for BR (no Bitcoin-style precision issues). Just be aware: `Math.round` after numeric ops loses Decimal precision early. All arithmetic done as `Number(decimal)` not as Decimal ops → precision can drift on long chains. (`finance-report.service.ts:55` etc.)
- Recommendation: keep Decimal in calculations via `Prisma.Decimal` ops; only `.toNumber()` at serialization boundary.
- Effort: 2 days for full refactor.

#### F-37. PostHog `trackServer` in webhook can throw — wrapped in switch case but not in try/catch
- File: `webhooks/asaas/route.ts:138-142`
- If PostHog network fails, payment confirmation fails and Asaas retries; idempotency saves us but PostHog outage = retry storm.
- Effort: wrap in try/catch — 5 minutes.

#### F-38. Missing rate-limit on Asaas webhook endpoint
- File: `webhooks/asaas/route.ts:43`
- Currently relies on Asaas being well-behaved; an attacker who learns the static token can DDoS the upsert.
- Effort: 1 hour.

#### F-39. `generateAccountPayableExpenseEntry` does NOT include branchId in the unique key but accepts branchId — multi-branch tenant could collide on same accountPayable being paid twice from different branches
- File: `finance-entry.service.ts:614-654`
- Unique key is `(companyId, sourceType, sourceId, type, side)`. Same accountPayable cannot be paid in two branches (sourceId is the same AP). Probably OK by design but document.

---

## Reconciliation Pain Points

1. **CSV import is destructive** — `prisma.reconciliationItem.deleteMany` on re-import (`import/route.ts:56`). If a user re-uploads after partial manual resolution, all resolutions are wiped. Should soft-replace.
2. **No duplicate detection across batches** — same NSU/auth code can appear in two batches; auto-match marks each as `AUTO_MATCHED` against different SalePayments. There's no global check that a SalePayment is already matched in another batch. **Result: a single sale payment can be "confirmed" by two distinct acquirer statements.**
3. **No fee-aware reconciliation** — CSV has `feeAmount`/`netAmount` columns but parser stores them; matcher ignores them. Differences explained by fees are not auto-resolved.
4. **No partial match for installments** — a 12x sale generates 12 CardReceivable rows; matcher treats them as 12 unrelated payments. CSV from acquirer also has 12 rows. But matching iterates SalePayments (1 entry for the whole sale, with installments=12). Mismatch: CSV has 12 rows, SalePayment has 1 row with R$ total/12 — auto-match never finds equal amounts. **Reconciliation effectively unusable for parcelado.**
5. **No "ignore similar" rule** — `reconciliation-rules` table exists but no UI/endpoint applies them during auto-match.

---

## Suggested New Financial Features

1. **Cash flow forecasting** — already have CardReceivable.expectedDate and AR.dueDate. Build a 90-day forward projection in `finance-report.service.ts`: combine cash balance + expected card settlements + AR + recurring expenses (despesas-recorrentes exists). Show "saldo projetado em D+30".
2. **Anomaly detection** — daily cron computes z-score on (sales, expenses, discounts, refunds). Alert if today's value > 2σ from 30-day rolling avg. Especially useful for fraud (giant discount, abnormal refund volume).
3. **Cohort-based AR aging** — current view is just `OVERDUE` flag. Add 0-30, 31-60, 61-90, 90+ buckets per customer, per branch, with trend lines.
4. **Auto-reconciliation rules** — store per-acquirer adjustments ("Cielo always charges 0.5% extra"), auto-resolve differences within tolerance.
5. **Caixa "blind" closing** — cashier enters declared cash WITHOUT seeing expected; reveal diff after submit. Reduces fraud.
6. **Multi-currency stub** — schema is BR-only; future-proof by adding `currency` column to FinanceEntry, default BRL.
7. **Tax tracking** — DRE has no ICMS, ISS, PIS, COFINS breakdown. For an optical store doing services + products, sub-totals are critical.
8. **Card receivable assignment / antecipação** — if owner uses an antecipadora, current model can't track the discount paid for early settlement.

---

## Quick Wins (< 4 hours each)

1. Add `requirePermission("finance.view")` to all `/api/finance/**` read routes — **2 hours, ships compliance.**
2. Wrap `webhooks/asaas/trackServer` in try/catch — **5 minutes.**
3. Tighten auto-match tolerance to 0.5% and flag differences — **30 minutes.**
4. Fix `cash-registers/[id]/transactions` to include `direction` — **15 minutes.**
5. Add `rateLimit` to `/api/webhooks/asaas` — **30 minutes.**
6. Document `feePercent` semantics (fraction vs %) with input validation — **1 hour.**
7. Update MEMORY.md re: cash report endpoint — **5 minutes.**
8. Remove `RENEGOTIATED` enum value if unused or add a stub endpoint — **30 min to remove.**
9. Add `if (!financeAccount && method === 'CREDIT_CARD')` warning log so observability captures missing acquirer account — **15 minutes.**
10. Change `accountPayable` reversal to NOT use `deleteMany` — use soft-delete with `reversedAt` field — **2 hours, audit trail.**

---

## Test Plan for QA Validation

### Suite A: Double-entry integrity
1. Create cash sale R$ 100 → assert exactly 3 FinanceEntry rows: SALE_REVENUE DEBIT(100), COGS DEBIT(cost), PAYMENT_RECEIVED DEBIT(100).
2. Sum debits across COGS+SALE_REVENUE+PAYMENT_RECEIVED+CARD_FEE for the sale → expect to equal sum credits to ContasAReceber + Receita + CMV.
3. Apply 10% discount → assert SALE_REVENUE CREDIT row (discount) and ContasAReceber net.
4. Cancel sale → assert all entries vanish (deleteMany behavior) and CardReceivables vanish.
5. Refund 50% of a sale → assert REFUND DEBIT half + COGS CREDIT half + PAYMENT_RECEIVED CREDIT half. Verify cancel of refund (no current flow — verify it's blocked).

### Suite B: Crediário & Penalty
1. Create STORE_CREDIT sale R$ 300 / 3 parcelas, due dates D+30, D+60, D+90.
2. On D+35 (5 days overdue, no grace), assert `calculatePenalties` returns fine = 2% × 100 = 2, interest = 5/30 × 1% × 100 = 0.166. Total = 102.17.
3. With grace=5, refresh — assert daysLate=0, fine=0.
4. Pay parcela with discount R$ 5 → assert AR.status RECEIVED, receivedAmount = 95, discountAmount=5, CashMovement IN R$ 95.
5. Reverse the payment → BUG (F-3): assert AR returns to PENDING but CashMovement still exists. Verify expected fix.
6. Receive parcela partial (R$ 50 of R$ 100) twice → assert two AR_Payment rows OR (current state) bug F-4 overwrites — verify either way.
7. Trigger RENEGOTIATED status — verify no path exists today.

### Suite C: Caixa
1. Open shift R$ 100 float.
2. Run 3 cash sales R$ 50 each.
3. Sangria R$ 80.
4. Reforço R$ 30.
5. Expected = 100 + 150 - 80 + 30 = 200. Verify `closingExpectedCash` = 200.
6. Declare 198 → require justification, diff = -2.
7. While shift open, simulate a second tab trying to close. Assert 2nd request fails (lock).
8. **Race test**: open shift, start a sale POST that sleeps 5s in finance, in parallel close shift. Verify what happens (likely F-11 reproduces).
9. Verify Z-report at `/dashboard/caixa/[id]/relatorio` matches movements.

### Suite D: FIFO race
1. Seed 1 product, 1 lot, 10 units.
2. Two parallel POST /api/sales for 6 units each, same product.
3. Assert one fails with "estoque insuficiente" (atomicStockDebit handles); FIFO consumption should agree.
4. Verify InventoryLot.qtyRemaining = 0 (not negative).

### Suite E: Card flow
1. R$ 1000 12x CREDIT_CARD sale, VISA.
2. Verify 12 CardReceivable rows with expectedDates D+30, D+60, ..., D+360.
3. Verify FinanceAccount.balance for CARD_ACQUIRER incremented R$ 1000 (currently bugged per F-2).
4. Compute DRE for the month — verify SALE_REVENUE +1000.
5. Compute cash flow for D+30 — assert inflow appears (currently appears on D+0, per F-1).
6. Settle one CardReceivable manually — verify no FinanceEntry generated (no path exists today).

### Suite F: Asaas
1. Mock POST /api/webhooks/asaas with PAYMENT_CONFIRMED, valid token. Assert subscription ACTIVE, Invoice PAID.
2. Replay same event → assert 200 ok with `duplicate: true`, no DB changes.
3. POST with wrong token → 401.
4. POST without subscription found (deleted) → BillingEvent saved, no crash.
5. Suspend a subscription via PAYMENT_OVERDUE event. Then test: can /api/sales still create sales? **Expected per F-7: yes, no API-level enforcement.**

### Suite G: Reconciliation
1. Create 3 card sales: NSU 111 R$ 100, NSU 222 R$ 200, NSU 333 R$ 50.
2. CSV with rows: NSU=111 R$ 100, NSU=222 R$ 199 (R$ 1 fee), NSU=999 R$ 75.
3. Auto-match — assert 1 EXACT_MATCH (111), 1 SUGGESTED with diff -R$ 1 (222 — should be flagged), 1 UNMATCHED (999).
4. Re-import same CSV → bug F-(deleteMany): existing resolutions wiped.

### Suite H: Permission gating
1. As VENDEDOR role, GET /api/finance/reports/dre → currently 200 with full P&L. **Expected after fix: 403.**
2. As GERENTE role with `finance.view` → 200.
3. As CAIXA with no finance perms → 403 on DRE; 200 on /api/cash/shift.

### Suite I: Subscription
1. Set company subscription to TRIAL_EXPIRED.
2. Try GET /dashboard → blocked by layout.
3. Try POST /api/sales directly via curl → **currently succeeds**. After fix should 402/403.

---

## Files Most Relevant (absolute paths)

- `/Users/matheusreboucas/PDV OTICA/src/services/finance-entry.service.ts`
- `/Users/matheusreboucas/PDV OTICA/src/services/finance-report.service.ts`
- `/Users/matheusreboucas/PDV OTICA/src/services/finance-setup.service.ts`
- `/Users/matheusreboucas/PDV OTICA/src/services/cash.service.ts`
- `/Users/matheusreboucas/PDV OTICA/src/services/card-fee.service.ts`
- `/Users/matheusreboucas/PDV OTICA/src/services/sale.service.ts`
- `/Users/matheusreboucas/PDV OTICA/src/services/sale-side-effects.service.ts`
- `/Users/matheusreboucas/PDV OTICA/src/services/reconciliation-match.service.ts`
- `/Users/matheusreboucas/PDV OTICA/src/services/reconciliation-parser.service.ts`
- `/Users/matheusreboucas/PDV OTICA/src/services/reconciliation-resolution.service.ts`
- `/Users/matheusreboucas/PDV OTICA/src/services/stock.service.ts`
- `/Users/matheusreboucas/PDV OTICA/src/lib/asaas.ts`
- `/Users/matheusreboucas/PDV OTICA/src/lib/penalty-utils.ts`
- `/Users/matheusreboucas/PDV OTICA/src/lib/installment-utils.ts`
- `/Users/matheusreboucas/PDV OTICA/src/lib/subscription.ts`
- `/Users/matheusreboucas/PDV OTICA/src/lib/plan-limits.ts`
- `/Users/matheusreboucas/PDV OTICA/src/lib/plan-features.ts`
- `/Users/matheusreboucas/PDV OTICA/src/lib/product-price.ts`
- `/Users/matheusreboucas/PDV OTICA/src/lib/payment-methods.ts`
- `/Users/matheusreboucas/PDV OTICA/src/middleware.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/webhooks/asaas/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/billing/checkout/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/finance/reports/dre/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/finance/reports/cash-flow/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/finance/dashboard/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/finance/bi/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/finance/entries/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/finance/card-receivables/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/finance/reconciliation/batches/[id]/import/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/accounts-receivable/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/accounts-receivable/receive-multiple/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/accounts-receivable/[id]/receipt/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/sales/[id]/refund/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/cash/shift/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/cash/shift/close/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/cash/shift/[id]/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/cash-registers/[id]/transactions/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/api/card-fees/route.ts`
- `/Users/matheusreboucas/PDV OTICA/src/app/(dashboard)/dashboard/caixa/page.tsx`
- `/Users/matheusreboucas/PDV OTICA/src/app/(dashboard)/dashboard/caixa/[id]/relatorio/page.tsx`
- `/Users/matheusreboucas/PDV OTICA/prisma/schema.prisma`

---

End of report.
