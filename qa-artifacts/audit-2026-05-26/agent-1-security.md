# Agent 1 — Security, LGPD, AuthN/AuthZ Audit

**Auditor:** Agent 1 (Security Specialist)
**Date:** 2026-05-26
**Scope:** SaaS PDV Ótica (Next.js 14 App Router, Prisma, Neon, NextAuth v5, Vercel)
**Production URL:** https://pdv-otica.vercel.app
**Codebase root:** `/Users/matheusreboucas/PDV OTICA/`

---

## Executive Summary — Top 5 Critical Findings

1. **CRITICAL — IDOR in user permissions endpoint** lets any authenticated ADMIN of company A escalate / strip permissions on users of company B by guessing/leaking a `userId`. The handler at `src/app/api/users/[id]/permissions/route.ts` and the service at `src/services/permission.service.ts` never check that the target `userId.companyId == session.companyId`. This breaks the entire multi-tenancy isolation for the most privileged operation in the system.

2. **CRITICAL — `/api/admin/seed` resets the SUPER_ADMIN password to the hardcoded literal `"admin123"`** every time it is invoked by any authenticated admin (no SUPER_ADMIN role check; any `getAdminSession()` works). The same string is committed to the repository (`src/app/api/admin/seed/route.ts:21-22`). If a single admin token leaks, full takeover of the SaaS control plane is one POST request away.

3. **CRITICAL — Tenant isolation is not centralized.** A `prisma-tenant.ts` extension exists (`src/lib/prisma-tenant.ts`) but is **dead code** — no route imports it. All ~215 places that import `@/lib/prisma` rely on developers manually writing `where: { companyId }`. Several services already miss this (Permission service, admin endpoints that look up `Company.findUnique({ where: { id } })` without verifying ownership). One mistake = one cross-tenant breach.

4. **HIGH — No rate limiting on the credential login endpoints.** `/api/auth/callback/credentials` (NextAuth POST) and `/api/public/register` have zero throttling. The PDV login path is wide open to credential stuffing and registration spam. Only `admin-login`, `ocr-prescription`, `sales` and `cash-shift` are protected (`src/lib/rate-limit.ts` is in-memory only — also resets on every Vercel cold start).

5. **HIGH — Prescription images are stored on a PUBLIC Supabase bucket.** `src/app/api/upload/prescription-image/route.ts:74-76` calls `getPublicUrl(...)` and writes that URL into `Prescription.imageUrl`. Anyone who guesses or scrapes `<companyId>/<timestamp>-<uuid>.jpg` paths can fetch confidential medical PII (CPF, prescription values, doctor CRM are embedded in the optometric image). This is a direct LGPD violation under Art. 11 (dados pessoais sensíveis – saúde).

Below: each finding with file:line evidence, exploitation scenario, recommended fix and effort estimate.

---

## CRITICAL

### C1 — Cross-tenant IDOR on user permission management
**Files:**
- `src/app/api/users/[id]/permissions/route.ts:14-25` (GET), `:34-66` (POST), `:74-104` (PUT)
- `src/app/api/users/[id]/permissions/reset/route.ts`
- `src/services/permission.service.ts:19-78`, `:96-131`, `:205-218`

**Evidence:**
```ts
// route.ts:38-55
await getCompanyId();             // returns CALLER's companyId — never used
await requireRole(["ADMIN"]);     // only checks CALLER's role
const { id: userId } = await params;
const service = new PermissionService();
await service.setUserPermission(userId, code, granted);   // no companyId check
```
`PermissionService.setUserPermission` and `getUserEffectivePermissions` both call `prisma.user.findUnique({ where: { id: userId } })` without a `companyId` filter.

**Exploitation scenario:**
Attacker is ADMIN of company A. They learn (via support, leaked invoice, scraped sub-domain logs, or brute-force of cuid prefixes) a `userId` belonging to company B. They send:
```
POST /api/users/<companyB-userId>/permissions
Body: { code: "users.delete", granted: true }
```
The endpoint succeeds. The attacker just escalated a foreign user's permissions, or with `granted: false` they can lock a foreign company's only ADMIN out of `permissions.manage`. This works regardless of `requireRole` because that only inspects the caller, not the target.

**Fix:**
```ts
// at top of POST/PUT/GET/RESET handlers
const callerCompanyId = await getCompanyId();
const target = await prisma.user.findFirst({
  where: { id: userId, companyId: callerCompanyId },
  select: { id: true },
});
if (!target) {
  throw forbiddenError("Usuário não pertence à sua empresa");
}
```
Also pass `companyId` into the service and add `where: { id: userId, companyId }` inside every Prisma call there. Add the same guard to `users/[id]/permissions/reset/route.ts`.

