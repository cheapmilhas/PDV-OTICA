# Reviewer A — Risk & Impact Analysis
**Role**: Reviewer A of 3 | Lens: Risk, Money Loss, Data Leakage, Legal Exposure
**Date**: 2026-05-26
**Sources**: 7-agent audit (Agent 1 Security, Agent 2 Database, Agent 3 Backend, Agent 4 Frontend/PDV, Agent 5 Design, Agent 6 Financeiro, Agent 7 OS/Crediário)

---

## TL;DR — Top 5 Issues That Block Production

**This SaaS is NOT shippable to real customers today.** The following five issues alone disqualify it:

1. **Hardcoded SUPER_ADMIN password `admin123` + unlocked seed endpoint** (Agent 1/C2, C4) — Any admin account compromise gives attacker full SUPER_ADMIN via a single POST. Password is documented in the repo. This is not a theoretical risk: it is a current live credential.

2. **Multi-tenant isolation by convention only — tenant extension is dead code** (Agents 1, 2, 3 — cross-confirmed) — One missing `companyId` filter leaks any tenant's entire dataset. The defensive `prisma-tenant.ts` was built but never wired. IDOR already confirmed exploitable in the permissions endpoint.

3. **Prescription images on a PUBLIC Supabase bucket** (Agents 1, 7 — cross-confirmed) — Health/medical PII (ophthalmological measurements, doctor CRM, patient CPF embedded in image) is at a world-readable URL. This is an active LGPD Art. 11 violation the moment the first real patient record is stored.

4. **PDV `window.location.href` aborts in-flight sale** (Agent 4/C1) — The most critical business operation silently fails: crediário customers never receive their boleto/carnê printout; HTTP errors are swallowed; the cashier sees the sales list with no indication of failure. High probability of duplicate sale entries or lost crediário receipts in a live store within the first week.

5. **Cashback race condition + AR reversal leaves ghost cash** (Agents 3/HIGH-1 and 6/F-3) — Two concurrent bugs: (a) cashback balance can go negative from simultaneous sales; (b) reversing a received account receivable leaves a CashMovement that isn't rolled back — cashier closes the till believing they have phantom money. Either fires under normal multi-cashier operation.

---

## Unified Risk-Ranked Table

