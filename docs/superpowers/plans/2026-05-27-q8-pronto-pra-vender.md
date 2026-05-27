# Sprint Q8 — Pronto pra Vender — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabilizar o PDV ÓTICA ao ponto de poder ser vendido como SaaS (receita garantida + integridade financeira + segurança admin + schema confiável).

**Architecture:** 5 fases sequenciais com checkpoints intermediários. Receita primeiro (Q8.1), depois schema (Q8.4) paralelo com finance (Q8.2), depois segurança admin (Q8.3) solo, finalizando com E2E (Q8.5). Cada sub-task é commit atômico com TDD.

**Tech Stack:** Next.js 16 (App Router), Prisma ORM, PostgreSQL (Neon), TypeScript, Vitest (unit), Playwright (E2E), Vercel (deploy + Cron), Asaas (billing gateway), Resend (email), speakeasy (TOTP).

**Spec:** [docs/superpowers/specs/2026-05-27-q8-pronto-pra-vender-design.md](../specs/2026-05-27-q8-pronto-pra-vender-design.md)

**Estimativa total:** 40-52h (revisada após audit de estado real — vide §0)

---

## §0 — Status real do código (validado 2026-05-27)

| Item Q8 | Status real | Esforço gap |
|---|---|---|
| Q8.1.1 `checkSubscription()` + gate layout | ✅ FEITO; só ajustar 7d→3d + flags | 1h |
| Q8.1.2 Webhook retry (retryCount + cron) | ✅ FEITO; falta `lastErrorAt` + Sentry alert | 1h |
| Q8.1.3 Checkout idempotente | ❌ FALTA totalmente | 3h |
| Q8.1.4 Email PAST_DUE (Resend) | ❌ FALTA totalmente | 4h |
| Q8.2.1 Estorno AR compensatório | ❌ FALTA totalmente | 6h |
| Q8.2.2 FinanceEntryRetry integration | ✅ FEITO; falta ABANDONED enum + Sentry | 1h |
| Q8.2.3 Idempotency POST /api/sales | ❌ FALTA totalmente | 3h |
| Q8.2.4 Script auditoria histórica | ❌ FALTA | 2h |
| Q8.2.5 Cash shift close lock | ❌ FALTA | 1h |
| Q8.3.1 MFA admin (TOTP) | ❌ FALTA totalmente | 5h |
| Q8.3.2 Rate limit em 48 rotas admin | ❌ FALTA totalmente | 4h |
| Q8.3.3 Impersonation 1-sessão (schema OK, lógica não) | ⚠️ PARCIAL | 1h |
| Q8.3.4 Audit log expandido | ⚠️ PARCIAL | 2h |
| Q8.4.0 migration_lock.toml + drift confirm | ❌ FALTA | 1h |
| Q8.4.1 Baseline migration | ⏳ Depende Q8.4.0 | 2h |
| Q8.4.2 Composite uniques + codemod | ❌ FALTA | 4h |
| Q8.4.3 Soft-delete middleware | ⏭️ **MOVIDO PRA Q9** | - |
| Q8.4.4 CI drift check | ❌ FALTA | 1h |
| Q8.5.1 E2E 3 fluxos críticos | ❌ FALTA | 3h |
| Q8.5.2 Smoke 10 páginas | ⏭️ **CORTADO** | - |
| Q8.5.3 Sentry ativo + alertas | ⚠️ PARCIAL | 1h |
| Q8.99 Wrap-up | - | 2h |

**Soma do gap:** ~47h. Realista 40-52h com buffer.

**Super-cron consolidação** (§4.5 do spec) é necessária porque vamos adicionar `suspensionSweep` + `retryWebhooks` aos crons. Custo: ~1h adicional.

---

## File Structure

Antes de codar, mapa de arquivos que serão criados/modificados:

**Novos (criados):**
- `prisma/migrations/migration_lock.toml`
- `prisma/migrations/20260528_q8_idempotency_keys/migration.sql`
- `prisma/migrations/20260528_q8_mfa_fields/migration.sql`
- `prisma/migrations/20260528_q8_baseline_drift_recovery/migration.sql` (condicional)
- `prisma/migrations/20260528_q8_composite_uniques/migration.sql`
- `qa-artifacts/Q8-baseline/README.md`
- `qa-artifacts/Q8-data-audit.md`
- `qa-artifacts/Q8-schema-drift.md`
- `qa-artifacts/Q8-finance-audit.md`
- `scripts/audit-q8-data.ts`
- `scripts/audit-finance-consistency.ts`
- `scripts/check-duplicate-emails.ts`
- `scripts/check-duplicate-fiscalrefs.ts`
- `scripts/check-duplicate-invoicenumbers.ts`
- `src/lib/idempotency.ts` (canonicalize + hash)
- `src/lib/emails/past-due.tsx` (React Email template)
- `src/lib/emails/client.ts` (Resend wrapper)
- `src/lib/totp.ts` (speakeasy wrapper)
- `src/middleware/admin-rate-limit.ts` (helper, não Next middleware)
- `src/app/api/cron/tick/route.ts` (super-cron)
- `src/app/api/admin/auth/mfa/enroll/route.ts`
- `src/app/api/admin/auth/mfa/verify/route.ts`
- `src/app/api/accounts-receivable/[id]/reverse/route.ts`
- `src/components/admin/MfaEnrollment.tsx`
- `.github/workflows/check-drift.yml`
- `e2e/critical-flows.spec.ts`
- `docs/Q8-retro.md`

**Modificados:**
- `prisma/schema.prisma` (adicionar campos MFA, idempotency, ABANDONED enum, lastErrorAt)
- `package.json` (resend, speakeasy, @types/speakeasy)
- `vercel.json` (super-cron entry)
- `src/lib/subscription.ts` (grace 7→3, flags)
- `src/services/finance-retry.service.ts` (ABANDONED status, Sentry alert)
- `src/services/sale.service.ts` (idempotency check)
- `src/services/cash.service.ts` (closeShift SELECT FOR UPDATE)
- `src/app/api/webhooks/asaas/route.ts` (lastErrorAt, email trigger)
- `src/app/api/billing/checkout/route.ts` (idempotencyKey)
- `src/app/api/sales/route.ts` (Idempotency-Key header)
- `src/app/api/admin/auth/login/route.ts` (TOTP step)
- `src/app/api/admin/impersonate/[id]/route.ts` (revoke previous sessions)
- `src/app/api/cron/dunning/route.ts` (audit log expansion)
- `src/auth-admin.ts` (MFA flow)
- `CHANGELOG.md`
- `BLUEPRINT_FUNCIONAL_PDV.md`
- `CONTRIBUTING.md` (workflow migrations)

---

## Fase Q8.0 — Pré-flight (1-2h)

### Task 0.1: Snapshot de baseline

**Files:**
- Create: `qa-artifacts/Q8-baseline/README.md`
- Create: `qa-artifacts/Q8-baseline/test-results.txt`
- Create: `qa-artifacts/Q8-baseline/git-log.txt`

- [ ] **Step 1: Capturar test results atuais**

```bash
cd "/Users/matheusreboucas/PDV OTICA"
npm test 2>&1 | tee qa-artifacts/Q8-baseline/test-results.txt
```

Expected: testes rodam, output salvo (verde ou vermelho — apenas baseline)

- [ ] **Step 2: Snapshot git e deploys**

```bash
git log --oneline -20 > qa-artifacts/Q8-baseline/git-log.txt
git rev-parse HEAD > qa-artifacts/Q8-baseline/baseline-commit.txt
```

- [ ] **Step 3: Listar env vars necessárias no spec**

Editar `qa-artifacts/Q8-baseline/README.md` com tabela: env var, fase que precisa, quem provê (você vs eu), status atual.

- [ ] **Step 4: Commit baseline**

```bash
git add qa-artifacts/Q8-baseline/
git commit -m "chore(q8): snapshot baseline antes do sprint"
```

### Task 0.2: Backup Neon manual

**Files:** N/A (operação no painel Neon)

- [ ] **Step 1: Você abre painel Neon e tira snapshot**

Acessar `https://console.neon.tech` → projeto PDV OTICA → branch `main` → "Create branch" com nome `q8-pre-sprint-backup-20260527`. Esse é o backup gratuito do Neon.

- [ ] **Step 2: Confirmar branch criada**

Você cola screenshot ou URL no chat. Eu documento em `qa-artifacts/Q8-baseline/README.md`.

---

## Fase Q8.0.5 — Auditoria de dados (1-2h)

### Task 0.5.1: Escrever script de audit

**Files:**
- Create: `scripts/audit-q8-data.ts`

- [ ] **Step 1: Escrever script TypeScript**

