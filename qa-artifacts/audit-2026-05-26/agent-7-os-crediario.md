# Agent 7 — OS Lifecycle, Lab Integration, Prescription, Customer Journey & Crediário (Customer Side)

**Audit date**: 2026-05-26  
**Scope**: Service Order module, Laboratory integration, Prescription handling, Customer journey, Crediário (customer-facing)  
**Stack**: Next.js 14 (App Router), Prisma ORM, PostgreSQL (Neon), Supabase Storage, Claude Vision OCR

---

## Executive Summary

The OS module is structurally sound with a well-designed state machine, atomic sequence counters, optimistic-update Kanban, and a solid audit trail. However, several correctness and security gaps threaten data integrity and LGPD compliance:

1. **CRITICAL**: The `/api/laboratories/[id]/service-orders` endpoint has no `requireAuth()` call — only `getCompanyId()` which may implicitly require a session, but skips the explicit auth guard, creating a potential data leak path.
2. **HIGH**: Prescription data stored in the `prescriptionData` JSON column is **unencrypted at rest** — this is sensitive medical data under LGPD and Brazilian health data legislation.
3. **HIGH**: `validateStatusTransition()` helper exists in the schema module but is **never called** by `ServiceOrderService.updateStatus()`. The Kanban client-side guard can be bypassed by any direct `PATCH /api/service-orders/[id]/status` call with an arbitrary status (e.g., DRAFT → DELIVERED).
4. **HIGH**: The Kanban `VALID_TRANSITIONS` table allows `APPROVED → IN_PROGRESS` (skipping `SENT_TO_LAB`), but the service layer has no equivalent guard — mismatched transition rules between client and server.
5. **MEDIUM**: `checkAndMarkDelayed()` is defined but **never called from any API route or cron job** — the `isDelayed` flag only updates if someone explicitly calls this method. The "atrasadas" filter partially works via the `OR [promisedDate < now, isDelayed: true]` check, but `delayDays` is stale.
6. **MEDIUM**: No phone-number duplicate check in `CustomerService.create()` — only CPF and email. A customer can be registered twice with the same mobile number.
7. **MEDIUM**: Crediário renegotiation status `RENEGOTIATED` exists in the schema but has **zero API implementation** — no route creates or transitions to this status.
8. **MEDIUM**: `validateCPF()` (Luhn-style algorithm) is exported from `customer.schema.ts` but **never invoked** at the API level — any syntactically valid 11-digit number passes including `00000000000`.
9. **LOW**: Production debug `console.log` statements remain in `nova/page.tsx` (lines 385, 400) and `clientes/[id]/page.tsx` (lines 223, 227, 230) — these expose payload internals in browser DevTools.
10. **LOW**: The OCR confidence threshold is absent — the route returns whatever Claude Vision parses with no quality score. The UI shows "Receita lida com sucesso!" even for blurry images that return mostly null fields.

---

## Findings by Severity

### CRITICAL

#### C1 — Missing `requireAuth()` on Lab Service-Orders Endpoint

**File**: `src/app/api/laboratories/[id]/service-orders/route.ts:6-12`

```ts
export async function GET(_req: NextRequest, ...) {
  try {
    const companyId = await getCompanyId();  // No requireAuth() before this
```

`getCompanyId()` calls `auth()` internally and throws if session is absent, so in practice this may not be an unauthenticated exploit in production. However: (1) it relies on implementation details of the helper, not explicit contract; (2) if `getCompanyId()` is ever refactored to accept a fallback, the guard disappears silently. Every other GET endpoint in the codebase calls `await requireAuth()` first. This endpoint does not. The OS data returned includes customer names, phones, and delay status — PII under LGPD.

**Fix**: Add `await requireAuth();` as the first line inside the try block.

---

### HIGH

#### H1 — Prescription Data Not Encrypted at Rest (LGPD)

**Files**: `prisma/schema.prisma:819` (`prescriptionData Json?`), `prisma/schema.prisma:736-785` (Prescription model with `PrescriptionValues`)