| ID | Source(s) | Finding | Likelihood (1-5) | Blast Radius (1-5) | Score |
|---|---|---|---|---|---|
| **R01** | A1/C2+C4 | Admin seed resets SUPER_ADMIN to `admin123`; any admin session triggers it | 4 | 5 | **20** |
| **R02** | A1/C1, A2/C3, A3 | Multi-tenant IDOR: permissions endpoint + dead tenant extension; one missed `companyId` leaks any tenant | 4 | 5 | **20** |
| **R03** | A1/C6, A7/H1 | Prescription images on public Supabase bucket — LGPD Art. 11 violation, health PII | 5 | 4 | **20** |
| **R04** | A4/C1 | `window.location.href` in PDV finalize aborts in-flight POST: no error shown, carnê dialog never fires, cashback dialog killed | 5 | 4 | **20** |
| **R05** | A6/F-3 | AR reversal does NOT reverse CashMovement or FinanceEntry — phantom cash in caixa fechamento | 4 | 4 | **16** |
| **R06** | A3/HIGH-1 | Cashback race condition: balance check outside tx, debit inside — balance goes negative | 4 | 4 | **16** |
| **R07** | A6/F-1, F-2 | CREDIT_CARD cashDate = sale date (not settlement); balance double-counted — owner makes withdrawal decisions on false data | 5 | 3 | **15** |
| **R08** | A1/C3, A2/C3 | Tenant extension dead code — systematic risk for every new endpoint written from now on | 3 | 5 | **15** |
| **R09** | A6/F-7 | Subscription gating is layout-only — expired/suspended tenants can still call all write APIs | 4 | 3 | **12** |
| **R10** | A1/C5, A3/HIGH-2 | Rate limiting: in-memory only (resets on cold start) + no limit on login/registration endpoints — credential stuffing, DoS | 4 | 3 | **12** |
| **R11** | A6/F-4 | Partial AR payment overwrites `receivedAmount` instead of accumulating — second partial payment destroys first payment record | 4 | 3 | **12** |
| **R12** | A1/C8 | Impersonation JWT passed in URL querystring — leaks into browser history, Referer headers, PostHog autocapture | 3 | 4 | **12** |
| **R13** | A4/C3 | Duplicate payment IDs from `Date.now()` — rapid clicks produce same ID; `removePayment` removes wrong entry, silent data loss | 4 | 3 | **12** |
| **R14** | A6/F-11 | CashShift race: concurrent sale can post CashMovement into an already-closed shift | 3 | 4 | **12** |
| **R15** | A7/H2 | OS status machine not enforced server-side — any API caller can jump DRAFT → DELIVERED | 4 | 3 | **12** |
| **R16** | A1/H1 | `.env` with live DB credentials + NEXTAUTH_SECRET on developer workstation — rotation needed | 3 | 4 | **12** |
| **R17** | A6/F-6 | Finance APIs (DRE, cash-flow, P&L) lack permission gates — VENDEDOR/CAIXA can download full P&L | 5 | 2 | **10** |
| **R18** | A5/CRITICAL | Brand color changes from indigo to teal on login — conversion-killing trust gap | 5 | 2 | **10** |
| **R19** | A2/C2, A3/HIGH-3 | N+1 queries in sale.create + sequential creates in tx loop — 10-item sale takes 3-8s, P2028 timeout risk | 5 | 2 | **10** |
| **R20** | A1/H4 | Asaas webhook HMAC not verified — forged PAYMENT_CONFIRMED can activate free subscriptions | 2 | 5 | **10** |
| **R21** | A6/F-9 | `generateSaleEntries` silent failure — sale succeeds, DRE has hole, no recovery queue | 3 | 3 | **9** |
| **R22** | A6/F-28 | Cash flow misses crediário receipts entirely — no FinanceEntry created for AR payments | 5 | 2 | **10** |
| **R23** | A7/H3, A7/H2 | Kanban transitions conflict with service-layer rules — APPROVED→IN_PROGRESS allowed in UI, will return 400 once H2 fixed | 4 | 2 | **8** |
| **R24** | A4/C2 | Stale closure in PDV F-key handler — F4 may bypass seller check with stale `sellers` after mount | 3 | 3 | **9** |
| **R25** | A1/H5 | Finance entry creation doesn't validate `branchId` ownership — cross-company finance entries possible | 3 | 3 | **9** |
| **R26** | A6/F-12 | FIFO inventory consumption race — same lot consumed twice under concurrent sales | 2 | 4 | **8** |
| **R27** | A2/C1 | Audit middleware unreliable — updateMany/deleteMany writes not captured; fire-and-forget on serverless loses records | 4 | 2 | **8** |
| **R28** | A1/H2 | No CSP header — XSS blast radius maximized; combined with `innerHTML` patterns in print modals | 2 | 4 | **8** |
| **R29** | A7/L1 | Debug `console.log` exposes CPF + full OS payload in browser DevTools in production | 5 | 1 | **5** |
| **R30** | A5/HIGH | Login/registro still use AI blue→purple gradient — kills trust at conversion point | 4 | 2 | **8** |

---

## Top 10 Must-Fix Before Real Customers

Ranked by score, then urgency:

### 1. R01 — Rotate production `admin123` password + disable seed endpoint immediately
**Score: 20 | Effort: 15 min**
This is not a design flaw — it is a current, exploitable backdoor. Add `if (process.env.SEED_ENABLED !== '1') return 404` to the seed route. Set a 16+ char secret in production. Do this before any other work.

### 2. R03 — Make Supabase prescription bucket private, use signed URLs
**Score: 20 | Effort: 4h | LGPD Art. 11**
First real patient registration stores health PII at a world-readable URL. LGPD fine risk. Replaces `getPublicUrl` with `createSignedUrl(300s)`, add a proxy endpoint for authenticated access. Every day without this fix is an active data exposure.

### 3. R04 — Delete `window.location.href` from `modal-finalizar-venda.tsx:215`
**Score: 20 | Effort: 5 min**
One line of code that kills the most important user flow. Remove line 215. The parent already calls `router.push` on success. This is the single highest-ROI fix in the entire audit — 5-minute change, eliminates carnê dialog loss, error toast loss, cashback dialog loss, and duplicate-submission risk.