```typescript
// scripts/audit-q8-data.ts
import { prisma } from "@/lib/prisma";

async function main() {
  const totalSales = await prisma.sale.count({ where: { status: "COMPLETED" } });
  const salesWithoutFinance = await prisma.sale.count({
    where: {
      status: "COMPLETED",
      financeEntries: { none: {} },
    },
  });

  const totalARReceived = await prisma.accountReceivable.count({ where: { status: "RECEIVED" } });
  // AR sem CashMovement correspondente: heurística via originType
  const arWithoutCash = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint as count FROM "AccountReceivable" ar
    WHERE ar.status = 'RECEIVED'
      AND NOT EXISTS (
        SELECT 1 FROM "CashMovement" cm
        WHERE cm."originId" = ar.id AND cm."originType" = 'AccountReceivable'
      )
  `;

  // Duplicatas email cross-tenant
  const duplicateEmails = await prisma.$queryRaw<Array<{ email: string; cnt: bigint }>>`
    SELECT email, COUNT(DISTINCT "companyId")::bigint as cnt
    FROM "User"
    GROUP BY email
    HAVING COUNT(DISTINCT "companyId") > 1
  `;

  // Webhooks órfãos
  const orphanWebhooks = await prisma.billingEvent.count({
    where: { processedAt: null, retryCount: { gt: 0 } },
  });

  // PAST_DUE > 30d ativos
  const pastDueActive = await prisma.subscription.findMany({
    where: {
      status: "PAST_DUE",
      currentPeriodEnd: { lt: new Date(Date.now() - 30 * 86400 * 1000) },
    },
    include: { plan: true, company: { select: { name: true, isBlocked: true } } },
  });

  const report = {
    timestamp: new Date().toISOString(),
    salesIntegrity: {
      total: totalSales,
      withoutFinance: salesWithoutFinance,
      pct: totalSales > 0 ? (salesWithoutFinance / totalSales * 100).toFixed(2) : "0",
      threshold: "0.5% OR 50 absoluto",
      breach: salesWithoutFinance > 50 || (totalSales > 0 && salesWithoutFinance / totalSales > 0.005),
    },
    arIntegrity: {
      total: totalARReceived,
      withoutCash: Number(arWithoutCash[0]?.count ?? 0),
      breach: Number(arWithoutCash[0]?.count ?? 0) > 20,
    },
    emailDuplicates: {
      count: duplicateEmails.length,
      list: duplicateEmails.slice(0, 20),
      breach: duplicateEmails.length > 0,
    },
    webhooks: {
      orphans: orphanWebhooks,
      breach: orphanWebhooks > 10,
    },
    revenue: {
      pastDueOver30d: pastDueActive.length,
      tenants: pastDueActive.map(s => ({
        company: s.company.name,
        isBlocked: s.company.isBlocked,
        plan: s.plan?.name,
        daysOverdue: Math.floor((Date.now() - s.currentPeriodEnd.getTime()) / 86400000),
      })),
    },
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.salesIntegrity.breach || report.arIntegrity.breach || report.emailDuplicates.breach || report.webhooks.breach ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
```

- [ ] **Step 2: Rodar script contra prod (Neon)**

```bash
cd "/Users/matheusreboucas/PDV OTICA"
npx tsx scripts/audit-q8-data.ts > qa-artifacts/Q8-data-audit.json 2>&1
echo "Exit: $?" >> qa-artifacts/Q8-data-audit.json
```

Expected: JSON com métricas. Exit 0 = tudo OK. Exit 1 = breach detectado.

- [ ] **Step 3: Converter pra Markdown legível**

Eu escrevo `qa-artifacts/Q8-data-audit.md` com narrativa: o que mediu, valores, breach ou não, recomendação.

- [ ] **Step 4: Commit + 🛑 CHECKPOINT contigo**

```bash
git add scripts/audit-q8-data.ts qa-artifacts/Q8-data-audit.*
git commit -m "chore(q8): audit de dados de prod"
```

**🛑 PAUSAR**: você lê `qa-artifacts/Q8-data-audit.md`. Decisão:
- Sem breach → segue Q8.1
- Com breach → entra Q8.0.6 (data cleanup) primeiro

---

## Fase Q8.0.6 — Data cleanup (condicional, 2-8h, só se 0.5 acionar)

**Skip se Q8.0.5 não acionou breach.**

### Task 0.6.1: Script de cleanup (dry-run)

**Files:**
- Create: `scripts/cleanup-q8-data.ts`

- [ ] **Step 1: Escrever cleanup com flag `--dry-run`**

Script processa por categoria:
- Vendas sem FinanceEntry → chamar `generateSaleEntries(saleId)` retroativo (idempotente)
- AR sem CashMovement → criar CashMovement em shift de ajuste etiquetado
- Email duplicados → APENAS relatório (não automatizar)
- Webhooks órfãos → marcar como `ABANDONED` no campo correspondente (precisa Q8.2.2 antes)

- [ ] **Step 2: Rodar com `--dry-run` em prod**

```bash
npx tsx scripts/cleanup-q8-data.ts --dry-run > qa-artifacts/Q8-cleanup-dryrun.json
```

- [ ] **Step 3: 🛑 CHECKPOINT — você aprova rodar sem dry-run**

- [ ] **Step 4: Rodar real + commit**

```bash
npx tsx scripts/cleanup-q8-data.ts > qa-artifacts/Q8-cleanup-report.json
git add scripts/cleanup-q8-data.ts qa-artifacts/Q8-cleanup-*
git commit -m "fix(q8): cleanup de dados históricos"
```

---

## Fase Q8.1 — Receita Garantida (8-9h)

### Task 1.1: Ajustar grace period 7d → 3d + feature flag

**Files:**
- Modify: `src/lib/subscription.ts:157` (grace condition)
- Modify: `.env.example` (adicionar `ENFORCE_SUSPENSION`, `SUBSCRIPTION_BYPASS_COMPANY_IDS`)
- Create: `src/lib/__tests__/subscription.test.ts`

- [ ] **Step 1: Escrever testes failantes (TDD)**

```typescript
// src/lib/__tests__/subscription.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkSubscription } from "../subscription";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: vi.fn() },
    subscription: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

function mockCompany(overrides: Partial<{ accessEnabled: boolean; isBlocked: boolean; name: string }> = {}) {
  (prisma.company.findUnique as any).mockResolvedValue({
    accessEnabled: false, isBlocked: false, name: "Test Co", ...overrides,
  });
}

function mockSubscription(daysOverdue: number, status = "PAST_DUE") {
  const currentPeriodEnd = new Date(Date.now() - daysOverdue * 86400 * 1000);
  (prisma.subscription.findFirst as any).mockResolvedValue({
    id: "sub1", status, currentPeriodEnd,
    plan: { name: "Pro", priceMonthly: 99 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ENFORCE_SUSPENSION;
  delete process.env.SUBSCRIPTION_BYPASS_COMPANY_IDS;
});

describe("checkSubscription — Q8 grace period", () => {
  it("permite PAST_DUE com 2 dias atraso (dentro grace 3d)", async () => {
    mockCompany();
    mockSubscription(2);
    const result = await checkSubscription("co1");
    expect(result.allowed).toBe(true);
    expect(result.status).toBe("PAST_DUE");
    expect(result.daysOverdue).toBe(2);
  });

  it("BLOQUEIA PAST_DUE com 4 dias atraso (fora grace 3d)", async () => {
    mockCompany();
    mockSubscription(4);
    (prisma.subscription.update as any).mockResolvedValue({});
    const result = await checkSubscription("co1");
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("SUSPENDED");
  });

  it("respeita ENFORCE_SUSPENSION=false (libera mesmo com PAST_DUE 30d)", async () => {
    process.env.ENFORCE_SUSPENSION = "false";
    mockCompany();
    mockSubscription(30);
    const result = await checkSubscription("co1");
    expect(result.allowed).toBe(true);
    expect(result.message).toContain("ENFORCE_SUSPENSION");
  });

  it("respeita SUBSCRIPTION_BYPASS_COMPANY_IDS (libera tenant na whitelist)", async () => {
    process.env.SUBSCRIPTION_BYPASS_COMPANY_IDS = "co1,co2";
    mockCompany();
    mockSubscription(30);
    const result = await checkSubscription("co1");
    expect(result.allowed).toBe(true);
    expect(result.message).toBe("BYPASS_LIST");
  });
});
```

- [ ] **Step 2: Rodar tests — devem FALHAR**

```bash
npx vitest run src/lib/__tests__/subscription.test.ts
```

Expected: 4 failures (grace ainda é 7d, flags não existem)

- [ ] **Step 3: Modificar `src/lib/subscription.ts:157`**

Trocar `daysOverdue <= 7` por `daysOverdue <= 3` (no `if` que decide PAST_DUE vs SUSPENDED).

Adicionar no topo da função, antes de qualquer query:
```typescript
if (process.env.ENFORCE_SUSPENSION === "false") {
  return { allowed: true, status: "ACTIVE", readOnly: false, message: "ENFORCE_SUSPENSION=false" };
}
const bypassIds = (process.env.SUBSCRIPTION_BYPASS_COMPANY_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
if (bypassIds.includes(companyId)) {
  return { allowed: true, status: "ACTIVE", readOnly: false, message: "BYPASS_LIST" };
}
```

- [ ] **Step 4: Rodar tests — devem PASSAR**

```bash
npx vitest run src/lib/__tests__/subscription.test.ts
```

- [ ] **Step 5: Atualizar `.env.example`**

```
# Q8.1.1 — Suspensão automática
ENFORCE_SUSPENSION=true                   # set "false" para destravar todos
SUBSCRIPTION_BYPASS_COMPANY_IDS=          # CSV de companyIds que bypassam
```

- [ ] **Step 5.5: Validar whitelist de rotas no layout gate**

Spec §5 Q8.1.1 lista whitelist obrigatório: `/assinatura/pagar`, `/api/billing/*`, `/api/webhooks/*`, `/api/auth/*`, `/admin/*` devem sempre passar.

```bash
# Verificar que app/(dashboard)/layout.tsx redireciona pra /assinatura/pagar quando bloqueado
grep -n "assinatura/pagar\|redirect" "src/app/(dashboard)/layout.tsx"
```

Se layout só renderiza `<SubscriptionBlocked>` sem oferecer link de pagamento → adicionar link. Se rotas `/api/billing/*` etc são afetadas pelo gate (não deveriam — não passam pelo layout), confirmar via test:

```typescript
it("rotas /api/billing/checkout NÃO são bloqueadas mesmo com tenant SUSPENDED", async () => {
  // POST /api/billing/checkout com session de tenant SUSPENDED → 200, não 403
});
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/subscription.ts src/lib/__tests__/subscription.test.ts .env.example
git commit -m "fix(q8.1.1): grace period 7d→3d + flags ENFORCE_SUSPENSION e BYPASS_IDS"
```

### Task 1.2: Adicionar `BillingEvent.lastErrorAt` + Sentry alert no webhook retry

**Files:**
- Modify: `prisma/schema.prisma` (campo BillingEvent.lastErrorAt)
- Create: `prisma/migrations/20260528_q8_billing_lasterror/migration.sql`
- Modify: `src/app/api/webhooks/asaas/route.ts` (set lastErrorAt + Sentry call)

- [ ] **Step 1: Adicionar campo no schema**

Edit `prisma/schema.prisma` no model BillingEvent:
```prisma
lastErrorAt  DateTime?
```

- [ ] **Step 2: Gerar migration**

```bash
npx prisma migrate dev --name q8_billing_lasterror --create-only
```

Editar o SQL gerado pra usar `IF NOT EXISTS`:
```sql
ALTER TABLE "BillingEvent" ADD COLUMN IF NOT EXISTS "lastErrorAt" TIMESTAMP(3);
```

- [ ] **Step 3: Modificar webhook handler**

Em `src/app/api/webhooks/asaas/route.ts` no catch do `processEvent`:
```typescript
await prisma.billingEvent.update({
  where: { id: event.id },
  data: {
    retryCount: { increment: 1 },
    error: errMsg,
    lastErrorAt: new Date(),
  },
});

if (newRetryCount === 3) {
  Sentry.captureMessage(`Webhook ${event.id} hit retry attempt 3`, "warning");
}
```

- [ ] **Step 4: Aplicar migration local + commit**

```bash
npx prisma migrate dev
git add prisma/ src/app/api/webhooks/asaas/route.ts
git commit -m "fix(q8.1.2): lastErrorAt + Sentry alert em webhook retry 3"
```

### Task 1.3: Idempotency em checkout (Subscription.idempotencyKey)

**Files:**
- Modify: `prisma/schema.prisma` (Subscription.idempotencyKey)
- Create: `prisma/migrations/20260528_q8_subscription_idempotency/migration.sql`
- Modify: `src/app/api/billing/checkout/route.ts`
- Create: `src/app/api/billing/checkout/__tests__/idempotency.test.ts`

- [ ] **Step 1: Testes failantes**

```typescript
describe("POST /api/billing/checkout — idempotency", () => {
  it("retorna mesma subscription quando Idempotency-Key repetido", async () => {
    const key = crypto.randomUUID();
    const r1 = await POST(buildRequest({ planId: "p1", "Idempotency-Key": key }));
    const r2 = await POST(buildRequest({ planId: "p1", "Idempotency-Key": key }));
    expect((await r1.json()).subscriptionId).toBe((await r2.json()).subscriptionId);
  });
});
```

- [ ] **Step 2: Adicionar campo no schema**

```prisma
model Subscription {
  // ...
  idempotencyKey String? @unique
}
```

- [ ] **Step 3: Migration**

```bash
npx prisma migrate dev --name q8_subscription_idempotency --create-only
# editar pra IF NOT EXISTS no ADD COLUMN, e CREATE UNIQUE INDEX IF NOT EXISTS
npx prisma migrate dev
```

- [ ] **Step 4: Modificar handler checkout**

```typescript
const idempKey = request.headers.get("idempotency-key");
if (idempKey) {
  const existing = await prisma.subscription.findUnique({ where: { idempotencyKey: idempKey } });
  if (existing) {
    return NextResponse.json({ subscriptionId: existing.id, idempotent: true });
  }
}
// ... lógica existente ...
const subscription = await prisma.subscription.create({
  data: { /* ... */, idempotencyKey: idempKey ?? null },
});
```

- [ ] **Step 5: Tests verdes + commit**

```bash
npx vitest run src/app/api/billing/checkout/
git add prisma/ src/app/api/billing/checkout/
git commit -m "feat(q8.1.3): checkout idempotente via Idempotency-Key header"
```

### Task 1.4: Email PAST_DUE via Resend

**Files:**
- Modify: `package.json` (deps)
- Modify: `.env.example` (RESEND_API_KEY)
- Create: `src/lib/emails/client.ts`
- Create: `src/lib/emails/past-due.tsx`
- Create: `src/lib/emails/__tests__/past-due.test.ts`
- Modify: `src/app/api/webhooks/asaas/route.ts` (trigger em PAYMENT_OVERDUE)

- [ ] **Step 1: Instalar Resend + React Email**

```bash
npm i resend @react-email/components @react-email/render
```

- [ ] **Step 2: Wrapper de cliente**

```typescript
// src/lib/emails/client.ts
import { Resend } from "resend";

let _resend: Resend | null = null;
export function resend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not set");
    _resend = new Resend(key);
  }
  return _resend;
}