Brazilian optometric prescriptions contain ophthalmological measurements (sphere, cylinder, axis, prism) that qualify as health/medical data under LGPD Art. 11, §1. The data is stored in:
- `ServiceOrder.prescriptionData` — raw JSON blob, unencrypted
- `Prescription.imageUrl` — Supabase public bucket URL (public read without auth)
- `PrescriptionValues.*` — plain numeric columns in PostgreSQL

There is no field-level encryption, no column-level encryption at DB layer, and the prescription image bucket is accessed via `getPublicUrl()` (line 74 in `src/app/api/upload/prescription-image/route.ts`), meaning any URL holder can read the image.

**LGPD risk**: Storing health data without encryption violates LGPD Art. 46 (adequate security) and Art. 11 (special categories of personal data).

**Fixes**:
1. Mark the Supabase bucket as private; generate signed URLs with short TTL (e.g., 1 hour) instead of public URLs.
2. Encrypt `prescriptionData` JSON column using application-level encryption (AES-256-GCM) before storage.
3. Add an access log when prescription data is retrieved.

#### H2 — Status Machine Not Enforced Server-Side (`updateStatus`)

**File**: `src/services/service-order.service.ts:356-409`

The service rejects transitions from `DELIVERED` or `CANCELED` (lines 366-380), but allows **any other arbitrary status jump** for all other states. A vendor can `PATCH /api/service-orders/{id}/status` with `{ status: "DELIVERED" }` on a `DRAFT` OS, bypassing all intermediate steps. The `validateStatusTransition()` helper in `src/lib/validations/service-order.schema.ts:138-153` correctly defines the FSM but is never imported or called by the service.

**Evidence**: No call to `validateStatusTransition` anywhere in the codebase:
```
grep -rn "validateStatusTransition" → 0 results in services/
```

**Fix**: In `ServiceOrderService.updateStatus()`, add:
```ts
import { validateStatusTransition } from "@/lib/validations/service-order.schema";
// ...
if (!validateStatusTransition(existing.status, status)) {
  throw new AppError(ERROR_CODES.VALIDATION_ERROR, 
    `Transição inválida: ${existing.status} → ${status}`, 400);
}
```

#### H3 — Kanban and Service Layer Have Different Transition Rules

**Files**: `src/components/ordens-servico/kanban-board.tsx:92-98`, `src/lib/validations/service-order.schema.ts:142-151`

The Kanban `VALID_TRANSITIONS` allows `APPROVED → IN_PROGRESS` (skipping `SENT_TO_LAB`):
```ts
// kanban-board.tsx
APPROVED: ["SENT_TO_LAB", "IN_PROGRESS"],  // skips lab step
```

But `validateStatusTransition()` in the schema does not:
```ts
// service-order.schema.ts
APPROVED: ["SENT_TO_LAB", "CANCELED"],  // only to lab
```

This means: (a) the Kanban UI lets users drag an approved OS to "In Production" without it going to the lab, which is a valid business scenario for in-house work but is inconsistently handled; (b) once H2 is fixed with server-side validation, the Kanban drag for `APPROVED → IN_PROGRESS` will start returning 400 errors.

**Fix**: Decide the intended rule and make it consistent. If "skip lab" is valid for in-house production, update `validateStatusTransition()` to match. If not, remove it from Kanban `VALID_TRANSITIONS`.

#### H4 — OCR: No Confidence Threshold, Auto-Applies Stale/Wrong Data

**Files**: `src/app/api/ocr/prescription/route.ts:115-171`, `src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx:102-131`

The OCR endpoint calls Claude Vision and returns parsed JSON with no confidence score. The `handleOcrResult` in `nova/page.tsx` uses `||` fallback logic:

```ts
// nova/page.tsx:109
esf: toStr(data.od?.esf) || prev.od.esf,
```