### 4. R02 — Fix cross-tenant IDOR in permissions endpoint + add `companyId` guard
**Score: 20 | Effort: 1h**
Patch `PermissionService.setUserPermission` and `getUserEffectivePermissions` to verify `userId.companyId === session.companyId`. Separately, wire `prisma-tenant.ts` (already written — just not imported) or add a CI lint rule. The IDOR is the immediate fire to put out.

### 5. R05+R06 — Fix AR reversal ghost cash + cashback race condition
**Score: 16+16 | Effort: 2-3h each**
These two bugs will appear in a live store within the first week of real operation. AR reversal: create a compensating CashMovement on reversal inside a transaction. Cashback: move balance check + debit inside a single `$executeRaw` with `WHERE balance >= cashbackUsed`.

### 6. R07 — Fix CREDIT_CARD cashDate to use `settlementDate`, not sale date
**Score: 15 | Effort: 1 day**
An owner with R$100k/month in card sales will see permanently inflated "available cash" and make wrong withdrawal decisions. This is the kind of bug that destroys trust in a financial product the moment someone notices — usually at a moment of financial stress.

### 7. R10 — Replace in-memory rate limiter with Upstash/Redis
**Score: 12 | Effort: 2-3h**
The in-memory rate limiter self-documents that it provides zero protection in production (cold starts reset state). Login and registration are open to credential stuffing and signup spam. Upstash free tier is sufficient.

### 8. R17 — Add `requirePermission("finance.view")` to all `/api/finance/**` routes
**Score: 10 | Effort: 2h**
A VENDEDOR (the most common role) can pull the owner's full P&L with a single API call. Takes 2 hours. Ships privacy compliance. Should have been in from day one.

### 9. R11 — Fix partial AR payment to accumulate instead of overwrite
**Score: 12 | Effort: 2 days for proper fix**
Stores that do crediário with partial payments (common in Brazil) will silently lose payment history records. The second partial payment overwrites `receivedAmount`. This destroys auditability and trust. Quick fix: at minimum refuse partial payment via `receive-multiple` until the `AccountReceivablePayment` model is built.

### 10. R09 — Add API-level subscription enforcement
**Score: 12 | Effort: 1 day**
Expired/suspended tenants bypass the gating entirely since it's layout-only. This is a billing hole — customers who stop paying can keep using the full product. Add `requireActiveSubscription()` helper to all POST/PATCH/DELETE routes, or check in middleware.

---

## Cross-Confirmed Issues (Multiple Agents, Higher Confidence)

These findings were independently caught by 2+ agents — treat confidence as near-certain:

| Finding | Agents | Consensus |
|---|---|---|
| Multi-tenant dead `prisma-tenant.ts` extension | A1, A2, A3 | **3 agents** — it exists, it's correct, it's not imported. Zero disagreement. |
| Prescription images on public Supabase bucket | A1, A7 | Critical LGPD violation, independently identified |
| In-memory rate limiter provides no production protection | A1, A3 | A1 flags it for login; A3 flags it for financial endpoints specifically |
| N+1 queries in sale.create + sequential creates in transaction | A2, A3 | A2 quantifies 80-100 round-trips for a 10-item sale; A3 confirms the installment loop specifically |
| `generateSaleEntries` silent failure leaves DRE holes | A3, A6 | A3 identifies it as arch issue; A6 maps exact financial consequence |
| `admin123` hardcoded password in seed + production | A1 only, but confirmed by audit spec | |
| Finance APIs lack permission gates | A6 identifies specifically; A1 flags broader permission patterns | |
| Cashback race condition | A3 identifies the code path; A6 confirms financial impact |
| Asaas webhook only verified by static token (no HMAC/IP) | A1, A6 | A1 from security lens; A6 from financial integrity lens |

---

## Singleton High-Confidence Finds

Issues caught by only one agent that deserve trust based on evidence quality:

**A4/C1 — `window.location.href` aborting in-flight sale** (Agent 4 only): The `prod-04-after-finalize.png` QA screenshot (21KB = near-empty page) is concrete forensic evidence this is already happening in production testing. Agent 4's reading of the code path is correct and the fix is surgical. **This is the highest-ROI fix in the codebase.**

**A6/F-3 — AR reversal ghost cash**: Agent 6 traced the exact code path where `CashMovement` is created but never compensated on reversal. This is an accounting integrity hole that a store owner would notice within 30 days of real use and blame the software for.

**A6/F-4 — Partial payment overwrites**: Agent 6 found that `receivedAmount` is overwritten (not accumulated) on second partial payment. This is a quiet data destruction bug that passes all unit tests if none test the partial-then-partial scenario.

**A7/H2 — OS status machine never enforced server-side**: Agent 7 ran `grep -rn "validateStatusTransition"` and confirmed the helper exists but has zero callers. The fix is two lines. The impact is that any client with a valid session token can mark any OS as DELIVERED regardless of production state.

**A5/CRITICAL — Brand color split**: Agent 5 is the only one to catch this, but it's visually verifiable. Landing=indigo `#6366F1`, App=teal `hsl(172 60% 32%)`. This is a conversion problem: a buyer who loves the marketing site logs in and their first impression is "this is a different product." The CSS comment literally says "REMOVED: old purple→cyan gradient (the AI look)" — then the login page still has that exact gradient.

**A6/F-11 — CashShift race condition**: Agent 6 identifies a narrow but financially significant window where a sale can post CashMovement into an already-closed shift. A cashier who closes at 18:00 and a customer whose sale lands at 18:00:01 creates a cash discrepancy that shows in the next day's opening. Real stores will hit this within weeks.

---

## Conflicts and Disagreements Between Agents

### Conflict 1: Agent 3 says "No CRITICAL issues found" — Agent 1 says there are 6 CRITICAL

**Agent 3's verdict**: "No CRITICAL security issues found."
**Agent 1's verdict**: 6 CRITICAL findings including SUPER_ADMIN backdoor and cross-tenant IDOR.

**My judgment**: Agent 1 is correct. Agent 3 scoped its "CRITICAL" definition to backend code quality (SQL injection, auth bypass in core paths) and explicitly excluded security findings it assumed Agent 1 would cover. This isn't a conflict — it's a scope boundary. However, Agent 3's summary statement is dangerously misleading if read in isolation. The SaaS has multiple critical security failures.

### Conflict 2: Agent 4's CRITICAL label on PDV issues vs. standard severity definitions

**Agent 4** calls `window.location.href` and the stale closure CRITICAL. Most backend agents would rate these HIGH.

**My judgment**: Agent 4's CRITICAL is justified for business context. A POS system where the finalize action silently aborts in-flight is not "HIGH" — it is the core workflow failing. In an optical shop with customers at the counter, this produces visible embarrassment and cashier confusion. The QA screenshot (`prod-04-after-finalize.png`, 21KB) suggests this is already observable. Agree with Agent 4's severity.

### Conflict 3: Audit middleware — Agent 2 rates C-1 CRITICAL, Agent 1 doesn't cover it

**Agent 2** rates the broken audit middleware as CRITICAL (compliance/forensics hole).
**Agent 1** covers the PII-in-logs issue (H7) but doesn't rate the middleware architecture as CRITICAL.

**My judgment**: This is a naming disagreement rather than a factual conflict. Agent 2's C-1 is more accurately HIGH — it is a real compliance gap (audit log is the LGPD Art. 37 record of processing requirement), but it doesn't create an active data leak or money loss vector today. I rate it HIGH, not CRITICAL. It belongs in the second wave of fixes, not the minimum shipment gate.

### Conflict 4: Agent 7/C1 (missing `requireAuth` on lab endpoint) — severity contested

**Agent 7** calls this CRITICAL. However, Agent 7's own analysis says `getCompanyId()` calls `auth()` internally and throws if absent.

**My judgment**: This is a valid belt-and-suspenders finding but not CRITICAL as labeled. The immediate risk of unauthenticated access is low (the helper indirectly checks). However, the maintenance risk is HIGH — if `getCompanyId()` is refactored, the guard silently disappears. This is a 2-minute fix (`await requireAuth()` first line) and should be done, but it doesn't block production today.