export async function sendPastDueEmail(args: { to: string; companyName: string; amount: number; dueDate: Date; paymentLink: string; daysUntilSuspension: number }) {
  const { render } = await import("@react-email/render");
  const { PastDueEmail } = await import("./past-due");
  const html = await render(PastDueEmail(args));
  return resend().emails.send({
    from: process.env.EMAIL_FROM ?? "noreply@pdvotica.com.br",
    to: args.to,
    subject: `[PDV ÓTICA] Pagamento pendente — ${args.daysUntilSuspension} dias até suspensão`,
    html,
  });
}
```

- [ ] **Step 3: Template React Email**

```tsx
// src/lib/emails/past-due.tsx
import { Html, Head, Body, Container, Text, Button, Heading } from "@react-email/components";

export function PastDueEmail({ companyName, amount, dueDate, paymentLink, daysUntilSuspension }: { companyName: string; amount: number; dueDate: Date; paymentLink: string; daysUntilSuspension: number }) {
  return (
    <Html><Head /><Body>
      <Container>
        <Heading>Olá, {companyName}</Heading>
        <Text>Identificamos que o pagamento da sua assinatura está pendente.</Text>
        <Text><strong>Valor: R$ {amount.toFixed(2)}</strong></Text>
        <Text>Vencimento: {dueDate.toLocaleDateString("pt-BR")}</Text>
        <Text>Seu acesso ao sistema será suspenso em {daysUntilSuspension} dia(s).</Text>
        <Button href={paymentLink}>Pagar agora</Button>
      </Container>
    </Body></Html>
  );
}
```

- [ ] **Step 4: Trigger no webhook + agendamento D+1/D+2/D+3**

Spec §5 Q8.1.4: emails em D+1, D+2, D+3 (não apenas 1).

Estratégia: 1 email imediato no PAYMENT_OVERDUE (D+1, daysUntilSuspension=3), depois cron `dunning` envia subsequentes baseado em `daysOverdue`.

Em `src/app/api/webhooks/asaas/route.ts`, ao processar `PAYMENT_OVERDUE`:
```typescript
if (eventType === "PAYMENT_OVERDUE" && subscription?.company?.email) {
  // Email imediato — D+1
  await sendPastDueEmail({
    to: subscription.company.email,
    companyName: subscription.company.name,
    amount: invoice.value,
    dueDate: invoice.dueDate,
    paymentLink: invoice.invoiceUrl,
    daysUntilSuspension: 3,
  }).catch(err => log.error("past_due_email_failed", { err: String(err) }));
}
```

Em `src/app/api/cron/dunning/route.ts` (já existe, modificar): adicionar lógica de "envia email se daysOverdue ∈ {1, 2, 3} e não enviou hoje". Tabela auxiliar `PastDueEmailLog { companyId, sentAt, daysOverdue }` (criar via migration `q8_past_due_email_log`) para idempotência diária.

```typescript
// Em dunning, ao iterar tenants PAST_DUE:
const today = startOfDay(new Date());
const alreadySent = await prisma.pastDueEmailLog.findFirst({
  where: { companyId: sub.companyId, sentAt: { gte: today } },
});
if (!alreadySent && [1, 2, 3].includes(daysOverdue)) {
  await sendPastDueEmail({ /* ... */ daysUntilSuspension: 3 - daysOverdue + 1 });
  await prisma.pastDueEmailLog.create({ data: { companyId: sub.companyId, sentAt: new Date(), daysOverdue } });
}
```

- [ ] **Step 5: Atualizar .env.example**

```
RESEND_API_KEY=
EMAIL_FROM=noreply@pdvotica.com.br
```

- [ ] **Step 6: Teste de integração com mock**

```typescript
// src/lib/emails/__tests__/past-due.test.ts
import { describe, it, expect, vi } from "vitest";
import { sendPastDueEmail } from "../client";

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: vi.fn().mockResolvedValue({ id: "test" }) } })),
}));