This means: if the user has manually typed values, OCR will only overwrite them if OCR returned non-null — but if OCR returns `"0"` or `"-0.00"`, the falsy-ish string coercion in `toStr` may or may not preserve manual edits depending on JS coercion. More critically, the OCR runs automatically on upload — there is no "apply OCR" confirmation step. If the photo is blurry and Claude returns partially wrong values (e.g., sphere -2.50 read as -25.0, which is outside ±30 range but would fail only on submit), the user may not notice the bad fill.

**Fixes**:
1. Add a confidence indicator returned from the OCR prompt (ask Claude to rate 0–100).
2. Show "OCR detectou estes valores — confirme antes de salvar" instead of auto-filling.
3. Validate OCR-filled values immediately client-side so out-of-range values flash red before form submission.

---

### MEDIUM

#### M1 — `checkAndMarkDelayed()` Has No Caller — SLA Data Stale

**File**: `src/services/service-order.service.ts:661-693`

The method exists and is correct, but there is no cron route, no Vercel cron job, no `@/app/api/*/cron/route.ts` that calls it:
```
grep -rn "checkAndMarkDelayed" → only the definition, no callers
```

**Impact**: `delayDays` column is always 0 for new delays. The `isDelayed` flag is set only manually (or through the UI filter workaround that uses `promisedDate < now`). Lab SLA reports showing delay days are all wrong. The `delayedCount` in Kanban headers is computed correctly client-side (from `promisedDate < now`), but the dashboard metrics query `isDelayed: true` in `src/app/api/dashboard/metrics/route.ts:212` returns stale data.

**Fix**: Create `src/app/api/cron/mark-delayed/route.ts` and configure in `vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/mark-delayed", "schedule": "0 6 * * *" }] }
```

#### M2 — Renegotiation Status Exists in Schema But Has No Business Logic

**Files**: `prisma/schema.prisma:3410` (`RENEGOTIATED`), `src/app/api/accounts-receivable/route.ts:17` (query filter only)

`AccountReceivableStatus.RENEGOTIATED` is queryable but never set by any route or service. There is no renegotiation workflow: no API to bundle overdue installments into a new schedule, no UI for it. The customer "Parcelas" tab in `/dashboard/clientes/[id]` shows no renegotiation option.

**Impact**: Stores with customers in default have no structured renegotiation path — only manual workarounds (cancel + create new installments), losing the audit trail.

#### M3 — Phone Duplicate Not Checked on Customer Create

**File**: `src/services/customer.service.ts:191-229`

CPF and email are uniqueness-checked, but phone is not. Brazilian óticas commonly have walk-in customers who share a phone (e.g., family plans) but also have customers registered twice by different staff using just a phone number. No fuzzy search or warning is shown.

**Fix**: Add phone soft-match warning (not a hard block, since families share phones):
```ts
if (data.phone) {
  const phoneMatch = await prisma.customer.findFirst({
    where: { companyId, phone: cleanPhone(data.phone) }
  });
  if (phoneMatch) warnResult = { possibleDuplicate: phoneMatch.id };
}
```

#### M4 — CPF Algorithm Validation Never Called at API Level

**File**: `src/lib/validations/customer.schema.ts:226-257` (function defined), `src/app/api/customers/route.ts` (not imported)

`validateCPF()` implements the Mod-11 Luhn algorithm correctly but is only exported — never used in production paths. The Zod schema only checks the regex `/^\d{11}$/`, accepting `11111111111`, `00000000000`, etc.

**Fix**: Use `.refine(validateCPF, "CPF inválido")` in `createCustomerSchema`:
```ts
cpf: z.string().regex(CPF_REGEX, "CPF deve ter 11 dígitos")
  .refine(validateCPF, "CPF inválido (dígitos verificadores incorretos)")
  .optional().or(z.literal(""))
```

#### M5 — Prescription Edit After Sale Conversion Not Blocked

**File**: `src/services/service-order.service.ts:270-279`

The `update()` method blocks edit only for `DELIVERED` status:
```ts
if (existing.status === "DELIVERED") {
  throw new AppError(..., "Não é possível atualizar OS já entregue", 400);
}
```