**Effort:** 1 h (4 endpoints + service refactor + 4 unit tests).

---

### C2 — `/api/admin/seed` resets SUPER_ADMIN password to a hardcoded literal
**File:** `src/app/api/admin/seed/route.ts:11-45`

**Evidence:**
```ts
const adminEmail = "admin@pdvotica.com.br";
const adminPassword = "admin123";
// ...
const session = await getAdminSession();
if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
// no role check — any admin session passes
await prisma.adminUser.update({
  where: { email: adminEmail },
  data: { password: await bcrypt.hash(adminPassword, 10), active: true },
});
```

**Exploitation scenario:**
1. Internal/lateral attacker compromises any admin account (e.g. a junior support admin with `ROLE = 'ADMIN'` but not SUPER_ADMIN).
2. They `POST /api/admin/seed` once → SUPER_ADMIN password is reset to `admin123`, and account is re-activated even if it was previously disabled.
3. They log in as `admin@pdvotica.com.br` / `admin123` and gain SUPER_ADMIN, including the impersonation endpoint (`/api/admin/impersonate`), which lets them log into ANY tenant's PDV.

**Fix:**
- Remove the hardcoded password from source entirely. Move the bootstrap seed to a one-shot `prisma/seed.ts` that reads `ADMIN_BOOTSTRAP_PASSWORD` from env and only runs if no `AdminUser` exists.
- Restrict `/api/admin/seed` to `SUPER_ADMIN` role and gate it behind an env flag `SEED_ENABLED=true` that is disabled on production after first deploy.
- Rotate the current production SUPER_ADMIN password immediately.

**Effort:** 30 min.

---

### C3 — Tenant isolation enforced by convention, not by design
**Files:**
- `src/lib/prisma-tenant.ts` (the safe extension, **dead code**)
- `src/lib/get-tenant.ts` (also dead, expects a `x-company-id` header the middleware does not set)
- `src/lib/prisma.ts` (the actual client used by 215+ files)

**Evidence:**
- `grep -rn "prisma-tenant" src/` returns a single hit (the definition itself).
- `grep -rn "get-tenant" src/` returns nothing.
- 44 files under `src/app/api/` do not even mention `companyId` (some legitimately — admin or public — others not).
- `PermissionService` (above) is the smoking gun showing the manual-discipline approach has already failed.

**Exploitation scenario:**
Every new endpoint is one missing `where: { companyId }` away from a full cross-tenant data leak. The codebase memory note (`MEMORY.md`) already records this exact bug in `/api/dashboard/metrics`. Once a real customer base exists, a single missed filter exposes their entire database.

**Recommended fix (defense in depth):**
1. **Adopt the tenant-aware Prisma extension globally.** Create a helper `getTenantPrisma()` that resolves `companyId` from `auth()` and returns the extended client. All service-layer modules switch from `import { prisma } from "@/lib/prisma"` to `const prisma = await getTenantPrisma()`.
2. **Add a regression test** that, given a seeded two-company fixture, hits every route as a user of company A asking for a record with company B's id, and asserts 404/403.
3. **Add a CI lint rule** (eslint-no-restricted-syntax) that flags `prisma.<table>.findUnique({ where: { id }})` and `prisma.<table>.findFirst({ where })` without `companyId` in the where clause.

**Effort:** 1-2 days for the refactor; quick wins (lint rule + regression test) in 4 h.

---

### C4 — Default admin password `admin123` is the documented production credential
**Files:** Audit prompt itself documents the production admin as `admin@pdvotica.com.br / admin123`. Confirmed in `src/app/api/admin/seed/route.ts:22`.

8-character all-lowercase password against an admin panel that gates SUPER_ADMIN abilities (impersonation, plan management, billing). Combined with the absent rate limiting in NextAuth (C5), brute force is trivial.

**Fix:** rotate the production credential **today**, set a 16+ char password generated by a manager, enable TOTP/2FA for all `AdminUser` records (requires a new field + middleware step).

**Effort:** 15 min to rotate. 1 day to implement TOTP.

---

### C5 — No rate limit on PDV user login & registration
**Files:**
- `src/auth.ts:34-112` — the NextAuth Credentials provider. No rate limiting hook.
- `src/middleware.ts:91` — `pathname.startsWith("/api/auth")` is exempted from middleware checks.
- `src/app/api/public/register/route.ts` — zero rate limiting on account creation.
- `src/app/api/public/contact/route.ts` — zero rate limiting on contact form (stored in `GlobalAudit`).

**Evidence:** `/api/auth/callback/credentials` is the brute-force surface. Only `/api/admin/auth/login` calls `rateLimitResponse`. The in-memory rate limiter (`src/lib/rate-limit.ts`) also resets on every Vercel cold start (each lambda has its own Map), so even where present it is weak against distributed attackers.