describe("sendPastDueEmail", () => {
  it("renderiza e envia", async () => {
    process.env.RESEND_API_KEY = "test";
    const r = await sendPastDueEmail({ to: "test@x.com", companyName: "Acme", amount: 149.90, dueDate: new Date("2026-06-01"), paymentLink: "https://asaas.com/x", daysUntilSuspension: 3 });
    expect(r.id).toBe("test");
  });
});
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/emails/ src/app/api/webhooks/asaas/route.ts .env.example
git commit -m "feat(q8.1.4): email PAST_DUE via Resend + template React Email"
```

---

## Fase Q8.4 — Schema & Migrations (5-7h)

⚠️ **Pode rodar em paralelo com Q8.2 (são áreas disjuntas).** Mas Q8.4.0 precisa rodar primeiro pra confirmar o que vai mudar.

### Task 4.0: Criar migration_lock.toml + confirmar drift

**Files:**
- Create: `prisma/migrations/migration_lock.toml`
- Create: `qa-artifacts/Q8-schema-drift.md`

- [ ] **Step 1: Criar lock**

```toml
# prisma/migrations/migration_lock.toml
provider = "postgresql"
```

- [ ] **Step 2: Diff schema declarado vs migrations**

```bash
cd "/Users/matheusreboucas/PDV OTICA"
npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script > /tmp/local-drift.sql
wc -l /tmp/local-drift.sql
```

Expected: SQL com `ALTER TABLE` pra cada coluna no schema que não está em migration.

- [ ] **Step 3: Diff prod vs schema declarado** (depende de Neon estar acessível)

```bash
npx prisma migrate diff \
  --from-url $DATABASE_URL \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script > /tmp/prod-drift.sql
```

Expected: empty (schema reflete prod via db push) ou diff = bugs já conhecidos.

- [ ] **Step 4: Diff prod vs migrations**

```bash
npx prisma migrate diff \
  --from-url $DATABASE_URL \
  --to-migrations ./prisma/migrations \
  --script > /tmp/prod-vs-migrations.sql
```

Expected: este é o **gap real** — colunas em prod que não foram aplicadas via migration.

- [ ] **Step 5: Escrever relatório**

`qa-artifacts/Q8-schema-drift.md` com 3 tabelas: local-drift, prod-drift, prod-vs-migrations + recomendação de baseline.

- [ ] **Step 6: Commit + 🛑 CHECKPOINT**

```bash
git add prisma/migrations/migration_lock.toml qa-artifacts/Q8-schema-drift.md
git commit -m "chore(q8.4.0): migration_lock + audit de drift real"
```

**🛑 PAUSAR**: você confirma que pode escrever baseline (Q8.4.1).

### Task 4.1: Baseline migration (evidence-based)

**Files:**
- Create: `prisma/migrations/20260528_q8_baseline_drift_recovery/migration.sql` (conteúdo definido em Q8.4.0)

- [ ] **Step 1: Escrever SQL com IF NOT EXISTS**

Conteúdo derivado do `qa-artifacts/Q8-schema-drift.md`. Apenas colunas confirmadas faltantes em prod.

- [ ] **Step 2: Testar em Neon branch**

```bash
# Criar branch Neon nova (do main) via API ou painel
# Setar DATABASE_URL pra branch
DATABASE_URL=<branch-url> npx prisma migrate deploy
```

Expected: aplica clean, sem erros.

- [ ] **Step 3: Verificar diff zero após apply**

```bash
DATABASE_URL=<branch-url> npx prisma migrate diff \
  --from-url $DATABASE_URL \
  --to-schema-datamodel ./prisma/schema.prisma \
  --exit-code
```

Expected: exit 0 = no diff.

- [ ] **Step 4: Commit**

```bash
git add prisma/migrations/20260528_q8_baseline_drift_recovery/
git commit -m "fix(q8.4.1): baseline migration recovery — alinha prod com versionado"
```

### Task 4.2: Pré-verificação duplicatas + composite uniques

**Files:**
- Create: `scripts/check-duplicate-emails.ts`
- Create: `scripts/check-duplicate-fiscalrefs.ts`
- Create: `scripts/check-duplicate-invoicenumbers.ts`
- Modify: `prisma/schema.prisma` (constraints)
- Create: `prisma/migrations/20260528_q8_composite_uniques/migration.sql`

- [ ] **Step 1: Scripts de pré-verificação**

```typescript
// scripts/check-duplicate-emails.ts
import { prisma } from "@/lib/prisma";
const dups = await prisma.$queryRaw<Array<{ email: string; cnt: bigint }>>`
  SELECT email, COUNT(DISTINCT "companyId")::bigint as cnt
  FROM "User"
  GROUP BY email HAVING COUNT(DISTINCT "companyId") > 1
`;
console.log(JSON.stringify(dups, null, 2));
process.exit(dups.length > 0 ? 1 : 0);
```

Similar pra `fiscalref` e `invoicenumber`.

- [ ] **Step 2: Rodar contra prod**

```bash
npx tsx scripts/check-duplicate-emails.ts > qa-artifacts/Q8-dup-emails.json
npx tsx scripts/check-duplicate-fiscalrefs.ts > qa-artifacts/Q8-dup-fiscalrefs.json
npx tsx scripts/check-duplicate-invoicenumbers.ts > qa-artifacts/Q8-dup-invoices.json
```

🛑 **CHECKPOINT** se algum retornar dup. Você decide cada caso.

- [ ] **Step 3: Audit de callsites**

```bash
grep -rn 'findUnique.*{ where:.*{ email:' src/ --include="*.ts"
grep -rn 'findUnique.*{ where:.*{ fiscalRef:' src/ --include="*.ts"
grep -rn 'findUnique.*{ where:.*{ invoiceNumber:' src/ --include="*.ts"
```

Eu listo cada callsite e proponho refactor (`findUnique({ where: { email_companyId: { email, companyId } } })` ou `findFirst`).

- [ ] **Step 4: Mudar schema**

```prisma
model User {
  // remove @unique de email
  email String
  // ...
  @@unique([companyId, email])
}
```

Idem `Sale.fiscalRef`, `AccountPayable.invoiceNumber`.

- [ ] **Step 5: Migration + codemod no mesmo commit**

```bash
npx prisma migrate dev --name q8_composite_uniques --create-only
```

⚠️ **EDITAR o SQL gerado para ser destrutivo-safe:**
```sql
-- Drop old unique constraints
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_key";
ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_fiscalRef_key";
ALTER TABLE "AccountPayable" DROP CONSTRAINT IF EXISTS "AccountPayable_invoiceNumber_key";