But an OS with status `READY` can have an active `sale` link (sale created when `validateForSale` returns OK). Editing prescription data on a `READY` OS after a sale is already linked changes the clinical data without the change being recorded in the sale. This is a data corruption vector: the sale receipt shows one prescription; the OS shows another.

**Fix**: In `ServiceOrderService.update()`, add:
```ts
if (existing.sale && data.prescription !== undefined) {
  throw new AppError(ERROR_CODES.VALIDATION_ERROR,
    "Não é possível alterar a receita de uma OS com venda vinculada", 400);
}
```

#### M6 — `vencendo` Filter Uses Server `new Date()` (UTC), Not Brazil Local Time

**File**: `src/services/service-order.service.ts:63-66`

```ts
...(filter === "vencendo" && {
  promisedDate: { gte: now, lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) },
```

`now` is `new Date()` from the Vercel serverless environment — UTC. An OS with `promisedDate` of today at `T15:00Z` (noon Brasília time) will appear in "vencendo" only after midnight UTC, not after midnight Brasília time. At the edge times (late evening Brasília), an OS due tomorrow Brazilian time will not appear in the 3-day window.

The `dateOnlyToUTC` helper in `date-utils.ts` (which stores dates at noon local time) partially mitigates this, but the comparison boundary `now` is still UTC midnight, not Brasília midnight.

**Fix**:
```ts
import { startOfLocalDay } from "@/lib/date-utils";
const now = startOfLocalDay(new Date());
```

---

### LOW / POLISH

#### L1 — Debug Console Logs in Production Pages

**Files**:
- `src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx:385,400` — `console.log("📤 Enviando ordem de serviço:", payload)` and `console.log("✅ Ordem criada:", result)` expose full OS payload including prescription data in DevTools.
- `src/app/(dashboard)/dashboard/clientes/[id]/page.tsx:223,227,230` — `console.log("=== DEBUG: ...")` exposes full customer JSON including CPF in browser console.

LGPD risk: CPF and prescription data should not appear in browser console output.

#### L2 — Crediário Modal: `alert()` Used for Validation

**File**: `src/components/pdv/modal-configurar-crediario.tsx:47,51`

```ts
if (count < 2 || count > 24) {
  alert("Número de parcelas deve estar entre 2 e 24");
```

Browser `alert()` blocks the event loop and looks unprofessional. Should use `toast.error()`.

#### L3 — Delivery Print Template Missing Customer Signature Area for Crediário

**File**: `src/app/(dashboard)/dashboard/ordens-servico/[id]/imprimir/page.tsx:449-460`

The print template has two signature lines: "Responsável pela OS" and "Recebido pelo Laboratório". There is no signature line for customer delivery confirmation or crediário consent. Brazilian consumer protection (CDC Art. 54) and LGPD data consent should be captured on the delivery document.

#### L4 — Lab OS List Hardcoded to `take: 50`

**File**: `src/app/api/laboratories/[id]/service-orders/route.ts:47-49`

```ts
orderBy: { createdAt: "desc" },
take: 50,  // Hardcoded, no pagination
```

A lab with >50 open OS (busy season) will silently miss older ones. Should use pagination params with defaults.

#### L5 — Kanban Drag-Drop: `CANCELED` Column Absent

**File**: `src/components/ordens-servico/kanban-board.tsx:83-90`

`CANCELED` is not a Kanban column, which is correct UX. But the `VALID_TRANSITIONS` map doesn't include `→ CANCELED` from any status, meaning a drag to cancel from Kanban is impossible. Cancel is only possible from the list view via the DELETE endpoint. Dragging a DRAFT card to nowhere silently fails (no column to receive it). This is intentional but not communicated to users.

#### L6 — OCR HEIC Support: Frontend Accepts, Backend Allows But Claude Doesn't Support It

**Files**: `src/components/ordens-servico/prescription-image-upload.tsx:65` (accepts `image/heic`), `src/app/api/upload/prescription-image/route.ts:10` (allows HEIC), `src/app/api/ocr/prescription/route.ts:103-113`