**Exploitation scenario:**
- Credential stuffing on the PDV login (NextAuth) — unlimited POSTs, observable timing differences when user exists vs not (see C7).
- Registration spam — unlimited POSTs creating Companies, Branches, Users, Subscriptions and triggering `setupCompanyFinance` (heavy DB transaction). This is a free DoS lever against Neon's connection pool and Anthropic OCR budget.
- Contact-form spam → fills `GlobalAudit` indefinitely.

**Fix:**
- Wrap the NextAuth handler with a rate-limit middleware keyed on IP + email (5 attempts / 15 min, with exponential backoff). Easiest path: add a check at the very top of `src/middleware.ts` that intercepts POSTs to `/api/auth/callback/credentials` and `/api/public/*`.
- Move to a durable rate-limit store: Upstash Redis (free tier) or Vercel KV. Plug both PDV and admin login into the same store so cold starts do not reset counters.
- Use a CAPTCHA / Turnstile on `/api/public/register` and `/api/public/contact`.

**Effort:** 2-3 h (Upstash + middleware), 1 h (Turnstile).

---

### C6 — Prescription images publicly readable via Supabase
**Files:**
- `src/app/api/upload/prescription-image/route.ts:74-83`
- `src/lib/supabase.ts:1-24`

**Evidence:**
```ts
const { data: urlData } = supabase.storage
  .from(PRESCRIPTION_IMAGES_BUCKET)
  .getPublicUrl(fileName);          // <-- public CDN URL
return NextResponse.json({ data: { url: urlData.publicUrl, fileName } });
```
That public URL is then stored on `Prescription.imageUrl` (`prisma/schema.prisma:745`) and rendered to whomever has the URL.

**Exploitation scenario:**
The path is `<companyId>/<timestamp>-<uuid>.jpg`. companyId is a cuid; timestamp is leakable from the order's createdAt; the uuid blocks pure guessing — but URLs are written into `Prescription.imageUrl`, `ServiceOrder.prescriptionImageUrl`, PDFs, emails (CRM service), and PostHog events. Anywhere a URL leaves the authenticated context (browser referer, screenshot, exported PDF, email forwarded to a customer who is no longer your customer) the medical PII becomes durably public.

**Fix:**
1. Make the Supabase bucket **private**.
2. Replace `getPublicUrl` with `createSignedUrl(fileName, 300)` (5-minute TTL).
3. Add a server route `GET /api/prescriptions/[id]/image` that authorizes the caller and proxies a short-lived signed URL.
4. Migrate existing rows: re-key files into a private bucket and back-fill the new ids.

**Effort:** 4 h (route + signed URL + migration script).

---

### C7 — Login flow leaks user-existence via timing & logs
**Files:** `src/auth.ts:66-78`, `src/auth.ts:76` (`console.log` on invalid password).
**Evidence:**
```ts
if (!user || !user.passwordHash) return null;          // fast path
const isPasswordValid = await bcrypt.compare(password, user.passwordHash);  // slow
if (!isPasswordValid) {
  console.log(`❌ Senha inválida para ${login}`);     // logs PII (email) in plaintext
  return null;
}
```
Two side-effects:
- Timing: an existing user takes ~70-100 ms longer (bcrypt cost = 10).
- Logging: the server-side Vercel log contains a clean inventory of who has accounts (PII / GDPR violation).

**Fix:**
- Always run `bcrypt.compare` against a dummy hash when the user does not exist (constant time).
- Replace `console.log(... ${login} ...)` with a structured log that hashes or redacts the email. Or remove entirely.

**Effort:** 20 min.

---

### C8 — Impersonation token passed in URL query string
**Files:**
- `src/app/api/admin/impersonate/route.ts:92-122` — token returned in JSON
- `src/app/impersonate/page.tsx:11-18` — client navigates with token in querystring
- `src/app/api/auth/impersonate-session/route.ts:14-67` — consumes querystring token

**Evidence:**
```ts
// impersonate/page.tsx:17
window.location.href = `/api/auth/impersonate-session?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`;
```
The token is a fully valid NextAuth session JWT for the target tenant's ADMIN user. URL-borne tokens land in:
- Browser history
- HTTP `Referer` header on the next outbound request from `/dashboard`
- Any analytics that capture URL (PostHog autocapture, Vercel access logs)
- Sentry breadcrumbs if added later