-- Create new composite uniques
CREATE UNIQUE INDEX IF NOT EXISTS "User_companyId_email_key" ON "User"("companyId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_companyId_fiscalRef_key" ON "Sale"("companyId", "fiscalRef");
CREATE UNIQUE INDEX IF NOT EXISTS "AccountPayable_companyId_supplierId_invoiceNumber_key" ON "AccountPayable"("companyId", "supplierId", "invoiceNumber");

-- ROLLBACK (manual, em caso de problema):
-- DROP INDEX "User_companyId_email_key";
-- DROP INDEX "Sale_companyId_fiscalRef_key";
-- DROP INDEX "AccountPayable_companyId_supplierId_invoiceNumber_key";
-- ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE ("email");  -- ⚠️ falha se houver duplicatas; precisa cleanup antes
-- ALTER TABLE "Sale" ADD CONSTRAINT "Sale_fiscalRef_key" UNIQUE ("fiscalRef");
-- ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_invoiceNumber_key" UNIQUE ("invoiceNumber");
```

⚠️ **PRE-DEPLOY check obrigatório:**
1. Verificar que `qa-artifacts/Q8-dup-emails.json` retornou `[]` (zero duplicatas) — sem isso, drop do unique falha em prod
2. Aplicar em Neon branch antes de prod
3. Manter Neon branch `q8-pre-sprint-backup-20260527` (criada em Q8.0.2) acessível pra rollback total via Neon "Restore from branch"

```bash
# Aplicar local
npx prisma migrate dev

# Eu reescrevo cada callsite identificado no Step 3 (lista em qa-artifacts/Q8-callsites-uniques.md)
npm test

git add prisma/ src/ qa-artifacts/Q8-callsites-uniques.md
git commit -m "fix(q8.4.2): composite uniques (companyId, email/fiscalRef/invoice) + codemod"
```

### Task 4.4: CI bloqueia drift

**Files:**
- Create: `.github/workflows/check-drift.yml`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Workflow YAML**

```yaml
name: Check schema drift
on: [pull_request]
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx prisma migrate diff --exit-code --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma
```

- [ ] **Step 2: Documentar workflow em CONTRIBUTING.md**

Seção nova: "Mudanças de schema":
1. Edite `prisma/schema.prisma`
2. Rode `npx prisma migrate dev --name <desc>`
3. Commit a migration junto com a mudança de schema

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/check-drift.yml CONTRIBUTING.md
git commit -m "ci(q8.4.4): bloqueia PRs com drift de schema"
```

---

## Fase Q8.2 — Integridade Financeira (12-14h)

### Task 2.1: Estorno AR cria FinanceEntry compensatório

**Files:**
- Create: `src/app/api/accounts-receivable/[id]/reverse/route.ts`
- Modify: `src/services/finance-entry.service.ts` (adicionar `generateReversalEntry`)
- Modify: `prisma/schema.prisma` (enum FinanceEntrySourceType adicionar `AR_REVERSAL`)
- Create: `src/app/api/accounts-receivable/[id]/reverse/__tests__/reverse.test.ts`

- [ ] **Step 1: Adicionar AR_REVERSAL no enum**

Em `prisma/schema.prisma`:
```prisma
enum FinanceEntrySourceType {
  // ...existentes
  AR_REVERSAL
}
```

Migration:
```bash
npx prisma migrate dev --name q8_ar_reversal_source_type
```

- [ ] **Step 2: Testes failantes (8 cenários)**

```typescript
describe("POST /api/accounts-receivable/[id]/reverse", () => {
  it("shift OPEN: cria CashMovement REFUND OUT no shift original", async () => { /* ... */ });
  it("shift CLOSED mesmo dia: cria em shift OPEN atual", async () => { /* ... */ });
  it("shift CLOSED outro dia: cria shift de ajuste", async () => { /* ... */ });
  it("sem shift OPEN: cria shift de ajuste", async () => { /* ... */ });
  it("valor parcial: aceita amount custom", async () => { /* ... */ });
  it("multi-parcela: reverte apenas a parcela", async () => { /* ... */ });
  it("com juros já recebidos: reverte juros junto", async () => { /* ... */ });
  it("cashback usado: restitui cashback", async () => { /* ... */ });
});
```

- [ ] **Step 3: Implementar handler**

```typescript
// src/app/api/accounts-receivable/[id]/reverse/route.ts
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const companyId = (session.user as any).companyId;
  const { id } = await params;
  const body = await request.json();
  const { reason, amount } = body;

  return await prisma.$transaction(async tx => {
    const ar = await tx.accountReceivable.findFirstOrThrow({ where: { id, companyId } });
    if (ar.status !== "RECEIVED") throw new Error("AR not RECEIVED");

    // 1. Reverter AR
    // ⚠️ Schema atual: AR já tem `receivedDate`, `receivedAmount`, `reversedAt`, `reversedBy` (linhas 1628-1639).
    //    NÃO tem `reversalReason` — usar campo `notes` pra anexar motivo, ou adicionar campo via migration separada.
    await tx.accountReceivable.update({
      where: { id },
      data: {
        status: "PENDING",
        receivedDate: null,
        receivedAmount: null,
        reversedAt: new Date(),
        reversedBy: session.user.id,
        notes: ar.notes ? `${ar.notes}\n[reversal] ${reason}` : `[reversal] ${reason}`,
      },
    });

    // 2. CashMovement reverso
    const originalCM = await tx.cashMovement.findFirst({
      where: { originId: ar.id, originType: "AccountReceivable", type: "IN" },
    });

    let targetShiftId: string | null = null;
    if (originalCM) {
      const origShift = await tx.cashShift.findUnique({ where: { id: originalCM.cashShiftId } });
      if (origShift?.status === "OPEN") {
        targetShiftId = origShift.id;
      } else {
        // Buscar shift OPEN do mesmo branch hoje
        const openToday = await tx.cashShift.findFirst({
          where: { branchId: origShift!.branchId, status: "OPEN", openedAt: { gte: startOfDay(new Date()) } },
        });
        if (openToday) {
          targetShiftId = openToday.id;
        } else {
          // Criar shift de ajuste
          const adj = await tx.cashShift.create({
            data: { branchId: origShift!.branchId, status: "OPEN", openingAmount: 0, openedAt: new Date(), notes: "adjustment-q8" },
          });
          targetShiftId = adj.id;
        }
      }
      await tx.cashMovement.create({
        data: {
          companyId, cashShiftId: targetShiftId!, branchId: originalCM.branchId,
          type: "OUT", amount: amount ?? originalCM.amount, method: originalCM.method,
          description: `Reversão AR ${ar.id} — ${reason}`,
          originType: "AccountReceivable", originId: ar.id,
        },
      });
    }

    // 3. FinanceEntry compensatório
    const { generateReversalEntry } = await import("@/services/finance-entry.service");
    await generateReversalEntry(tx, { arId: ar.id, companyId, amount: amount ?? ar.amount });

    return { reversed: true, arId: ar.id };
  });
}
```

- [ ] **Step 4: Implementar `generateReversalEntry`**

Em `src/services/finance-entry.service.ts`, função que cria 1 FinanceEntry com `sourceType=AR_REVERSAL`, `side=DEBIT`, debitando da conta de revenue.

- [ ] **Step 5: Tests verdes + commit**

```bash
npm test
git add prisma/ src/services/finance-entry.service.ts src/app/api/accounts-receivable/[id]/reverse/
git commit -m "feat(q8.2.1): estorno AR cria FinanceEntry compensatório + CashMovement reverso"
```

### Task 2.2: FinanceEntryRetry — adicionar ABANDONED + Sentry alert

**Files:**
- Modify: `prisma/schema.prisma` (enum adiciona ABANDONED)
- Modify: `src/services/finance-retry.service.ts` (usa ABANDONED em attempt 5, alert em 3)

- [ ] **Step 1: Adicionar ABANDONED no enum**

```prisma
enum FinanceEntryRetryStatus {
  PENDING
  SUCCESS
  FAILED
  ABANDONED
}
```

Migration: `npx prisma migrate dev --name q8_finance_retry_abandoned`

- [ ] **Step 2: Modificar `finance-retry.service.ts`**

Onde atualmente marca `FAILED` em attempt 5, trocar pra `ABANDONED`. Adicionar Sentry alert em attempt 3:

```typescript
if (retry.attempt === 3) {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureMessage(`FinanceEntryRetry ${retry.id} hit attempt 3`, "warning");
}
```

- [ ] **Step 3: Tests do retry**

```typescript
describe("processRetries", () => {
  it("marca ABANDONED em attempt 5", async () => { /* ... */ });
  it("dispara Sentry warning em attempt 3", async () => { /* ... */ });
});
```

- [ ] **Step 4: Commit**

```bash
git add prisma/ src/services/finance-retry.service.ts
git commit -m "fix(q8.2.2): FinanceEntryRetry ABANDONED em attempt 5 + Sentry alert em 3"
```

### Task 2.3: Idempotency POST /api/sales

**Files:**
- Modify: `prisma/schema.prisma` (tabela SaleIdempotency)
- Create: `prisma/migrations/20260528_q8_sale_idempotency/migration.sql`
- Create: `src/lib/idempotency.ts` (canonicalize + hash)
- Modify: `src/app/api/sales/route.ts` (header handling)
- Create: `src/lib/__tests__/idempotency.test.ts`
- Create: `src/app/api/sales/__tests__/idempotency.test.ts`

- [ ] **Step 1: Schema**

```prisma
model SaleIdempotency {
  id          String   @id @default(cuid())
  companyId   String
  key         String
  saleId      String
  payloadHash String
  createdAt   DateTime @default(now())
  expiresAt   DateTime
  sale        Sale     @relation(fields: [saleId], references: [id])

  @@unique([companyId, key])
  @@index([expiresAt])
}
```

- [ ] **Step 2: Migration**

```bash
npx prisma migrate dev --name q8_sale_idempotency
```

- [ ] **Step 3: Lib de canonicalização**

```typescript
// src/lib/idempotency.ts
import { createHash } from "node:crypto";

const VOLATILE = new Set(["createdAt", "updatedAt", "requestId", "timestamp"]);

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      if (VOLATILE.has(k)) continue;
      const v = (value as Record<string, unknown>)[k];
      sorted[k] = typeof v === "object" && v !== null && "toFixed" in v ? String(v) : canonicalize(v);
    }
    return sorted;
  }
  return value;
}

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}
```

- [ ] **Step 4: Tests do canonicalize**

```typescript
import { hashPayload } from "../idempotency";
describe("hashPayload", () => {
  it("mesmo objeto, ordens diferentes, mesmo hash", () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
  });
  it("ignora campos voláteis", () => {
    expect(hashPayload({ a: 1, createdAt: "2026-01-01" })).toBe(hashPayload({ a: 1 }));
  });
  it("normaliza Decimal-like", () => {
    const dec = { toFixed: () => "1.50" };
    expect(hashPayload({ amount: dec })).toBe(hashPayload({ amount: "1.5" })); // valores diferentes — só formato
  });
});
```

- [ ] **Step 5: Handler check**

```typescript
// src/app/api/sales/route.ts (no início do POST)
// ⚠️ IMPORTANTE: ler body UMA vez no topo. Request.json() só pode ser chamado 1x.
const bodyJson = await request.json();
const idempKey = request.headers.get("idempotency-key");
let payloadHashCached: string | null = null;

if (idempKey) {
  payloadHashCached = hashPayload(bodyJson);
  const existing = await prisma.saleIdempotency.findUnique({
    where: { companyId_key: { companyId, key: idempKey } },
    include: { sale: true },
  });
  if (existing) {
    if (existing.payloadHash !== payloadHashCached) {
      return NextResponse.json({ error: { code: "IDEMPOTENCY_KEY_CONFLICT", message: "Mesma key, payload diferente" } }, { status: 422 });
    }
    return NextResponse.json({ saleId: existing.saleId, idempotent: true });
  }
}

// ... lógica existente usa bodyJson ao invés de request.json() ...
// ATENÇÃO: TODOS os usos de request.json() no handler precisam ser trocados por bodyJson.

// Após criar sale com sucesso:
if (idempKey && payloadHashCached) {
  await prisma.saleIdempotency.create({
    data: { companyId, key: idempKey, saleId: sale.id, payloadHash: payloadHashCached, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) },
  });
}
```

- [ ] **Step 6: Limpeza no super-cron** (será implementada em Q8.1-cron consolidação)

- [ ] **Step 7: Tests + commit**

```bash
npm test
git add prisma/ src/lib/idempotency.ts src/app/api/sales/
git commit -m "feat(q8.2.3): idempotency em POST /api/sales via Idempotency-Key header"
```

### Task 2.4: Script de auditoria histórica financeira

**Files:**
- Create: `scripts/audit-finance-consistency.ts`

- [ ] **Step 1: Script**

```typescript
// scripts/audit-finance-consistency.ts
// Lista:
// 1. Sales COMPLETED sem FinanceEntry
// 2. AR RECEIVED sem CashMovement
// 3. CashMovement IN sem AR/Sale matching
// 4. FinanceAccount.balance vs SUM(FinanceEntry)
```

- [ ] **Step 2: Rodar contra prod + commit**

```bash
npx tsx scripts/audit-finance-consistency.ts > qa-artifacts/Q8-finance-audit.json
git add scripts/audit-finance-consistency.ts qa-artifacts/Q8-finance-audit.*
git commit -m "chore(q8.2.4): script de audit de consistência financeira"
```

🛑 **CHECKPOINT contigo**: você lê o relatório. Decide cleanup retroativo (separado deste sprint).

### Task 2.5: Cash shift close com lock pessimista

**Files:**
- Modify: `src/services/cash.service.ts:closeShift()`
- Create: `src/services/__tests__/cash-shift-close-race.test.ts`

- [ ] **Step 1: Teste de race**

```typescript
import { describe, it, expect } from "vitest";
import { closeShift } from "../cash.service";

describe("closeShift — race condition", () => {
  it("10 closes paralelos → 1 sucesso, 9 conflitos", async () => {
    // setup shift OPEN num test DB
    const results = await Promise.allSettled(Array(10).fill(0).map(() => closeShift({ shiftId, /* args */ })));
    const successes = results.filter(r => r.status === "fulfilled").length;
    const failures = results.filter(r => r.status === "rejected").length;
    expect(successes).toBe(1);
    expect(failures).toBe(9);
  });
});
```

- [ ] **Step 2: Implementar lock**

```typescript
// src/services/cash.service.ts
export async function closeShift(args: { shiftId: string; /* ... */ }) {
  return await prisma.$transaction(async tx => {
    const lockedShifts = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM "CashShift" WHERE id = ${args.shiftId} FOR UPDATE
    `;
    if (lockedShifts.length === 0) throw new Error("Shift not found");
    if (lockedShifts[0].status !== "OPEN") throw new Error("Shift already closed (race)");
    // ... lógica de close existente ...
    return await tx.cashShift.update({ where: { id: args.shiftId }, data: { status: "CLOSED", closedAt: new Date() /* ... */ } });
  });
}
```

- [ ] **Step 3: Tests verdes + commit**

```bash
npm test src/services/__tests__/cash-shift-close-race.test.ts
git add src/services/cash.service.ts src/services/__tests__/
git commit -m "fix(q8.2.5): SELECT FOR UPDATE em closeShift (fecha P0-8)"
```

---

## Fase Q8.3 — Segurança Admin SaaS (10-12h)

### Task 3.1: MFA admin (TOTP)

**Files:**
- Modify: `package.json` (speakeasy)
- Modify: `prisma/schema.prisma` (AdminUser MFA fields)
- Create: `prisma/migrations/20260528_q8_admin_mfa/migration.sql`
- Create: `src/lib/totp.ts`
- Create: `src/app/api/admin/auth/mfa/enroll/route.ts`
- Create: `src/app/api/admin/auth/mfa/verify/route.ts`
- Modify: `src/app/api/admin/auth/login/route.ts`
- Modify: `src/auth-admin.ts` (validar TOTP no callback)
- Create: `src/components/admin/MfaEnrollment.tsx`
- Modify: `src/app/admin/login/page.tsx` (TOTP input)
- Create: `src/lib/__tests__/totp.test.ts`

- [ ] **Step 1: Instalar speakeasy**

```bash
npm i speakeasy @types/speakeasy
```

- [ ] **Step 2: Schema**

```prisma
model AdminUser {
  // ...
  mfaEnabled     Boolean   @default(false)
  mfaSecret      String?
  mfaBackupCodes Json?     // string[] de hashes bcrypt
  mfaEnrolledAt  DateTime?
}
```

Migration: `npx prisma migrate dev --name q8_admin_mfa` (com IF NOT EXISTS).

- [ ] **Step 3: Lib TOTP**

```typescript
// src/lib/totp.ts
import speakeasy from "speakeasy";
import { randomBytes } from "node:crypto";