The OCR route maps unknown MIME types to `image/jpeg`:
```ts
const mediaType: ImageMediaType = allowedMimeTypes.includes(mimeType as ImageMediaType)
  ? (mimeType as ImageMediaType)
  : "image/jpeg";
```

`image/heic` is not in `allowedMimeTypes` so it defaults to `image/jpeg` — sending HEIC binary as JPEG to Claude Vision will likely fail or return garbled results with no error surfaced.

---

## Customer Journey Friction Points

1. **No "last prescription" quick-load**: When creating a new OS for a returning customer, there is no button to copy or reference their last prescription from the `Prescription` model. The OCR + manual entry form starts blank every time.

2. **Customer search requires 2+ characters**: `src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx:193` — a single character search returns nothing. For staff remembering "João C", they must type at least "Jo". The debounce of 300ms is good.

3. **OS list in customer detail page is read-only**: `src/app/(dashboard)/dashboard/clientes/[id]/page.tsx:917-965` — the OS tab shows status badges but links to `/dashboard/ordens-servico/{id}/detalhes` which may not render correctly from the customer context. The OS total value is missing (the `totalValue` field in the page's `ServiceOrder` interface is used but the API returns no `totalValue` in the list endpoint).

4. **No pickup notification**: When an OS reaches `READY` status, there is no automated WhatsApp/SMS alert to the customer. The CRM reminder system exists, but there is no hook that fires on `READY` transition.

5. **Crediário customer view is view-only**: The "Parcelas" tab shows installments but has no pay-now button (redirecting to the caixa), no statement download/print, and no renegotiation request option. The only action is a print icon that calls `/api/accounts-receivable/{id}/receipt` — which only works for `RECEIVED` status installments.

6. **Birthday filter queries all IDs then uses IN**: `src/services/customer.service.ts:113-119` — birthday filter executes a `$queryRaw` to get IDs, then uses `where: { id: { in: birthdayIds } }`. For large databases this creates a potentially very large `IN` clause. Should use a JOIN or a subquery.

---

## Lab Workflow Gaps

1. **No lab rejection workflow**: The schema has no `rejectedAt`, `rejectionReason`, or `REJECTED` status for when a lab sends an OS back (e.g., prescription impossible, wrong lens). The only recourse is revert + `reworkReason`, losing the distinction between "lab rejected" and "we fixed it ourselves".

2. **No lab order number auto-increment**: `labOrderNumber` (string field) is manually typed. Most labs have their own sequential numbering. A field for auto-tracking lab sequence per lab would reduce errors.

3. **Lab SLA report broken**: `src/app/api/reports/optical/labs/route.ts` — not inspected fully, but the `totalOrders` field in `/api/laboratories` is actually the live count of service orders (`_count.serviceOrders`), while `totalReworks` is a stale denormalized integer on the Lab model updated... somewhere (not visible in the service files read). This inconsistency can cause incorrect quality dashboards.

4. **No email trigger on `SENT_TO_LAB`**: `Lab.orderEmail` field exists but no code sends an email when the OS reaches `SENT_TO_LAB`. The field is purely decorative data.

5. **`atrasadas` filter timezone issue**: The `checkAndMarkDelayed` job (M1) never runs, so `isDelayed` is always false in the DB. The filter fallback `promisedDate < now` works, but uses UTC `now`, so an OS due today at 8 PM Brasília time will be shown as "atrasada" from 11 PM UTC (= 8 PM Brasília) — roughly correct but not deterministic for close boundaries.

---

## Crediário Risks (Customer-Side)

1. **No renegotiation workflow (M2)**: `RENEGOTIATED` status exists but nothing creates it. Stores dealing with defaulting customers must manually cancel installments and re-create them — no audit trail, no customer notification, no consolidated view of renegotiated history.

2. **Credit limit not shown to customer**: `Customer.creditLimit` is validated at sale time via `validateCreditLimit()` in `src/lib/installment-utils.ts`, but the customer detail page has no "Available Credit" or "Used Credit" KPI. Staff cannot tell a customer their remaining credit during a store visit.

3. **No crediário statement export**: The "Parcelas" tab renders a list but there is no PDF export or print action for the full statement. Customers who ask for a printed summary of their debt get nothing.

4. **Partial payment not tracked**: The `AccountReceivable` model has `receivedAmount` (partial) and `discountAmount`, but the UI in the customer page shows only `r.amount` — partial payments are not visible to staff via the customer detail view. Only the accounts-receivable module (finance angle) shows this detail.

5. **`firstDueDate` date coercion bug**: `src/components/pdv/modal-configurar-crediario.tsx:57`:
```ts
firstDueDate: new Date(firstDueDate).toISOString(),
```
When `firstDueDate` is "2026-06-01" (from `<input type="date">`), `new Date("2026-06-01")` parses as UTC midnight = "2026-05-31T21:00:00Z" in Brasília. The first installment due date may be one day early for users in Brazil. Should use `dateOnlyToUTC("2026-06-01")` from the date-utils library.

6. **No blocked-for-overdue UI indicator**: `validateCreditLimit()` blocks sales when a customer has installments overdue > 30 days, but the customer detail page shows no "BLOCKED" badge or indicator. Staff learn of the block only when a sale is attempted in the PDV.

---

## Top 5 New Features (Competitive Differentiators vs ssOtica / Competitors)

1. **Automated OS Pickup Notification via WhatsApp**  
   When OS status moves to `READY`, trigger a WhatsApp message via Evolution API or Z-API with the prescription summary, store address, and payment pending. Brazilian óticas lose sales because customers forget to pick up. ssOtica charges extra for this; building it natively with the existing CRM infra would be a major differentiator.

2. **Prescription Evolution Graph**  
   `prescriptionService.getGradeEvolution()` already exists (`src/services/prescription.service.ts:323-347`). Build a visual timeline chart (Recharts) in the customer detail page showing OD/OE sphere/cylinder over years. Opticians love this for tracking myopia progression, and no competitor has it as a native view.

3. **Lab Electronic Order (PDF/Email)**  
   Use the existing `Lab.orderEmail` field + the print template logic to auto-email the lab a formatted PDF order when the OS is moved to `SENT_TO_LAB`. Replaces WhatsApp photo of a paper form, which is how most Brazilian óticas operate today.

4. **Crediário Renegotiation Workflow**  
   Implement the `RENEGOTIATED` status with a modal: select overdue installments → choose new schedule → generate new installments with the original ones marked RENEGOTIATED. Include the customer's signed consent embedded in the print receipt. This is table stakes for any optical store with a credit operation.

5. **OCR Prescription with Confidence Badge + "Compare to Previous"**  
   Show OCR confidence level (ask Claude to return a 0–100 score). If confidence < 80, highlight fields in yellow. Add a side-by-side comparison with the customer's last prescription to flag unusual grade changes (e.g., +2D sphere jump) for pharmacist review. No Brazilian competitor has this.

---

## Quick Wins (< 1 day each)

| # | Fix | File | Effort |
|---|-----|------|--------|
| QW1 | Add `await requireAuth()` in lab service-orders endpoint | `src/app/api/laboratories/[id]/service-orders/route.ts:10` | 2 min |
| QW2 | Call `validateStatusTransition()` in `updateStatus()` | `src/services/service-order.service.ts:380` | 10 min |
| QW3 | Fix `firstDueDate` UTC bug in crediário modal | `src/components/pdv/modal-configurar-crediario.tsx:57` | 5 min |
| QW4 | Remove production debug console.logs | `nova/page.tsx:385,400`; `clientes/[id]/page.tsx:223-230` | 5 min |
| QW5 | Replace `alert()` in crediário modal with `toast.error()` | `src/components/pdv/modal-configurar-crediario.tsx:47,51` | 5 min |
| QW6 | Wire `validateCPF` into Zod schema `.refine()` | `src/lib/validations/customer.schema.ts:27` | 10 min |
| QW7 | Mark Supabase prescription bucket as private, use signed URLs | `src/app/api/upload/prescription-image/route.ts:73-76` | 30 min |
| QW8 | Add pagination to lab OS list (remove `take: 50`) | `src/app/api/laboratories/[id]/service-orders/route.ts:47` | 15 min |
| QW9 | Fix `vencendo` filter to use `startOfLocalDay(new Date())` | `src/services/service-order.service.ts:44` | 5 min |
| QW10 | Add Vercel cron for `checkAndMarkDelayed` | `vercel.json`, new `src/app/api/cron/mark-delayed/route.ts` | 45 min |

---

## Detailed Code Reference Index

| Finding | File | Line(s) |
|---------|------|---------|
| C1 — Missing auth on lab endpoint | `src/app/api/laboratories/[id]/service-orders/route.ts` | 6-12 |
| H1 — Unencrypted prescription JSON | `prisma/schema.prisma` | 819 |
| H1 — Prescription public bucket | `src/app/api/upload/prescription-image/route.ts` | 73-76 |
| H2 — No server-side status validation | `src/services/service-order.service.ts` | 356-409 |
| H2 — Unused helper | `src/lib/validations/service-order.schema.ts` | 138-153 |
| H3 — Kanban skips SENT_TO_LAB | `src/components/ordens-servico/kanban-board.tsx` | 92-98 |
| H4 — OCR no confidence threshold | `src/app/api/ocr/prescription/route.ts` | 115-171 |
| H4 — OCR auto-fill without confirm | `src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx` | 102-131 |
| M1 — checkAndMarkDelayed no caller | `src/services/service-order.service.ts` | 661 |
| M2 — RENEGOTIATED status stub | `prisma/schema.prisma` | 3410 |
| M3 — Phone dup not checked | `src/services/customer.service.ts` | 191-229 |
| M4 — validateCPF not called | `src/lib/validations/customer.schema.ts` | 226 |
| M5 — Prescription edit after sale | `src/services/service-order.service.ts` | 270-279 |
| M6 — vencendo filter UTC bug | `src/services/service-order.service.ts` | 63-66 |
| L1 — Debug console.log in prod | `nova/page.tsx` | 385, 400 |
| L1 — Debug console.log CPF | `clientes/[id]/page.tsx` | 223-230 |
| L2 — alert() in crediário | `src/components/pdv/modal-configurar-crediario.tsx` | 47, 51 |
| L3 — Print missing customer sig | `src/app/(dashboard)/dashboard/ordens-servico/[id]/imprimir/page.tsx` | 449-460 |
| L4 — Lab OS list take:50 | `src/app/api/laboratories/[id]/service-orders/route.ts` | 47-49 |
| L6 — HEIC OCR silent failure | `src/app/api/ocr/prescription/route.ts` | 103-113 |
| Crediário date bug | `src/components/pdv/modal-configurar-crediario.tsx` | 57 |

---

## Positive Findings (Correct by Design)

- **Atomic OS sequence numbers**: `getNextSequence()` runs inside the Prisma `$transaction`, preventing duplicate numbers under concurrent load.
- **Timezone-aware date storage**: `dateOnlyToUTC()` correctly anchors promised dates at noon local time, avoiding the classic "day-before" bug.
- **Optimistic Kanban with rollback**: Drag-drop moves cards optimistically and correctly reverts on API failure with an error toast.
- **Warranty/rework traceability**: `createWarranty()` preserves `originalOrderId` linkage, and the OS print template shows the -G/-R suffix.
- **READY-only delivery gate**: `ServiceOrderService.deliver()` correctly enforces that only `READY` OS can be delivered, preventing accidental delivery of in-progress work.
- **Multi-tenant isolation**: All queries include `companyId` in Prisma `where` clauses throughout the OS and customer services.
- **Credit limit enforcement**: `validateCreditLimit()` correctly checks both individual and company-default limits and blocks sales when the customer has overdue installments beyond the grace period.
- **Prescription expiry calculation**: `prescriptionService.create()` auto-calculates `expiresAt = issuedAt + 12 months`, and `checkExpiry()` returns expiring-soon warnings — used by CRM reminder segments.