**Exploitation scenario:**
An admin clicks the impersonation link → loads `/dashboard` → an `<img>` on `/dashboard` (e.g. a customer logo from S3) triggers a request with `Referer: https://pdv-otica.vercel.app/api/auth/impersonate-session?token=<jwt>...`. The S3 host receives a valid impersonation JWT. (Referrer-Policy is `strict-origin-when-cross-origin`, which strips the path on cross-origin — but the impersonation page itself is internal, and the user's own subsequent navigation history still has the token.)

**Fix:**
- Do not return the raw token to the client. Have `/api/admin/impersonate` set the `next-auth.session-token` cookie directly via a redirect response (Set-Cookie header) bound to the admin's session.
- Or store the token server-side in a short-lived `ImpersonationSession` record keyed by a one-time opaque code; the client sends only the code.

**Effort:** 2 h.

---

## HIGH

### H1 — Database credentials hardcoded in repository-checked-in `.env`
**File:** `/Users/matheusreboucas/PDV OTICA/.env`
**Evidence:**
```
DATABASE_URL="postgresql://neondb_owner:npg_k1RZwraglpD7@ep-blue-thunder-ai0x3r0a-pooler.c-4.us-east-1.aws.neon.tech/neondb?...
NEXTAUTH_SECRET="TA9ZTgfJwi+p9pfXgYKROZG/8DNyixDCHWiLqXIM8gc="
NEXT_PUBLIC_POSTHOG_KEY="phc_o4ehsE2L8uJtsDVbyDqy46zW7oxrqFeN9mnPoU98YXUT"
```
**Status:** `.env` is in `.gitignore` (verified — `git log .env` empty, file not tracked). However:
- It is present on a dev workstation that any team member, contractor, or backup could clone.
- The NextAuth secret in this file is the production secret (used to sign tokens validated in `src/middleware.ts`).
- The Neon URL uses `sslmode=require` (good) but the password `npg_k1RZwraglpD7` is short.

**Fix:** Treat as already-leaked. Rotate `NEXTAUTH_SECRET` and the Neon DB password **today**. Move `.env` out of the repo root into a sealed secret manager (1Password CLI, Doppler, Vercel env). Document a procedure to issue ephemeral DB credentials for local dev (Neon supports branching).

**Effort:** 1 h (rotation + redeploy).

---

### H2 — Missing CSP (Content-Security-Policy) header
**File:** `next.config.ts:17-29`

The headers configured are `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. **No `Content-Security-Policy`** is set, and verified missing in production (`curl -I https://pdv-otica.vercel.app/login`).

**Exploitation scenario:** Any reflected/stored XSS becomes maximally exploitable — token theft via `fetch(/api/customers).then(send-to-attacker)`. Combined with the `dangerouslySetInnerHTML` for JSON-LD in `src/app/layout.tsx:69-87` (safe today because content is static) and the multiple `innerHTML = printContent.innerHTML` patterns in `src/components/caixa/modal-detalhes-caixa.tsx:135` and `src/components/estoque/modal-imprimir-movimentacao.tsx:79`, the blast radius is broad.

**Fix:** Add a CSP header. Recommended starting point:
```ts
{ key: "Content-Security-Policy",
  value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://us.i.posthog.com; img-src 'self' data: blob: https:; connect-src 'self' https://us.i.posthog.com https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" }
```
Iterate to remove `unsafe-inline` after migrating PostHog to a nonce-based loader.

**Effort:** 1 h to set, 1 day to refine and verify nothing breaks.

---

### H3 — `Access-Control-Allow-Origin: *` on API routes
**Evidence:** `curl -I https://pdv-otica.vercel.app/api/customers` returns `access-control-allow-origin: *`. This is Vercel's default but it should be locked.

While preflight on credentialed requests will still fail (browsers refuse `*` + `credentials: include`), this header on every response invites:
- CSRF-via-link-preview on endpoints that mutate via GET (no such endpoints found, but the surface is unsafe).
- Easier exfiltration if an XSS surfaces.

**Fix:** Set `Access-Control-Allow-Origin` to the exact origin (`https://pdv-otica.vercel.app` plus your future custom domain) on routes under `/api/`. Configure in `next.config.ts` or in middleware.

**Effort:** 30 min.

---

### H4 — Webhook does not verify HMAC signature, only a shared bearer token
**Files:** `src/app/api/webhooks/asaas/route.ts:43-48`, `src/lib/asaas.ts:215-230`

**Evidence:** Asaas does not (today) publish per-event HMAC signing. The integration relies on `asaas-access-token` header equaling `ASAAS_WEBHOOK_TOKEN`. The constant-time compare is good. However:
- The token is a long-lived shared secret. If it leaks (Vercel logs, screenshot, env var copy) anyone can forge `PAYMENT_RECEIVED` and mark invoices paid.
- There is no replay protection beyond `BillingEvent.externalEventId` uniqueness — but Asaas sometimes resends the same `event.id` after errors which is what makes the idempotency design *correct*. The risk is that **forged** events with arbitrary `event.id`s can still flip subscription state.

**Exploitation scenario:**
Attacker who guesses or leaks `ASAAS_WEBHOOK_TOKEN` sends:
```http
POST /api/webhooks/asaas
asaas-access-token: <leaked>
Content-Type: application/json

{ "id":"fake-1", "event":"PAYMENT_CONFIRMED",
  "payment":{ "id":"abc","subscription":"...","customer":"...","status":"CONFIRMED",
              "externalReference":"company:<companyId>:plan:<planId>", "value": 1 } }
```
The subscription for that company is marked ACTIVE — free service.

**Fix:**
- Cross-check `event.payment.id` by calling `asaas.payments.get(event.payment.id)` and verifying its status from Asaas's side before flipping local state. (Trust but verify.)
- Restrict the webhook source IP to Asaas's published egress range (Vercel Edge config or middleware allowlist).
- Rotate `ASAAS_WEBHOOK_TOKEN` and store it only in Vercel encrypted env.

**Effort:** 2 h (verify + allowlist).

---

### H5 — Finance entry creation does not validate `branchId` ownership
**File:** `src/app/api/finance/entries/route.ts:80-104`

The POST handler accepts `branchId` from request body and passes it straight to `generateManualExpenseEntry` without calling `validateBranchOwnership`. The same applies to other endpoints that accept branchId from clients.

**Exploitation scenario:** User of company A sends a `branchId` that belongs to company B → finance entry written into company B's books, or FK fails noisily. Either way, the trust boundary is violated.

**Fix:** Call `validateBranchOwnership(branchId, companyId)` before forwarding. Repeat across every POST/PUT that accepts a `branchId` (audit shows only ~13 call sites; verify all).

**Effort:** 1-2 h to audit all endpoints + write tests.

---

### H6 — Public registration creates Company + ADMIN user with no email verification
**File:** `src/app/api/public/register/route.ts:138-148`

A POST to `/api/public/register` with any email creates:
- Company (accessEnabled: true)
- Branch
- User with `role: "ADMIN"`
- Subscription with TRIAL status

There is no email-confirmation step before login. Combined with C5 (no rate limit), this is a free factory for:
- Spinning up tenants to abuse the trial.
- Spinning up tenants whose ADMIN email mimics a real victim (phishing pretext).
- Exhausting Neon's storage with bulk fake tenants.

**Fix:**
- Introduce an email verification flow: registration creates the row with `accessEnabled: false`, sends a magic link via Resend/Postmark, and login is blocked until clicked.
- Add Turnstile/hCaptcha to the public form.
- Add rate limit 3 attempts / IP / hour.

**Effort:** 4 h.

---

### H7 — Sensitive PII (`session.user.email`, `companyId`) logged on every request
**File:** `src/auth.ts:98-153`

Every successful login emits:
```
✅ Login bem-sucedido: { name, email, role, companyId, networkId }
```
and `jwt`/`session` callbacks also log `email` + `role` on every request. Vercel access logs are accessible by every team member. LGPD Art. 6, V (necessidade) — logs should retain only the minimum.

**Fix:** Remove the `console.log`s in the production code path. If you want audit, write to the `GlobalAudit` table you already have. The `❌ Senha inválida para ${login}` log also leaks failed-attempt emails to the platform log.

**Effort:** 15 min.

---

### H8 — OCR endpoint accepts arbitrary base64 without re-validating it server-side
**File:** `src/app/api/ocr/prescription/route.ts:78-102`

The endpoint trusts `body.imageBase64` and `body.mimeType`. It checks size and `mimeType` against an allow-list but never decodes a few bytes to verify the magic bytes match the declared `mimeType` — meaning an attacker can send arbitrary blobs to Anthropic, billing the company for arbitrary content (and potentially exfiltrating data via crafted prompts in image metadata). It also does not verify the image is not malicious EXIF (CVE history in image libraries).

**Fix:** Decode the first ~12 bytes of the base64 and verify magic bytes match the declared MIME. Reject otherwise. Strip EXIF before sending to Anthropic.

**Effort:** 1 h.

---

### H9 — Cookies use `sameSite: "lax"` instead of `"strict"` on session
**Files:** `src/auth.config.ts:18-26`, `src/auth-admin.config.ts:20-30`, `src/app/api/admin/auth/login/route.ts:88-93`

`sameSite: "lax"` allows the session cookie to be sent on top-level GET navigations from another origin. For a B2B SaaS where the only legitimate cross-origin navigation is "user clicks our marketing email", `strict` is safer and prevents most CSRF on GET-mutating endpoints (none found today, but defensive).

**Fix:** Switch to `sameSite: "strict"`. NextAuth's OAuth callbacks need `lax` only if you add social login; for credential-only auth, `strict` is fine.

**Effort:** 5 min (test login flow after).

---

### H10 — `secure: false` on cookies when `NODE_ENV !== "production"` (development)
**Files:** all auth configs, e.g. `src/auth.ts:30`

Not exploitable on Vercel (always production), but a developer running `next dev` with HTTPS-via-cloudflared could mis-set NODE_ENV. Low priority; flagged for completeness.

---

## MEDIUM

### M1 — Customer PII (CPF, RG, address, birthDate) stored unencrypted
**File:** `prisma/schema.prisma:371-418` (Customer model)

Brazilian LGPD does not strictly require column-level encryption, but for `dados sensíveis` (Art. 5, II — "dado pessoal sobre saúde") prescriptions / medical data should be encrypted at rest. Neon does encrypt the underlying disk, but anyone with a Prisma connection (e.g. a leaked `DATABASE_URL`, see H1) reads it in cleartext.

**Recommendation:** column-level encryption (PGP_SYM_ENCRYPT or libsodium via Prisma middleware) for `cpf`, `rg`, `Prescription.*`, `PrescriptionValues.*`. At minimum, log access to these tables via an `auditLog` middleware (`src/lib/prisma-audit-middleware.ts` exists — check if hooked up).

**Effort:** 1 day to design, 2 days to implement + back-fill.

---

### M2 — `/api/public/contact` writes uncontrolled PII into `GlobalAudit`
**File:** `src/app/api/public/contact/route.ts:25-39`

Anyone can stuff any text — including others' PII or libelous content — into the `GlobalAudit` table. That table is read by SUPER_ADMINs. There is no profanity filter, length cap (`message` schema only checks `min(1)`), or de-duplication.

**Fix:** Cap each field's length, run a quick spam/profanity scan, log to a dedicated `ContactMessage` model with retention policy, dedupe by `(email, hash(message))`.

**Effort:** 1 h.

---

### M3 — `getCompanyId()` returns the cookie-encoded `companyId` without ever re-checking against the DB
**Files:** `src/lib/auth-helpers.ts:72-83`, `src/auth.ts:88-96`

The JWT carries `companyId` set at login. If a user is removed from a company or moved between companies, their existing valid JWT still authorizes the old tenant for up to 30 days (`maxAge: 30 * 24 * 60 * 60`). For a multi-tenant SaaS, 30 days is long.

**Fix:**
- Drop JWT lifetime to 12 h (or to 8 h matching the admin session).
- Add a periodic DB lookup that ensures the user is still active and still attached to that company; emit `update` trigger to refresh the JWT.
- Implement a "force logout" / token blacklist mechanism (currently `force-logout` page exists but no server-side invalidation).

**Effort:** 4 h.

---

### M4 — Error responses leak stack traces in development; verify production
**File:** `src/lib/error-handler.ts:170-194`

In `development` mode, full Prisma error meta and Error.message are sent to the client. The toggle is `process.env.NODE_ENV === "development"`. Verified production path returns generic message. Caveat: if `NODE_ENV` is ever unset (Vercel preview deploys, custom build commands), the dev path fires.

**Fix:** Replace `process.env.NODE_ENV === "development"` with an explicit `process.env.EXPOSE_ERROR_DETAILS === "1"` flag, set only in local dev.

**Effort:** 20 min.

---

### M5 — `process.env.AUTH_SECRET` is used for both encrypted session JWTs (NextAuth) AND signed admin JWTs (`jose.SignJWT` HS256)
**Files:** `src/app/api/admin/auth/login/route.ts:7-12`, `src/middleware.ts:10-12`, `src/auth.ts` (via NextAuth)

Two completely different JWT formats share one secret. If a flaw in either implementation reveals plaintext payload, the secret is the same. Best practice is to give each token type its own secret.

**Fix:** Introduce `ADMIN_JWT_SECRET` distinct from `AUTH_SECRET`, used only by admin login + `verifyAdminToken` in `middleware.ts`.

**Effort:** 30 min + redeploy.

---

### M6 — `auth.ts` issues a session even if `companyId` is empty/null
**Evidence:** `src/auth.ts:88-96`. `companyId: user.companyId` — if `user.companyId` is somehow falsy (data inconsistency), `getCompanyId()` later throws 401, but the user already has a valid cookie for /dashboard.

**Fix:** Refuse login if `user.companyId` is null. Add `select: { companyId: true, active: true }` and early-return null in `authorize()`.

**Effort:** 15 min.

---

### M7 — `Subscription.upsert` uses literal sentinel `"____new____"` as fallback id
**File:** `src/app/api/billing/checkout/route.ts:149-150`
```ts
const subscription = await prisma.subscription.upsert({
  where: { id: existingSub?.id ?? "____new____" },
```
If someone ever creates a subscription with id `"____new____"`, the next checkout will silently update it. Low risk (cuids by default), but the pattern is fragile.

**Fix:** Branch: if `existingSub`, do `update`; else `create`.

**Effort:** 5 min.

---

### M8 — `validateBranchOwnership` only used 13 times, but ~20+ endpoints accept `branchId` from request body
**Files:** various (`grep -rn "branchId" src/app/api/`).

Each unguarded `branchId` is a cross-branch (and potentially cross-company) write. Audit each endpoint accepting `branchId` and add the validation call.

**Effort:** 2 h.

---

## LOW

### L1 — `cnpj` uniqueness is enforced globally (single tenant per CNPJ) but the API leaks "Já existe uma empresa cadastrada com este CNPJ/CPF" — minor enumeration of registered businesses.
**File:** `src/app/api/public/register/route.ts:56-65`. Return a generic "Não foi possível concluir o cadastro" to avoid revealing tenant existence by CNPJ probing.

### L2 — `console.log` on session/JWT callbacks emit unnecessary detail
Files: `src/auth.ts:126-153`. Remove in production.

### L3 — `Prescription.imageUrl` becomes stale if companies migrate buckets; no consistency check on read.

### L4 — `image: { remotePatterns: [{ hostname: 'localhost' }] }` in `next.config.ts:5-15`. Forgotten dev pattern. Either restrict to actual prod hosts (Supabase project URL, your CDN) or remove for now.

### L5 — `cookies.delete` in `clear-session/route.ts:14-20` iterates all cookies (including those for other domains/paths) without checking ownership — harmless in practice but noisy.

### L6 — Several endpoints catch errors and `console.error(e)` without sanitization. If structured logging is later wired to a SIEM, secrets in error.meta could be ingested.

### L7 — `next.config.ts` does not set `poweredByHeader: false`. Vercel still strips `X-Powered-By` by default, but cleaner to be explicit.

### L8 — `bcrypt.hash(password, 10)` — work factor 10 was OK in 2020; 2026 best practice is 12+ (or migrate to Argon2id). Affects `src/auth.ts` and all bcrypt callers.

---

## Quick Wins (each < 30 min, real risk closed)

1. **Rotate `NEXTAUTH_SECRET`, `DATABASE_URL`, and SUPER_ADMIN password.** (15 min — H1 + C4)
2. **Delete `console.log`s in `src/auth.ts`** (emails, role, companyId on every request). (10 min — H7)
3. **Add `where: { id: userId, companyId }` to `PermissionService.setUserPermission` and `getUserEffectivePermissions`** — closes C1 IDOR. (15 min)
4. **Add CSP header to `next.config.ts`** — even a permissive `default-src 'self' 'unsafe-inline'` is better than missing. (10 min — H2)
5. **Disable `/api/admin/seed` in production** with `if (process.env.SEED_ENABLED !== '1') return 404`. Set the env var only locally. (5 min — C2)
6. **Bound `console.log` for failed logins** to avoid email enumeration in Vercel logs. (5 min — C7/H7)
7. **Restrict `sameSite` to `strict`** on session cookies. (5 min — H9)
8. **Hash the email in `authorize()` log statements** if you must keep them. (10 min)
9. **Cap `message` length to 5000 chars in `/api/public/contact`** to bound abuse storage. (5 min — M2)
10. **Switch `subscription.upsert` to an explicit `if (existingSub) update else create`** in `/api/billing/checkout/route.ts:149-172`. (10 min — M7)

---

## LGPD Compliance Gap Analysis

| Requirement (LGPD article) | Status | Gap |
|---|---|---|
| Art. 6, V — necessity / minimization | PARTIAL | Authentication logs include full email and IDs on every request. |
| Art. 7 — legal basis recorded | MISSING | No per-customer consent record; `acceptsMarketing` boolean exists but no audit trail of when/how consent was captured. |
| Art. 9 — clear, transparent info to data subject | MISSING | No "Política de Privacidade" surfaced at registration; only a footer link exists (per repo layout, `/privacidade`). Recommend adding a consent checkbox + version reference at registration. |
| Art. 11 — sensitive data (saúde) | BREACH RISK | Prescription images on public bucket (C6); prescription values in plaintext. Required: explicit informed consent + encryption at rest. |
| Art. 18 — data subject rights (access, deletion, portability) | MISSING | No customer-facing endpoint to export or delete their data. The `/api/data-management/delete` route operates at the company-admin level only. |
| Art. 37 — record of processing operations | PARTIAL | `GlobalAudit` exists, but coverage is uneven; PII access is not logged. |
| Art. 41 — DPO | UNKNOWN | No public contact for DPO disclosed. Required for processors of sensitive data. |
| Art. 46 — security measures | PARTIAL | TLS enabled; bcrypt for passwords; missing: column-level encryption, secret rotation policy, incident response plan documented. |
| Art. 48 — breach notification | NOT READY | No documented runbook. |

**Top recommendations to close LGPD posture:**
1. Make the prescription bucket private (C6) — this is the single most impactful change.
2. Add a consent log: `CustomerConsent` table with `(customerId, scope, version, grantedAt, ipAddress)`.
3. Build customer-facing `GET /api/portal/me/data` (export) and `DELETE /api/portal/me` (right to be forgotten), gated by an emailed token.
4. Encrypt `cpf`, `rg`, and `PrescriptionValues.*` at the application layer (libsodium-based middleware).
5. Publish a Política de Privacidade page with company DPO contact, and version it via a `PrivacyPolicy` model so consent always references a specific version.

---

## Suggested New Security Features

1. **Centralized tenant-aware Prisma client.** Wire `prisma-tenant.ts` into a `getTenantPrisma()` helper that all services use. Add CI lint to ban raw `prisma.<model>.find*` without a `companyId` filter in services.
2. **2FA (TOTP) for AdminUser and tenant ADMIN roles.** Use `otplib`. Mandatory for SUPER_ADMIN.
3. **Audit log middleware** (`src/lib/prisma-audit-middleware.ts` already exists — verify it is mounted in `src/lib/prisma.ts`). Log reads of `Customer.cpf`, `Prescription.*`, `PrescriptionValues.*`.
4. **Durable rate-limit store** (Upstash Redis) replacing in-memory map. Apply to: NextAuth callback, /api/public/register, /api/public/contact, password-reset, OCR.
5. **Session invalidation API** — server-side blacklist of `jti` claims; map "force-logout" page to a real revocation.
6. **HMAC signing for webhooks** + IP allowlist for Asaas egress.
7. **Field-level encryption** for sensitive PII (libsodium + Prisma middleware).
8. **Security headers** completion: CSP with nonces, COOP, CORP, COEP if hosting prescription images same-origin.
9. **Email verification flow** for self-service registration.
10. **Penetration test** before onboarding the first paying customer (this report alone is not a substitute).

---

## Inventory of Files Reviewed

- `src/auth.ts`
- `src/auth.config.ts`
- `src/auth-admin.ts`
- `src/auth-admin.config.ts`
- `src/middleware.ts`
- `src/lib/auth-helpers.ts`
- `src/lib/admin-session.ts`
- `src/lib/permissions.ts`
- `src/lib/prisma-tenant.ts`
- `src/lib/get-tenant.ts`
- `src/lib/error-handler.ts`
- `src/lib/rate-limit.ts`
- `src/lib/asaas.ts`
- `src/lib/supabase.ts`
- `src/lib/validate-branch.ts`
- `src/app/api/webhooks/asaas/route.ts`
- `src/app/api/billing/checkout/route.ts`
- `src/app/api/upload/prescription-image/route.ts`
- `src/app/api/ocr/prescription/route.ts`
- `src/app/api/auth/impersonate-session/route.ts`
- `src/app/api/auth/activate/route.ts`
- `src/app/api/auth/validate-invite/route.ts`
- `src/app/api/auth/clear-session/route.ts`
- `src/app/api/admin/auth/login/route.ts`
- `src/app/api/admin/impersonate/route.ts`
- `src/app/api/admin/seed/route.ts`
- `src/app/api/admin/clientes/create/route.ts`
- `src/app/api/users/[id]/permissions/route.ts`
- `src/app/api/permissions/seed/route.ts`
- `src/app/api/public/register/route.ts`
- `src/app/api/public/contact/route.ts`
- `src/app/api/customers/route.ts`
- `src/app/api/customers/[id]/route.ts`
- `src/app/api/sales/route.ts` (rate-limit check)
- `src/app/api/sales/[id]/route.ts`
- `src/app/api/sales/[id]/pdf/route.ts`
- `src/app/api/finance/entries/route.ts`
- `src/app/api/data-management/delete/route.ts`
- `src/services/customer.service.ts`
- `src/services/prescription.service.ts`
- `src/services/permission.service.ts`
- `src/services/sale.service.ts`
- `src/services/product.service.ts` (raw SQL inspection)
- `src/app/layout.tsx` (dangerouslySetInnerHTML inspection)
- `src/components/caixa/modal-detalhes-caixa.tsx`
- `next.config.ts`
- `prisma/schema.prisma` (Customer, Prescription, User models)
- `.env`, `.env.example`, `.gitignore`

Production live tests run with `curl` against `https://pdv-otica.vercel.app/login`, `/dashboard`, `/api/customers`, `/api/public/contact`, `/.env` (404 — good).

---

**End of Agent 1 report.**