export function generateSecret(label: string) {
  return speakeasy.generateSecret({ name: `PDV ÓTICA Admin (${label})`, length: 20 });
}

export function verifyToken(secret: string, token: string): boolean {
  return speakeasy.totp.verify({ secret, encoding: "base32", token, window: 1 });
}

export function generateBackupCodes(n = 10): string[] {
  return Array.from({ length: n }, () => randomBytes(4).toString("hex").toUpperCase());
}
```

- [ ] **Step 4: Tests da lib**

```typescript
describe("totp", () => {
  it("verifica token gerado", () => {
    const { base32 } = generateSecret("test");
    const token = speakeasy.totp({ secret: base32, encoding: "base32" });
    expect(verifyToken(base32, token)).toBe(true);
  });
});
```

- [ ] **Step 5: Endpoint enroll**

```typescript
// src/app/api/admin/auth/mfa/enroll/route.ts
import { generateSecret, generateBackupCodes } from "@/lib/totp";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const admin = await prisma.adminUser.findUnique({ where: { id: session.adminUserId } });
  if (admin?.mfaEnabled) return new Response("Already enrolled", { status: 409 });

  const { base32, otpauth_url } = generateSecret(admin!.email);
  const codes = generateBackupCodes();
  const hashes = await Promise.all(codes.map(c => bcrypt.hash(c, 10)));

  await prisma.adminUser.update({
    where: { id: admin!.id },
    data: { mfaSecret: base32, mfaBackupCodes: hashes, mfaEnabled: false /* só ativa após verify */ },
  });

  const qr = await import("qrcode").then(m => m.toDataURL(otpauth_url!));
  return NextResponse.json({ qr, backupCodes: codes /* mostra UMA vez */ });
}
```

- [ ] **Step 6: Endpoint verify (ativa MFA)**

```typescript
// src/app/api/admin/auth/mfa/verify/route.ts
export async function POST(request: Request) {
  const { token } = await request.json();
  const session = await getAdminSession();
  const admin = await prisma.adminUser.findUnique({ where: { id: session!.adminUserId } });
  if (!verifyToken(admin!.mfaSecret!, token)) return new Response("Invalid token", { status: 400 });
  await prisma.adminUser.update({
    where: { id: admin!.id },
    data: { mfaEnabled: true, mfaEnrolledAt: new Date() },
  });
  return NextResponse.json({ enabled: true });
}
```

- [ ] **Step 7: Modificar login pra exigir TOTP se enabled**

Em `src/app/api/admin/auth/login/route.ts`:
```typescript
const bypassEmails = (process.env.ADMIN_MFA_BYPASS_EMAIL ?? "").split(",").map(s => s.trim());
if (admin.mfaEnabled && !bypassEmails.includes(admin.email)) {
  const { totpCode } = body;
  if (!totpCode) return NextResponse.json({ error: "TOTP_REQUIRED" }, { status: 401 });
  if (!verifyToken(admin.mfaSecret!, totpCode)) {
    // Tentar como backup code
    const codeMatch = await Promise.any((admin.mfaBackupCodes as string[]).map(async h => bcrypt.compare(totpCode, h) ? h : Promise.reject()));
    if (!codeMatch) return NextResponse.json({ error: "INVALID_TOTP" }, { status: 401 });
    // Consumir backup code
    await prisma.adminUser.update({ where: { id: admin.id }, data: { mfaBackupCodes: (admin.mfaBackupCodes as string[]).filter(c => c !== codeMatch) } });
  }
}
```

- [ ] **Step 8: UI enrollment + login com TOTP**

Component `MfaEnrollment.tsx` mostra QR code + 10 backup codes (com warning "salve agora").
Login form: campo extra TOTP visível se `mfaEnabled`.

- [ ] **Step 9: .env.example**

```
ADMIN_MFA_REQUIRED=true                  # se false, login ignora MFA
ADMIN_MFA_BYPASS_EMAIL=                  # CSV de emails admin que bypassam
```

- [ ] **Step 10: Commit**

```bash
git add package.json prisma/ src/lib/totp.ts src/app/api/admin/auth/mfa/ src/app/api/admin/auth/login/route.ts src/components/admin/MfaEnrollment.tsx src/app/admin/login/page.tsx src/auth-admin.ts .env.example
git commit -m "feat(q8.3.1): MFA admin (TOTP) + backup codes + enrollment flow"
```

### Task 3.2: Rate limit nas 48 rotas admin

**Files:**
- Create: `src/middleware/admin-rate-limit.ts` (helper, não Next middleware)
- Modify: cada route handler admin (48 arquivos)

- [ ] **Step 1: Helper genérico**

```typescript
// src/middleware/admin-rate-limit.ts
import { rateLimit } from "@/lib/rate-limit";