### Conflict 5: Agent 5 (design) vs. shipping reality

**Agent 5** grades overall design C+, identifies brand color split as CRITICAL-level design failure affecting trust and conversion.

**My judgment**: The brand color split is real and damaging, but it is NOT a production blocker at the functional level. I include it in the risk table at score 10 because it will materially impact conversion for the first real customers. It's a "fix in sprint 2" issue, not a "do not ship" issue — unlike the security and financial bugs above. Agent 5's framing is correct but it competes for attention with issues that cause actual data loss and legal exposure.

---

## Verdict: Is This SaaS Shippable to Real Customers Today?

**No. Not in current state.**

The blocking issues are not bugs that might surface eventually — several are already active:
- The SUPER_ADMIN password `admin123` is a current production credential that can be reset by any admin account.
- The prescription image bucket is presumably already public (that's the default Supabase state and the code explicitly calls `getPublicUrl`).
- The `window.location.href` abort is already visible in the QA screenshot (`prod-04-after-finalize.png`).
- The cashback race and AR reversal will fire under real concurrent usage.

### Minimum Fix-List to Ship (by priority)

**Day 0 (30 min — do right now):**
- [ ] Rotate `admin123` SUPER_ADMIN password in production
- [ ] Add `if (process.env.SEED_ENABLED !== '1') return 404` to `/api/admin/seed`
- [ ] Delete `window.location.href = "/dashboard/vendas"` from `modal-finalizar-venda.tsx:215`
- [ ] Add `await requireAuth()` to `src/app/api/laboratories/[id]/service-orders/route.ts`
- [ ] Remove `console.log` debug statements from `nova/page.tsx` and `clientes/[id]/page.tsx` (CPF in browser console)

**Day 1 (critical security + financial integrity):**
- [ ] Add `companyId` guard to `PermissionService.setUserPermission` and `getUserEffectivePermissions` (closes IDOR, 1h)
- [ ] Make Supabase prescription bucket private; replace `getPublicUrl` with `createSignedUrl(300s)` (4h)
- [ ] Fix cashback race: move balance check+debit inside tx as `$executeRaw` with `WHERE balance >= X` (2h)
- [ ] Fix AR reversal to create compensating CashMovement (2h)

**Day 2 (financial correctness that users will notice):**
- [ ] Fix CREDIT_CARD `cashDate` to use `settlementDate` not sale date (1 day)
- [ ] Add `requirePermission("finance.view")` to all `/api/finance/**` routes (2h)
- [ ] Replace in-memory rate limiter with Upstash for login and registration (3h)
- [ ] Fix duplicate payment IDs in modal: `crypto.randomUUID()` instead of `Date.now()` (10min)

**Week 1 (before first paying customer):**
- [ ] Add API-level subscription enforcement (`requireActiveSubscription()` in POST/PATCH/DELETE routes)
- [ ] Fix partial AR payment accumulation (or block partial payments until proper model is built)
- [ ] Call `validateStatusTransition()` in `ServiceOrderService.updateStatus()`
- [ ] Add Neon pooler URL parameters to `DATABASE_URL` (prevents connection exhaustion under load)
- [ ] Wire `prisma-tenant.ts` or add a CI lint rule blocking unchecked `findUnique` calls
- [ ] Fix CREDIT_CARD FinanceAccount balance double-count

**Month 1 (sustainable operation):**
- [ ] Brand color unification (pick teal, apply everywhere — trust/conversion impact)
- [ ] Build `FinanceEntryRetry` table for silent `generateSaleEntries` failures
- [ ] Fix CashShift race with row-level lock
- [ ] Add FIFO inventory lock (`WHERE qtyRemaining >= consume`)
- [ ] Audit middleware redesign (synchronous, inside transaction)
- [ ] Impersonation token via server-side cookie instead of URL querystring

### The Three-Line Argument to the Owner

The software has an active backdoor in the admin panel, medical records stored at public URLs, and the POS finalize button silently fails for crediário customers. The first two are legal exposure. The third is operational failure. Everything else is important but secondary. Fix these three categories before onboarding any paying customer.

---

*Reviewer A — for debate with Reviewer B and Reviewer C.*