interface Options { method: "GET" | "POST" | "PATCH" | "DELETE"; perMin?: number; ipBypass?: string[] }

export async function checkAdminRateLimit(request: Request, options: Options) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const bypass = (process.env.ADMIN_RATE_LIMIT_BYPASS_IPS ?? "").split(",").map(s => s.trim());
  if (bypass.includes(ip)) return null;
  const limit = options.perMin ?? (options.method === "GET" ? 60 : 10);
  const ok = await rateLimit(`admin:${ip}:${options.method}`, limit, 60);
  if (!ok) return new Response(JSON.stringify({ error: "RATE_LIMIT_EXCEEDED" }), { status: 429 });
  return null;
}
```

- [ ] **Step 2: Inventário upfront das 48 rotas**

```bash
# Gerar lista completa de routes admin
find src/app/api/admin -name "route.ts" | sort > qa-artifacts/Q8-admin-routes.txt
wc -l qa-artifacts/Q8-admin-routes.txt
# Para cada uma, identificar métodos exportados
for f in $(cat qa-artifacts/Q8-admin-routes.txt); do
  echo "=== $f ==="
  grep -E "^export async function (GET|POST|PATCH|DELETE|PUT)" "$f"
done > qa-artifacts/Q8-admin-routes-methods.txt
```

Output: `qa-artifacts/Q8-admin-routes-methods.txt` — lista verbatim de cada arquivo e métodos.

- [ ] **Step 2.5: Dividir em N chunks de 5-8 rotas por commit**

Eu organizo manualmente em `qa-artifacts/Q8-admin-routes-chunks.md`:
```
Chunk 1 (auth + audit-logs): src/app/api/admin/auth/*, src/app/api/admin/audit-logs/*
Chunk 2 (clientes): src/app/api/admin/clientes/*
Chunk 3 (companies): src/app/api/admin/companies/*, src/app/api/admin/company-users/*
Chunk 4 (financeiro): src/app/api/admin/faturas/*, src/app/api/admin/financeiro/* (se existir)
Chunk 5 (configs): src/app/api/admin/plans/*, src/app/api/admin/tags/*, src/app/api/admin/networks/*
Chunk 6 (ops): src/app/api/admin/impersonate/*, src/app/api/admin/health-score/*, src/app/api/admin/seed/*
Chunk 7 (suporte): src/app/api/admin/tickets/*, src/app/api/admin/notifications/*
Chunk 8 (export + users): src/app/api/admin/export/*, src/app/api/admin/users/*, src/app/api/admin/cash/*
```

- [ ] **Step 3: Aplicar em cada rota (1 commit por chunk)**

Pra cada arquivo, adicionar no início de cada método:
```typescript
const rl = await checkAdminRateLimit(request, { method: "POST" });
if (rl) return rl;
```

Eu reviso cada um manualmente (codemod automático arrisca quebrar handlers já complexos).

- [ ] **Step 3: Tests**

```typescript
describe("admin rate limit", () => {
  it("11 POSTs em 60s → 11ª retorna 429", async () => { /* ... */ });
});
```

- [ ] **Step 4: Commit em chunks (5-10 rotas por commit pra review fácil)**

```bash
git add src/middleware/admin-rate-limit.ts src/app/api/admin/companies/
git commit -m "feat(q8.3.2): rate limit em /api/admin/companies/* (chunk 1)"
# ... repetir por chunks ...
```

### Task 3.3: Impersonation 1-sessão ativa

**Files:**
- Modify: `src/app/api/admin/impersonate/[id]/route.ts`
- Modify: `prisma/schema.prisma` (confirma campo revokedAt — já existe)

- [ ] **Step 1: Adicionar revoke no handler**

```typescript
// Ao criar nova impersonation:
await prisma.impersonationSession.updateMany({
  where: { adminUserId: admin.id, endedAt: null, revokedAt: null },
  data: { revokedAt: new Date() },
});
// ... criar nova
```

- [ ] **Step 2: Middleware valida revokedAt**

Onde verifica sessão de impersonate:
```typescript
const session = await prisma.impersonationSession.findUnique({ where: { id } });
if (!session || session.revokedAt) return new Response("Session revoked", { status: 401 });
```

- [ ] **Step 3: Teste**

```typescript
it("nova impersonation revoga as anteriores do mesmo admin", async () => { /* ... */ });
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/impersonate/
git commit -m "fix(q8.3.3): impersonation revoga sessões anteriores do mesmo admin"
```

### Task 3.4: Audit log expandido

**Files:**
- Modify: `src/app/api/admin/auth/login/route.ts` (log success+fail)
- Modify: `src/middleware/admin-rate-limit.ts` (log denials)
- Modify: cada route de export (log se count > 100)
- Modify: routes mass-action (block, delete, change_plan) — já existem em `clientes/[id]/actions`

- [ ] **Step 1: Função helper**

```typescript
// src/lib/audit.ts
export async function logAdminAction(args: { actorType: string; actorId?: string; companyId?: string; action: string; metadata?: object; ipAddress?: string }) {
  await prisma.globalAudit.create({ data: args }).catch(err => console.error("audit_log_failed", err));
}
```

- [ ] **Step 2: Login attempts**

```typescript
// Em login route, após validar (success ou fail):
await logAdminAction({ actorType: "ADMIN", actorId: admin?.id, action: success ? "LOGIN_SUCCESS" : "LOGIN_FAILED", metadata: { email }, ipAddress });
```

- [ ] **Step 3: Permission denials, exports, mass-actions**

Idem em cada rota.

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit.ts src/app/api/admin/auth/login/route.ts src/middleware/admin-rate-limit.ts src/app/api/admin/clientes/[id]/actions/route.ts src/app/api/admin/export/
git commit -m "feat(q8.3.4): GlobalAudit captura login attempts, denials, exports, mass-actions"
```

---

## Fase Q8.1-cron: Super-cron consolidação (1-2h, depois de Q8.1, Q8.2, Q8.3 estarem fechados)

### Task cron.1: Criar `/api/cron/tick`

**Files:**
- Create: `src/app/api/cron/tick/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Handler**

```typescript
// src/app/api/cron/tick/route.ts
import { NextResponse } from "next/server";
import { processRetries as retryFinanceEntries } from "@/services/finance-retry.service";
import { retryFailedWebhooks } from "@/services/webhook-retry.service";  // a criar
import { suspensionSweep } from "@/services/suspension.service";          // a criar
import { cleanupExpiredIdempotency } from "@/services/idempotency-cleanup.service"; // a criar

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await Promise.allSettled([
    withTimeout(retryFinanceEntries(), 15000, "retry-finance"),
    withTimeout(retryFailedWebhooks(), 15000, "retry-webhooks"),
    withTimeout(suspensionSweep(), 15000, "suspension-sweep"),
    withTimeout(cleanupExpiredIdempotency(), 5000, "cleanup-idempotency"),
  ]);

  return NextResponse.json({
    tick: new Date().toISOString(),
    results: results.map((r, i) => ({ task: ["finance", "webhooks", "suspension", "cleanup"][i], status: r.status, value: r.status === "fulfilled" ? r.value : String((r as PromiseRejectedResult).reason) })),
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout ${label}`)), ms))]);
}
```

- [ ] **Step 2: Criar `webhook-retry.service.ts`, `suspension.service.ts`, `idempotency-cleanup.service.ts`**

Pequenas funções stateless que fazem o trabalho descrito no spec §4.5.

- [ ] **Step 3: Modificar vercel.json**

⚠️ **ATENÇÃO**: vercel.json atual tem **3 crons** (não 2): `dunning`, `retry-finance-entries`, **`mark-delayed`** (`0 11 * * *` — marca OS atrasadas). NÃO apagar `mark-delayed`.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/tick", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/dunning", "schedule": "0 8 * * *" },
    { "path": "/api/cron/mark-delayed", "schedule": "0 11 * * *" }
  ]
}
```

⚠️ **DELETAR apenas `retry-finance-entries`** (lógica absorvida pelo tick). Manter `dunning` (negócio diário diferente) e `mark-delayed` (OS atrasadas).

A rota `/api/cron/retry-finance-entries/` continua acessível pra debug manual.

⚠️ Vercel Hobby permite **2 cron jobs**. Com 3 entradas vamos ESTOURAR. Decisão necessária: ou (a) incorporar `mark-delayed` como 5ª subtask do tick (recomendado, simples), ou (b) upgrade Vercel Pro. Default: **(a) incorporar**.

- [ ] **Step 3.5: Incorporar mark-delayed ao tick**

```typescript
// Em /api/cron/tick/route.ts adicionar 5ª subtask:
withTimeout(markDelayedServiceOrders(), 15000, "mark-delayed"),  // só roda 1x/dia via check de timestamp interno
```

Função `markDelayedServiceOrders` extraída de `src/app/api/cron/mark-delayed/route.ts` com guard `if (lastRunAt > startOfToday) skip`.

vercel.json final fica com **2 crons** (tick + dunning).

- [ ] **Step 4: Tests**

```typescript
describe("/api/cron/tick", () => {
  it("requer Bearer", async () => { /* ... */ });
  it("retorna status de cada subtask", async () => { /* ... */ });
});
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/tick/ src/services/webhook-retry.service.ts src/services/suspension.service.ts src/services/idempotency-cleanup.service.ts vercel.json
git commit -m "feat(q8-cron): super-cron /api/cron/tick consolida 4 subtasks"
```

---

## Fase Q8.5 — E2E mínimo + Sentry (4-5h)

### Task 5.1: E2E Playwright dos 3 fluxos críticos

**Files:**
- Create: `e2e/critical-flows.spec.ts`
- Modify: `playwright.config.ts` (se precisar)

- [ ] **Step 1: Spec dos 3 fluxos**

```typescript
// e2e/critical-flows.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Q8.5.1 fluxos críticos", () => {
  test("F1: criar venda à vista e ver no caixa", async ({ page }) => {
    await page.goto("/login");
    // ... login ...
    await page.goto("/dashboard/pdv");
    // ... seleciona produto, paga em dinheiro, finaliza ...
    await page.goto("/dashboard/caixa");
    await expect(page.getByText(/Total recebido/)).toBeVisible();
  });

  test("F2: venda parcelada STORE_CREDIT 3x + fechar caixa", async ({ page }) => { /* ... */ });

  test("F3: receber parcela do crediário + ver no DRE", async ({ page }) => { /* ... */ });
});
```

- [ ] **Step 2: Rodar local pra validar fluxos**

```bash
npx playwright test e2e/critical-flows.spec.ts
```

- [ ] **Step 3: Adicionar ao CI** (`.github/workflows/e2e.yml` — pode já existir)

- [ ] **Step 4: Commit**

```bash
git add e2e/critical-flows.spec.ts
git commit -m "test(q8.5.1): E2E dos 3 fluxos críticos (venda à vista, parcelada, recebimento)"
```

### Task 5.3: Sentry ativo + alertas

**Files:**
- Modify: `.env` em Vercel (você seta)
- Modify: `src/lib/sentry.ts` (validar uso)
- Documentar 3 alertas

- [ ] **Step 1: Você cria projeto Sentry**

Cole o DSN no chat. Eu seto em `.env.example` (sem valor real).

- [ ] **Step 2: Setar `SENTRY_DSN` no painel Vercel**

Você faz isso no dashboard.

- [ ] **Step 3: Validar integração**

```bash
# Adicionar uma rota de teste temporária:
# /api/test-sentry → throw new Error("test")
# Acessar produção e ver se chega no dashboard
```

🛑 **CHECKPOINT** — você confirma que viu erro no dashboard Sentry.

- [ ] **Step 4: Configurar 3 alertas no dashboard Sentry**

Você cria via UI:
- Alerta 1: webhook_failed > 3 em 5min → email
- Alerta 2: FinanceEntryRetry attempt = 3 (via captureMessage) → email
- Alerta 3: HTTP 5xx em rotas `/api/sales`, `/api/billing/*` > 5/min → email

Eu documento em `qa-artifacts/Q8-final/sentry-alerts.md`.

- [ ] **Step 5: Commit**

```bash
git add .env.example qa-artifacts/Q8-final/sentry-alerts.md
git commit -m "chore(q8.5.3): Sentry ativo + 3 alertas configurados"
```

---

## Fase Q8.99 — Wrap-up (2h)

### Task 99.1: CHANGELOG + Blueprint update

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `BLUEPRINT_FUNCIONAL_PDV.md`
- Create: `docs/Q8-retro.md`

- [ ] **Step 1: CHANGELOG**

Adicionar seção `## [Q8] — 2026-05-28`:
- Receita garantida (suspensão auto, webhook retry, checkout idempotente, email PAST_DUE)
- Integridade financeira (estorno AR, retry finance, idempotency sales, cash shift lock)
- Segurança admin (MFA, rate limit, impersonation single-session, audit expandido)
- Schema (baseline, composite uniques, CI drift check)
- E2E + Sentry

- [ ] **Step 2: Blueprint**

Atualizar seções afetadas (fluxos de venda, financeiro, billing, admin).

- [ ] **Step 3: Retro**

`docs/Q8-retro.md`: o que deu certo, o que descobri durante (audit anterior estava desatualizado), próximos sprints (Q9 com soft-delete + smoke 50 pages + Redis rate limit).

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md BLUEPRINT_FUNCIONAL_PDV.md docs/Q8-retro.md
git commit -m "docs(q8.99): CHANGELOG + Blueprint + retro de Q8"
```

### Task 99.2: Validar DoD

- [ ] **Step 1: Rodar todos os 10 critérios DoD do spec §10**

Para cada um:
1. Tenant inadimplente bloqueado ≤1h → testar manual via webhook fake
2. Webhook falho reprocessa → simular HTTP 500
3. Estorno AR cria FinanceEntry → rodar teste E2E
4. Audit prod retorna 0 ghost data → rodar `scripts/audit-finance-consistency.ts`
5. Admin requer MFA → tentar login sem TOTP
6. APIs admin têm rate limit → curl 11 vezes
7. `prisma migrate diff --exit-code` retorna 0 → comando shell
8. 3 E2E críticos passam em CI → conferir badge
9. Você faz login /admin, suspende tenant, libera → manual
10. Cash shift close 10 paralelos → rodar teste

- [ ] **Step 2: Relatório final**

`qa-artifacts/Q8-final/dod-checklist.md` com ✅ ou ❌ em cada item + evidência.

- [ ] **Step 3: Commit final**

```bash
git add qa-artifacts/Q8-final/
git commit -m "chore(q8.99): DoD checklist — Q8 fechado [ou] gaps remanescentes"
```

---

## Resumo executivo

- **Total de tasks atômicas:** ~50 steps numerados
- **Total de commits estimados:** ~22-28
- **Total de testes novos:** ~30 (unit + integration + E2E)
- **Total de migrations:** 5 novas
- **Total de novos arquivos:** ~25
- **Total de arquivos modificados:** ~20

**Próximos passos:**
1. Plan review loop (eu dispatcho plan-document-reviewer)
2. Se aprovado, você escolhe modo de execução (subagent-driven ou inline)
3. Execução começa por Q8.0

**Dependências críticas (não burlar):**
- Q8.0 (baseline) precede tudo
- Q8.0.5 (audit dados) ANTES de qualquer fix
- Q8.4.0 (drift confirm) ANTES de Q8.4.1 (baseline migration)
- Q8.4.2 pré-check de duplicatas ANTES da migration de composite uniques
- Q8.1.2 (lastErrorAt migration) DEVE rodar antes de Q8.0.5 usar esse campo, OU Q8.0.5 não usa esse campo (atual versão não usa — OK)
- Q8.1, Q8.2, Q8.3 podem rodar em paralelo (áreas disjuntas)
- Q8.1-cron consolidação DEPOIS de Q8.1/Q8.2/Q8.3 estarem fechados
- Q8.5 SEMPRE por último (smoke test do todo)

## DAG de execução (ordem visual)

```
Q8.0 ─→ Q8.0.5 ─→ [🛑 checkpoint]
                       │
                       ├──→ Q8.0.6 (se breach) ─→ [🛑]
                       │
                       ↓
        ┌──────────────┼──────────────┐
        │              │              │
       Q8.1           Q8.2           Q8.4
       (8-9h)         (12-14h)       (5-7h)
        │              │              │
        └──────────────┼──────────────┘
                       ↓
                Q8.1-cron (super-cron consolidação)
                       ↓
                      Q8.3 (segurança admin — solo, 10-12h)
                       ↓
                      Q8.5 (E2E + Sentry, 4-5h)
                       ↓
                     Q8.99 (wrap-up, 2h)
```

## Convenção de migrations (consistência)

**Toda migration deste sprint DEVE:**
1. Ser gerada com `npx prisma migrate dev --name q8_<desc> --create-only`
2. Ter o SQL EDITADO antes de aplicar pra usar `IF NOT EXISTS` em `ADD COLUMN` e `CREATE INDEX`
3. Ter um comentário `-- ROLLBACK: <SQL reverso>` inline pra cada operação destrutiva
4. Ser testada em Neon branch antes do main (Neon branching é grátis)

Lista completa de migrations Q8:
- `q8_billing_lasterror` (Task 1.2)
- `q8_subscription_idempotency` (Task 1.3)
- `q8_past_due_email_log` (Task 1.4 ajustado)
- `q8_ar_reversal_source_type` (Task 2.1)
- `q8_finance_retry_abandoned` (Task 2.2)
- `q8_sale_idempotency` (Task 2.3)
- `q8_admin_mfa` (Task 3.1)
- `q8_baseline_drift_recovery` (Task 4.1, evidence-based)
- `q8_composite_uniques` (Task 4.2)

Total: **9 migrations** Q8.

## Modelo de delivery

- **Commits direto na main** (modelo do projeto). Cada Step termina em commit atômico.
- Exceção: **Q8.4 inteiro** (mudanças destrutivas de schema) e **Q8.3.1** (MFA admin) — recomendo branch + PR pra ter deploy preview e Vercel rodar smoke E2E antes de merge. Modelo: `git checkout -b q8-4-schema`, push, abrir PR, conferir preview, merge.
- Em caso de hotfix: commit direto na main, deploy automático.
