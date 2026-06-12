# Fase 2 — Cobrança Automática Asaas (boleto/PIX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descobrir automaticamente as cobranças mensais que a subscription Asaas gera, materializá-las como `Invoice` local e comunicá-las ao cliente por email (fatura disponível + lembrete 3 dias antes), com um interruptor mestre de geração que estreia DESLIGADO.

**Architecture:** O Asaas é o motor de cobrança (a subscription criada no checkout gera as cobranças mensais sozinha). Nós só **lemos** via API (`GET /payments?subscription=X`, sem depender do webhook adiado) e **comunicamos**. Um motor compartilhado `runInvoiceReminders` é chamado por DUAS portas — o cron diário `invoice-reminders` (automático) e um botão "Sincronizar agora" no painel (manual) — sem duplicar lógica. Todo email passa por `notifyCompany` (Fase 1), que aplica modo teste e idempotência via `SaasEmailLog`.

**Tech Stack:** Next.js 16 (App Router), Prisma + PostgreSQL (Neon), TypeScript, Vitest, Zod, Tailwind. Reusa a infra da Fase 1: `notifyCompany`, `SaasEmailConfig`, `SaasEmailLog`, `SAAS_EMAIL_CATALOG`, `renderSaasEmailLayout`, `renderEmailTemplate`, a tela `/admin/configuracoes/emails`, `src/lib/asaas.ts`, `src/lib/counter.ts`.

---

## GUARDRAILS PARA OS SUBAGENTES IMPLEMENTADORES (lições da Fase 1 — NÃO repetir os erros)

> Estas regras são OBRIGATÓRIAS para cada subagente. Violar = escalar para o orquestrador.

- **Git restrito:** o subagente SÓ pode rodar `git add <arquivos exatos da task>` + `git commit`. **PROIBIDO:** `checkout`, `switch`, `branch`, `reset`, `stash`, `restore`, `rebase`, `cherry-pick`, `merge`. (Na Fase 1 um subagente haiku resetou para um commit órfão e quase perdeu uma task inteira.)
- **Prisma restrito:** **PROIBIDO** rodar `prisma format`, `prisma migrate`, `prisma generate`, `prisma db *`. A migration é escrita À MÃO (Task 2) e NÃO aplicada em lugar nenhum nesta sessão (o `.env` aponta para o Neon de PROD). Se o client Prisma precisar ser regenerado para o `tsc` enxergar campos novos, **escalar** — o orquestrador roda `prisma generate` controladamente.
- **Modelo:** tasks que tocam git/prisma/schema usam modelo **≥ sonnet**. Haiku só para tasks triviais isoladas (não há nenhuma assim aqui — todas tocam código real).
- **TDD por task:** escrever o teste (RED) → rodar e ver falhar → implementar o mínimo (GREEN) → rodar e ver passar → commit. **`tsc` + o vitest do(s) arquivo(s) da task verdes ANTES de cada commit.**
- **Verificação pós-commit:** o orquestrador confere após cada task que (a) só os arquivos da task entraram no commit, (b) o working tree está limpo, (c) a branch é `feat/saas-cobranca-fase2` (ou a branch de trabalho corrente — confirmar antes de começar).
- **Revisão dupla por task:** após cada commit, dois subagentes revisam — um de **conformidade com a spec**, um de **qualidade de código**. Corrigir CRITICAL/HIGH antes de seguir.
- **Sem deploy:** nenhum subagente roda `vercel`, mexe em prod, ou aplica migration. Deploy é MANUAL no fim, pelo dono/orquestrador (ver "Notas de deploy").

---

## Branch

Confirmar a branch de trabalho ANTES da Task 1. A spec sugere `feat/saas-cobranca-fase2`, mas a Fase 1 vive em `feat/saas-emails` (não mergeada na main). **Decisão do orquestrador antes de começar:** continuar em `feat/saas-emails` (empilha sobre a Fase 1, que é dependência direta) OU criar `feat/saas-cobranca-fase2` a partir de `feat/saas-emails`. Como a Fase 2 depende 100% da Fase 1 e a Fase 1 não está na main, **recomendado: continuar na mesma branch `feat/saas-emails`** para não fragmentar. Registrar a decisão e usar a mesma branch em todos os commits.

---

## File Structure (mapa de decomposição)

**Criar:**
- `src/lib/saas-invoice-number.ts` — helper atômico `nextSaasInvoiceNumber()` (tabela `SaasCounter`, sem FK de Company).
- `src/lib/saas-invoice-number.test.ts`
- `src/lib/business-day.ts` — helper puro `nextBusinessDay(date)`.
- `src/lib/business-day.test.ts`
- `src/services/invoice-sync.service.ts` — materializa `Invoice` local a partir de uma cobrança Asaas (mapeamento, filtro de status, número via counter, período derivado).
- `src/services/invoice-sync.service.test.ts`
- `src/services/invoice-reminders.service.ts` — motor compartilhado `runInvoiceReminders`.
- `src/services/invoice-reminders.service.test.ts`
- `src/app/api/cron/invoice-reminders/route.ts` — porta automática (cron).
- `src/app/api/cron/invoice-reminders/route.test.ts`
- `src/app/api/admin/invoice-reminders/run/route.ts` — porta manual (botão).
- `src/app/api/admin/invoice-reminders/run/route.test.ts`
- `src/app/api/admin/invoices/[id]/resend-charge/route.ts` — reenviar boleto/PIX.
- `src/app/api/admin/invoices/[id]/resend-charge/route.test.ts`
- `src/components/admin/sync-invoices-button.tsx` — botão "Sincronizar cobranças agora" (reusado na tela de emails e em Faturas).
- `src/components/admin/resend-charge-button.tsx` — botão "Reenviar boleto/PIX" (reusado em Faturas e perfil do Cliente).
- `prisma/migrations/<timestamp>_saas_invoice_fase2/migration.sql` — migration aditiva (escrita à mão).

**Modificar:**
- `prisma/schema.prisma` — `Invoice @@unique([subscriptionId, asaasPaymentId])`; `SaasEmailConfig` +3 flags; `enum SaasEmailType` +2 valores.
- `src/lib/asaas.ts` — `payments.list` (paginado) + `payments.create`.
- `src/lib/emails/saas-email-catalog.ts` — +2 entradas no Record + 2 literais na união `configFlag`.
- `src/services/saas-email-config.service.ts` — `SaasEmailConfigPatch` +3 flags.
- `src/lib/emails/templates.ts` — 2 templates novos + 2 cases no switch.
- `src/app/api/admin/saas-emails/preview/route.ts` — +2 entradas no `SAMPLE` Record (senão `tsc` quebra).
- `src/app/api/admin/saas-emails/config/route.ts` — `bodySchema` +3 flags.
- `src/app/admin/configuracoes/emails/page.tsx` + `emails-client.tsx` — 2 toggles novos + banner da flag mestre + botão "Sincronizar agora".
- `vercel.json` — +1 cron (8 → 9).
- `src/app/admin/financeiro/faturas/[id]/page.tsx` (+ `invoice-actions.tsx` ou nova montagem) — botão "Reenviar boleto/PIX".
- `src/app/admin/clientes/[id]/page.tsx` (+ a aba/painel de faturas) — botão "Reenviar boleto/PIX".
- `src/app/admin/financeiro/page.tsx` — widget "a receber esta semana".

---

## Convenções verificadas no código (NÃO reinventar)

- **`notifyCompany(companyId, eventType, payload, opts)`** — `src/services/saas-notification.service.ts`. `opts = { periodKey, channels?, inapp? }`. Já checa `masterEnabled` → `type flag` → resolve destinatário (`billingEmail→email→User ADMIN mais antigo`) → aplica `testMode/testEmail` → cria `SaasEmailLog` ANTES de enfileirar (unique = idempotência) → enfileira `emailQueue` (coluna `data` = payload, NÃO injetar `to` no payload) + `inapp` opcional. Fail-silent (nunca lança). Retorna `{ status: "SENT"|"SKIPPED"|"FAILED", reason? }`.
- **`SAAS_EMAIL_CATALOG`** — `src/lib/emails/saas-email-catalog.ts`. `Record<SaasEmailType, { template, subject, configFlag }>`. A união `configFlag` lista os literais; `SaasEmailFlags` é derivado dela.
- **Número da fatura — `nextSaasInvoiceNumber(tx?)`** (NOVO, Task 4) — `src/lib/saas-invoice-number.ts`. **NÃO usar `getNextSequence`/`Counter` aqui:** `Counter.companyId` tem FK obrigatória → `Company.id` (verificado no schema), e não existe `Company { id: "__saas__" }` → a 1ª chamada lançaria **P2003 (foreign key violation)** em prod e quebraria TODA a materialização de fatura silenciosamente. **Decisão (aprovada pelo dono, 2026-06-11):** usar uma tabela dedicada `SaasCounter` (sem FK), com `INSERT ... ON CONFLICT(key) DO UPDATE SET value = value + 1 RETURNING value` — mesma atomicidade do `getNextSequence` (sem race), número GLOBALMENTE único, sem `Company` fantasma poluindo listagens/crons. Hoje o número é gerado por `prisma.invoice.count()+1` em `src/app/api/admin/faturas/create/route.ts:34` (tem race — é o que esta fase corrige; `nextSaasInvoiceNumber` passa a ser a fonte única). A Task 2 cria a tabela `SaasCounter` na migration E a semeia com `MAX` do `INV-NNNNNN` atual (senão a sequência reinicia em 1 e colide com faturas manuais já existentes, violando `Invoice.number @unique`).
- **`renderSaasEmailLayout({ previewTitle, heading, bodyHtml, cta? })`** — `src/lib/emails/saas-email-layout.ts`. **`heading` é escapado pelo layout** (passar cru). **`bodyHtml` é inserido CRU** (escapar os dados dentro dele com `escapeHtml`). `cta = { label, url }`.
- **`renderEmailTemplate(template, data)`** — `src/lib/emails/templates.ts`. Switch por string; cada template valida com Zod e retorna `{ html, text }`.
- **`asaas`** — `src/lib/asaas.ts`. `asaasFetch<T>(path, init)`; `payments.get`/`payments.pixQrCode` já existem. `AsaasPayment` já tem `id, customer, subscription?, value, status, billingType, dueDate, invoiceUrl?, bankSlipUrl?, pixQrCodeId?`.
- **Cron pattern** — `src/app/api/cron/reconcile-billing/route.ts`: `GET`, fail-closed com `CRON_SECRET` (`authHeader === \`Bearer ${cronSecret}\``, e se `!cronSecret` recusa), `export const maxDuration = 60`. Logger via `logger.child({ route })`.
- **Admin session** — `src/lib/admin-session.ts`: `getAdminSession()` → `AdminPayload | null` (tem `.id`, `.role`, `.email`); `requireAdmin()`; rotas SUPER_ADMIN checam `admin.role !== "SUPER_ADMIN"` → 403.
- **Anti-prototype-pollution:** ao validar uma chave dinâmica contra um Record, usar `Object.hasOwn(REC, key)`, NÃO `key in REC` (precedente: preview route).
- **Invoice (schema)** — já tem `asaasPaymentId, paymentUrl, boletoUrl, pixCode, pixQrCodeUrl, paymentConfirmedAt, reminderSentAt, reminderCount, dueDate, status, total, subtotal, discount, periodStart, periodEnd, number @unique`. `subtotal/total/periodStart/periodEnd` são **NOT NULL**.

---

## Distinção CRÍTICA entre os dois "mestres" (não confundir)

- **`masterEnabled`** (Fase 1, já existe) = gate de TODO email. `notifyCompany` checa primeiro; se OFF → `SKIPPED("master_off")`.
- **`invoiceGenerationEnabled`** (novo, Task 2) = gate da GERAÇÃO/BUSCA de cobrança no Asaas. O motor `runInvoiceReminders` checa e nem toca o Asaas se OFF.
- São **independentes**. Estado perigoso: `invoiceGenerationEnabled=ON` + `masterEnabled=OFF` → o motor processa cobranças mas todo email é `SKIPPED` silenciosamente. A tela (Task 11) DEVE exibir aviso quando divergirem.

---

## Ordem das tasks

1. Lib Asaas (`payments.list` paginado + `payments.create`).
2. Migration aditiva + **conjunto acoplado de tipos** (schema + catalog + configFlag + SaasEmailConfigPatch + preview SAMPLE + config bodySchema) num único commit.
3. Helper `nextBusinessDay`.
4. Service `invoice-sync.service`.
5. 2 templates + catálogo.
6. Motor `runInvoiceReminders`.
7. Cron `invoice-reminders` + vercel.json.
8. Gatilho manual `/api/admin/invoice-reminders/run`.
9. Rota resend `/api/admin/invoices/[id]/resend-charge`.
10. Tela admin (toggles + banner flag mestre + botão "Sincronizar agora").
11. Botões "Reenviar" em Faturas + Cliente + botão "Sincronizar agora" em Faturas.
12. Widget "a receber esta semana".
13. Suíte completa + build + revisão final.

---

### Task 1: Lib Asaas — `payments.list` (paginado) + `payments.create`

**Files:**
- Modify: `src/lib/asaas.ts`
- Test: `src/lib/asaas.test.ts` (criar se não existir; senão adicionar describe)

**Contexto:** `asaasFetch` e o objeto `asaas.payments` já existem. Adicionar dois métodos. `payments.list` faz `GET /payments?<query>` e devolve `{ data, totalCount, hasMore }` (o Asaas retorna `{ data, totalCount, hasMore, limit, offset }`). `payments.create` faz `POST /payments`. A paginação (loop de offset) fica no CONSUMIDOR (service), não aqui.

- [ ] **Step 1: Escrever o teste falhando**

Mockar `fetch` global. Testar:
- `payments.list({ subscription: "sub_1" })` monta a URL `/payments?subscription=sub_1` e retorna o objeto parseado `{ data, totalCount, hasMore }`.
- `payments.list({ subscription: "sub_1", status: "PENDING", offset: 100, limit: 100 })` inclui todos os params na query string.
- `payments.create({ customer, billingType, value, dueDate })` faz POST com o body JSON e passa `idempotencyKey` quando informado.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("asaas.payments.list / create", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, ASAAS_API_KEY: "$aact_test_x", ASAAS_API_URL: "https://api-sandbox.asaas.com/v3" };
  });
  afterEach(() => { process.env = OLD_ENV; vi.restoreAllMocks(); });

  it("payments.list monta query e parseia a resposta", async () => {
    const { asaas } = await import("./asaas");
    const body = { data: [{ id: "pay_1", value: 149.9, status: "PENDING" }], totalCount: 1, hasMore: false, limit: 100, offset: 0 };
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 })
    );
    const res = await asaas.payments.list({ subscription: "sub_1", status: "PENDING", offset: 0, limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.hasMore).toBe(false);
    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/payments?");
    expect(calledUrl).toContain("subscription=sub_1");
    expect(calledUrl).toContain("status=PENDING");
    expect(calledUrl).toContain("limit=100");
    expect(calledUrl).toContain("offset=0");
  });

  it("payments.create faz POST com body e idempotencyKey", async () => {
    const { asaas } = await import("./asaas");
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "pay_2", value: 149.9, status: "PENDING" }), { status: 200 })
    );
    await asaas.payments.create(
      { customer: "cus_1", billingType: "BOLETO", value: 149.9, dueDate: "2026-07-10" },
      "idem-1"
    );
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ customer: "cus_1", billingType: "BOLETO", value: 149.9 });
    expect((init.headers as Record<string, string>)["asaas-idempotency-key"]).toBe("idem-1");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/asaas.test.ts`
Expected: FAIL (`payments.list is not a function` / `payments.create is not a function`).

- [ ] **Step 3: Implementar**

Adicionar ao `src/lib/asaas.ts`:
- Antes do objeto `asaas`, tipos:
```typescript
export interface AsaasPaymentListFilters {
  customer?: string;
  subscription?: string;
  status?: AsaasPayment["status"];
  offset?: number;
  limit?: number;
}

export interface AsaasPaymentListResult {
  data: AsaasPayment[];
  totalCount: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export interface AsaasPaymentCreateInput {
  customer: string;
  billingType: AsaasBillingType;
  value: number;       // reais
  dueDate: string;     // YYYY-MM-DD
  description?: string;
  externalReference?: string;
}
```
- Dentro de `asaas.payments` (junto de `get`/`pixQrCode`):
```typescript
    async list(filters: AsaasPaymentListFilters = {}): Promise<AsaasPaymentListResult> {
      const params = new URLSearchParams();
      if (filters.customer) params.set("customer", filters.customer);
      if (filters.subscription) params.set("subscription", filters.subscription);
      if (filters.status) params.set("status", filters.status);
      params.set("limit", String(filters.limit ?? 100));
      params.set("offset", String(filters.offset ?? 0));
      return asaasFetch<AsaasPaymentListResult>(`/payments?${params.toString()}`);
    },
    async create(input: AsaasPaymentCreateInput, idempotencyKey?: string): Promise<AsaasPayment> {
      return asaasFetch<AsaasPayment>("/payments", {
        method: "POST",
        body: JSON.stringify(input),
        idempotencyKey,
      });
    },
```

- [ ] **Step 4: Rodar o teste e ver passar + `tsc`**

Run: `npx vitest run src/lib/asaas.test.ts && npx tsc --noEmit`
Expected: PASS + tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/asaas.ts src/lib/asaas.test.ts
git commit -m "feat(asaas): payments.list paginado + payments.create"
```

---

### Task 2: Migration aditiva + conjunto ACOPLADO de tipos (UM commit)

> **⚠️ Tudo num único commit, senão `tsc` quebra.** Adicionar os 2 valores ao `enum SaasEmailType` obriga, no MESMO passo, atualizar todos os `Record<SaasEmailType, ...>` (catalog + preview SAMPLE) e as flags. Esta task usa modelo ≥ sonnet. **NÃO rodar `prisma migrate/format/generate` — a migration é escrita à mão e o client é regenerado pelo orquestrador (ver guardrails).**

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_saas_invoice_fase2/migration.sql`
- Modify: `src/lib/emails/saas-email-catalog.ts`
- Modify: `src/services/saas-email-config.service.ts`
- Modify: `src/app/api/admin/saas-emails/preview/route.ts`
- Modify: `src/app/api/admin/saas-emails/config/route.ts`
- Test: `src/lib/emails/saas-email-catalog.test.ts` (já existe — estender)

- [ ] **Step 1: Escrever/estender o teste falhando**

No `saas-email-catalog.test.ts`, garantir que o catálogo cobre os 2 tipos novos e que `isSaasEmailEnabled` os respeita:
```typescript
import { SAAS_EMAIL_CATALOG, isSaasEmailEnabled } from "./saas-email-catalog";

it("catálogo cobre INVOICE_CREATED e INVOICE_DUE_SOON", () => {
  expect(SAAS_EMAIL_CATALOG.INVOICE_CREATED.template).toBe("saas-invoice-created");
  expect(SAAS_EMAIL_CATALOG.INVOICE_CREATED.configFlag).toBe("invoiceCreatedEnabled");
  expect(SAAS_EMAIL_CATALOG.INVOICE_DUE_SOON.template).toBe("saas-invoice-due-soon");
  expect(SAAS_EMAIL_CATALOG.INVOICE_DUE_SOON.configFlag).toBe("invoiceDueSoonEnabled");
});

it("isSaasEmailEnabled respeita a flag dos tipos novos", () => {
  expect(isSaasEmailEnabled("INVOICE_CREATED", { invoiceCreatedEnabled: false })).toBe(false);
  expect(isSaasEmailEnabled("INVOICE_DUE_SOON", { invoiceDueSoonEnabled: true })).toBe(true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/emails/saas-email-catalog.test.ts`
Expected: FAIL (chaves não existem no enum/Record).

- [ ] **Step 3: Editar o schema**

Em `prisma/schema.prisma`:
- No `enum SaasEmailType`, adicionar duas linhas:
```prisma
  INVOICE_CREATED
  INVOICE_DUE_SOON
```
- No `model SaasEmailConfig`, adicionar 3 flags (após `subscriptionCanceledEnabled`):
```prisma
  invoiceGenerationEnabled     Boolean  @default(false)
  invoiceCreatedEnabled        Boolean  @default(true)
  invoiceDueSoonEnabled        Boolean  @default(true)
```
- No `model Invoice`, adicionar o unique (junto dos `@@index`):
```prisma
  @@unique([subscriptionId, asaasPaymentId])
```
- Adicionar o `model SaasCounter` (contador global do SaaS, SEM FK de Company — ver decisão na seção "Convenções"):
```prisma
model SaasCounter {
  key   String @id
  value Int    @default(0)
}
```

- [ ] **Step 4: Escrever a migration À MÃO**

Criar `prisma/migrations/<timestamp>_saas_invoice_fase2/migration.sql` (usar timestamp no formato `AAAAMMDDHHMMSS`, ex.: `20260611120000`). Conteúdo:
```sql
-- AlterEnum
ALTER TYPE "SaasEmailType" ADD VALUE IF NOT EXISTS 'INVOICE_CREATED';
ALTER TYPE "SaasEmailType" ADD VALUE IF NOT EXISTS 'INVOICE_DUE_SOON';

-- AlterTable
ALTER TABLE "SaasEmailConfig"
  ADD COLUMN "invoiceGenerationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "invoiceCreatedEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "invoiceDueSoonEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex (unique parcial implícito: múltiplos NULL em asaasPaymentId são permitidos no Postgres)
CREATE UNIQUE INDEX "Invoice_subscriptionId_asaasPaymentId_key"
  ON "Invoice"("subscriptionId", "asaasPaymentId");

-- CreateTable SaasCounter (contador global do número de fatura, SEM FK de Company)
CREATE TABLE "SaasCounter" (
  "key"   TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SaasCounter_pkey" PRIMARY KEY ("key")
);

-- Semear o contador "invoice" com o MAX atual de INV-NNNNNN (senão reinicia em 1 e colide
-- com faturas manuais já existentes). Extrai o sufixo numérico de "INV-000042" → 42.
INSERT INTO "SaasCounter" ("key", "value")
SELECT 'invoice', COALESCE(MAX(CAST(substring("number" FROM 'INV-0*([0-9]+)$') AS INTEGER)), 0)
FROM "Invoice"
WHERE "number" ~ '^INV-[0-9]+$';
```
> **Nota de deploy (não executar agora):** `ALTER TYPE ... ADD VALUE` não pode rodar dentro do mesmo `BEGIN/COMMIT` que usa o valor novo — no Postgres o valor de enum só fica visível após o commit. Na hora do deploy, aplicar o `ALTER TYPE` em uma transação e o resto (tabelas/índices/seed) em outra (ver "Notas de deploy"). Aqui só ESCREVEMOS o arquivo. O `INSERT ... SELECT` do seed do `SaasCounter` é idempotente na prática se a tabela estiver vazia; ao re-aplicar, proteger com `ON CONFLICT ("key") DO NOTHING` (adicionar essa cláusula na hora do deploy se necessário).

- [ ] **Step 5: Atualizar os tipos acoplados**

**5a.** `src/lib/emails/saas-email-catalog.ts` — na união `configFlag` adicionar `| "invoiceCreatedEnabled" | "invoiceDueSoonEnabled"`; no `SAAS_EMAIL_CATALOG` adicionar:
```typescript
  INVOICE_CREATED: {
    template: "saas-invoice-created",
    subject: "Sua fatura do Vis está disponível",
    configFlag: "invoiceCreatedEnabled",
  },
  INVOICE_DUE_SOON: {
    template: "saas-invoice-due-soon",
    subject: "Sua fatura do Vis vence em 3 dias",
    configFlag: "invoiceDueSoonEnabled",
  },
```

**5b.** `src/services/saas-email-config.service.ts` — em `SaasEmailConfigPatch` adicionar (opcionais):
```typescript
  invoiceGenerationEnabled?: boolean;
  invoiceCreatedEnabled?: boolean;
  invoiceDueSoonEnabled?: boolean;
```

**5c.** `src/app/api/admin/saas-emails/preview/route.ts` — o `SAMPLE` é `Record<SaasEmailType, ...>`, então PRECISA das 2 entradas novas (senão `tsc` quebra):
```typescript
  INVOICE_CREATED: {
    name: "João Silva",
    amountLabel: "R$ 149,90",
    dueDateLabel: "10/07/2026",
    pixCode: "00020126...br.gov.bcb.pix...6304ABCD",
    paymentUrl: "https://www.asaas.com/i/abc123",
    boletoUrl: "https://www.asaas.com/b/pdf/abc123",
  },
  INVOICE_DUE_SOON: {
    name: "João Silva",
    amountLabel: "R$ 149,90",
    dueDateLabel: "10/07/2026",
    pixCode: "00020126...br.gov.bcb.pix...6304ABCD",
    paymentUrl: "https://www.asaas.com/i/abc123",
    boletoUrl: "https://www.asaas.com/b/pdf/abc123",
  },
```
> Os campos do SAMPLE devem casar com o schema Zod dos templates (Task 5). Se a Task 5 ainda não existe, os templates não renderizam ainda — mas o preview só é exercitado em runtime; o `tsc` só exige que o Record esteja completo. Manter os nomes de campo alinhados com a Task 5.

**5d.** `src/app/api/admin/saas-emails/config/route.ts` — no `bodySchema` (Zod) adicionar:
```typescript
    invoiceGenerationEnabled: z.boolean().optional(),
    invoiceCreatedEnabled: z.boolean().optional(),
    invoiceDueSoonEnabled: z.boolean().optional(),
```

- [ ] **Step 6: ESCALAR para regenerar o client + rodar testes**

O subagente NÃO roda `prisma generate`. **Escalar ao orquestrador:** "Task 2 editou o schema; preciso de `prisma generate` para o client expor `invoiceGenerationEnabled`/enum novos." O orquestrador roda `npx prisma generate` (controlado) e devolve. Depois:

Run: `npx vitest run src/lib/emails/saas-email-catalog.test.ts && npx tsc --noEmit`
Expected: PASS + tsc limpo (o client agora conhece os campos/valores novos).

- [ ] **Step 7: Commit (tudo junto)**

```bash
git add prisma/schema.prisma prisma/migrations/<timestamp>_saas_invoice_fase2/migration.sql \
  src/lib/emails/saas-email-catalog.ts src/lib/emails/saas-email-catalog.test.ts \
  src/services/saas-email-config.service.ts \
  src/app/api/admin/saas-emails/preview/route.ts \
  src/app/api/admin/saas-emails/config/route.ts
git commit -m "feat(saas-cobranca): migration aditiva (Invoice unique + 3 flags + enum) e tipos acoplados"
```

---

### Task 3: Helper `nextBusinessDay`

**Files:**
- Create: `src/lib/business-day.ts`
- Test: `src/lib/business-day.test.ts`

**Contexto:** Puro, sem I/O. Se a data cai em sábado/domingo, move para a segunda. Trabalhar em fuso BR é desnecessário aqui (comparação de dia da semana só); receber e devolver `Date`.

- [ ] **Step 1: Teste falhando**
```typescript
import { describe, it, expect } from "vitest";
import { nextBusinessDay } from "./business-day";

describe("nextBusinessDay", () => {
  it("sábado vira segunda", () => {
    // 2026-07-11 é sábado
    const out = nextBusinessDay(new Date("2026-07-11T12:00:00Z"));
    expect(out.getUTCDay()).toBe(1); // segunda
    expect(out.toISOString().slice(0, 10)).toBe("2026-07-13");
  });
  it("domingo vira segunda", () => {
    const out = nextBusinessDay(new Date("2026-07-12T12:00:00Z")); // domingo
    expect(out.toISOString().slice(0, 10)).toBe("2026-07-13");
  });
  it("dia útil inalterado", () => {
    const out = nextBusinessDay(new Date("2026-07-10T12:00:00Z")); // sexta
    expect(out.toISOString().slice(0, 10)).toBe("2026-07-10");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/business-day.test.ts` — FAIL (módulo não existe).

- [ ] **Step 3: Implementar**
```typescript
/**
 * Se `date` cai em fim de semana (sábado/domingo, em UTC), retorna a próxima
 * segunda-feira (mesma hora). Dia útil é devolvido inalterado. Não muta a entrada.
 * Usado para não vencer boleto em fim de semana (confusão comum no BR).
 */
export function nextBusinessDay(date: Date): Date {
  const out = new Date(date.getTime());
  const day = out.getUTCDay(); // 0 = domingo, 6 = sábado
  if (day === 6) out.setUTCDate(out.getUTCDate() + 2);
  else if (day === 0) out.setUTCDate(out.getUTCDate() + 1);
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx vitest run src/lib/business-day.test.ts && npx tsc --noEmit` — PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/business-day.ts src/lib/business-day.test.ts
git commit -m "feat(saas-cobranca): helper nextBusinessDay (boleto não vence em fim de semana)"
```

---

### Task 4: Service `invoice-sync.service`

**Files:**
- Create: `src/lib/saas-invoice-number.ts` (+ teste) — gerador atômico do número, SEM FK de Company.
- Create: `src/services/invoice-sync.service.ts`
- Test: `src/lib/saas-invoice-number.test.ts`, `src/services/invoice-sync.service.test.ts`

**Contexto e regras (da spec + decisão do dono sobre o número):**
- `syncInvoicesForSubscription(subscription, deps?)` → retorna as `Invoice[]` NOVAS criadas (para emailar).
- Loop paginado: `asaas.payments.list({ subscription: sub.asaasSubscriptionId, offset })` até `hasMore === false`. Throttle ~200ms entre páginas (helper de sleep; nos testes injetar um sleep no-op).
- **Filtro de status:** só materializa `payment.status ∈ {PENDING, OVERDUE}`. Ignora `RECEIVED/CONFIRMED/REFUNDED/CHARGEBACK_REQUESTED/...`.
- Para cada payment elegível sem `Invoice` local com aquele `asaasPaymentId`:
  - `number` via **`nextSaasInvoiceNumber(tx)`** (helper novo, `SaasCounter` sem FK — NÃO `getNextSequence`/`Counter`, que tem FK de Company e quebraria em prod) → formato `INV-NNNNNN` (`\`INV-${String(value).padStart(6, "0")}\``).
  - mapeia: `total = subtotal = Math.round(payment.value * 100)`; `discount = 0`; `dueDate = new Date(payment.dueDate)`; `asaasPaymentId = payment.id`; `status = "PENDING"`; `paymentUrl = payment.invoiceUrl`; `boletoUrl = payment.bankSlipUrl`; `billingType = payment.billingType`.
  - `periodStart`/`periodEnd` derivados do `dueDate`: 1º e último dia do mês de competência (mês do dueDate).
  - PIX: `asaas.payments.pixQrCode(payment.id)` → grava `pixCode = payload`. Se falhar/sem PIX, segue sem (degrada). NÃO grava `pixQrCodeUrl`.
  - Idempotência: o `@@unique(subscriptionId, asaasPaymentId)` garante 1 Invoice/cobrança; P2002 → tratar como "já existe", pular sem erro.
- Injeção de dependências para testar: receber `{ asaasClient?, prismaClient?, sleep? }` com defaults reais. Separar a lógica pura (mapeamento Asaas→dados da Invoice) numa função exportada `mapPaymentToInvoiceData(payment, number)` para testar isolada.

- [ ] **Step 0a: Helper `nextSaasInvoiceNumber` — teste falhando**

`src/lib/saas-invoice-number.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { nextSaasInvoiceNumber } from "./saas-invoice-number";

describe("nextSaasInvoiceNumber", () => {
  it("incrementa atômico e formata INV-NNNNNN", async () => {
    const $queryRaw = vi.fn().mockResolvedValue([{ value: 43 }]);
    const tx = { $queryRaw } as any;
    const num = await nextSaasInvoiceNumber(tx);
    expect(num).toBe("INV-000043");
    expect($queryRaw).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 0b: Helper — implementar**

`src/lib/saas-invoice-number.ts`:
```typescript
import { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

/**
 * Próximo número de fatura do SaaS, GLOBALMENTE único e atômico (sem race).
 * Usa a tabela dedicada `SaasCounter` (sem FK de Company) com
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING — mesma semântica atômica do
 * `getNextSequence`, mas sem amarrar a uma Company (a chave-sentinela "__saas__"
 * violaria a FK Counter.companyId → Company.id). Ver decisão no topo do plano.
 */
export async function nextSaasInvoiceNumber(
  client: Pick<typeof defaultPrisma, "$queryRaw"> = defaultPrisma
): Promise<string> {
  const rows = await client.$queryRaw<{ value: number }[]>(Prisma.sql`
    INSERT INTO "SaasCounter" ("key", "value") VALUES ('invoice', 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "SaasCounter"."value" + 1
    RETURNING "value"
  `);
  return `INV-${String(rows[0].value).padStart(6, "0")}`;
}
```
> **Nota:** passar a MESMA transação (`tx`) que cria a Invoice é ideal (número e Invoice no mesmo commit). Como `syncInvoicesForSubscription` cria as Invoices uma a uma (sem `$transaction` envolvendo todas), pode chamar `nextSaasInvoiceNumber(prismaClient)` diretamente — o `INSERT...ON CONFLICT...RETURNING` já é atômico por si só. Se preferir amarrar número+create numa transação, envolver cada item em `prisma.$transaction`.

- [ ] **Step 0c: Helper — rodar e ver passar**

Run: `npx vitest run src/lib/saas-invoice-number.test.ts && npx tsc --noEmit` — PASS. (Não commitar ainda; vai junto no commit da Task 4, ou commitar separado se preferir granularidade — decisão do orquestrador.)

- [ ] **Step 1: Teste falhando**
```typescript
import { describe, it, expect, vi } from "vitest";
import { mapPaymentToInvoiceData, syncInvoicesForSubscription } from "./invoice-sync.service";
import type { AsaasPayment } from "@/lib/asaas";

function payment(over: Partial<AsaasPayment> = {}): AsaasPayment {
  return {
    id: "pay_1", customer: "cus_1", subscription: "sub_1", value: 149.9, netValue: 145,
    status: "PENDING", billingType: "BOLETO", dueDate: "2026-07-10",
    invoiceUrl: "https://asaas/i/1", bankSlipUrl: "https://asaas/b/1", ...over,
  };
}

describe("mapPaymentToInvoiceData", () => {
  it("converte valor p/ centavos, deriva período do dueDate, mapeia URLs", () => {
    const data = mapPaymentToInvoiceData(payment(), "INV-000001");
    expect(data.total).toBe(14990);
    expect(data.subtotal).toBe(14990);
    expect(data.discount).toBe(0);
    expect(data.asaasPaymentId).toBe("pay_1");
    expect(data.paymentUrl).toBe("https://asaas/i/1");
    expect(data.boletoUrl).toBe("https://asaas/b/1");
    expect(data.status).toBe("PENDING");
    expect(data.periodStart.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(data.periodEnd.toISOString().slice(0, 10)).toBe("2026-07-31");
  });
});

describe("syncInvoicesForSubscription", () => {
  const sub = { id: "sub_local", asaasSubscriptionId: "sub_1" } as any;

  it("ignora cobrança em status terminal (RECEIVED/REFUNDED) — não cria Invoice", async () => {
    const asaasClient = {
      payments: {
        list: vi.fn().mockResolvedValue({ data: [payment({ id: "p_paid", status: "RECEIVED" })], totalCount: 1, hasMore: false, limit: 100, offset: 0 }),
        pixQrCode: vi.fn(),
      },
    };
    const created: any[] = [];
    const prismaClient = makePrismaMock(created, []);
    const out = await syncInvoicesForSubscription(sub, { asaasClient: asaasClient as any, prismaClient, sleep: async () => {} });
    expect(out).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it("materializa cobrança PENDING nova com valor do Asaas e pixCode", async () => {
    const asaasClient = {
      payments: {
        list: vi.fn().mockResolvedValue({ data: [payment()], totalCount: 1, hasMore: false, limit: 100, offset: 0 }),
        pixQrCode: vi.fn().mockResolvedValue({ encodedImage: "b64", payload: "PIXCOPIACOLA", expirationDate: "2026-07-10" }),
      },
    };
    const created: any[] = [];
    const prismaClient = makePrismaMock(created, []); // nenhuma Invoice existente
    const out = await syncInvoicesForSubscription(sub, { asaasClient: asaasClient as any, prismaClient, sleep: async () => {} });
    expect(out).toHaveLength(1);
    expect(created[0].total).toBe(14990);
    expect(created[0].pixCode).toBe("PIXCOPIACOLA");
    expect(created[0].number).toMatch(/^INV-\d{6}$/);
  });

  it("idempotente — cobrança já materializada não duplica", async () => {
    const asaasClient = {
      payments: { list: vi.fn().mockResolvedValue({ data: [payment()], totalCount: 1, hasMore: false, limit: 100, offset: 0 }), pixQrCode: vi.fn() },
    };
    const created: any[] = [];
    const prismaClient = makePrismaMock(created, [{ asaasPaymentId: "pay_1" }]); // já existe
    const out = await syncInvoicesForSubscription(sub, { asaasClient: asaasClient as any, prismaClient, sleep: async () => {} });
    expect(out).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it("paginação — 2 páginas viram todas as cobranças", async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ data: [payment({ id: "p1" })], totalCount: 2, hasMore: true, limit: 1, offset: 0 })
      .mockResolvedValueOnce({ data: [payment({ id: "p2" })], totalCount: 2, hasMore: false, limit: 1, offset: 1 });
    const asaasClient = { payments: { list, pixQrCode: vi.fn().mockResolvedValue({ payload: "X" }) } };
    const created: any[] = [];
    const prismaClient = makePrismaMock(created, []);
    const out = await syncInvoicesForSubscription(sub, { asaasClient: asaasClient as any, prismaClient, sleep: async () => {} });
    expect(out).toHaveLength(2);
    expect(list).toHaveBeenCalledTimes(2);
  });
});

// Helper de mock do prisma: $queryRaw incremental (SaasCounter) + invoice.findUnique p/ existentes + invoice.create acumula
function makePrismaMock(created: any[], existing: Array<{ asaasPaymentId: string }>) {
  let seq = 0;
  const exists = new Set(existing.map((e) => e.asaasPaymentId));
  return {
    // nextSaasInvoiceNumber chama client.$queryRaw → devolve [{ value }]
    $queryRaw: vi.fn().mockImplementation(async () => [{ value: ++seq }]),
    invoice: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        const id = where?.subscriptionId_asaasPaymentId?.asaasPaymentId;
        return exists.has(id) ? { id: "existing" } : null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: any) => { created.push(data); return { id: `new_${created.length}`, ...data }; }),
    },
  } as any;
}
```

> **Nota ao implementador:** o número vem de `nextSaasInvoiceNumber(prismaClient)` (helper do Step 0, usa `$queryRaw` na tabela `SaasCounter`). O `makePrismaMock` deve expor `$queryRaw: vi.fn()` que devolve um valor incremental (ver mock atualizado acima). A checagem de existência usa `prismaClient.invoice.findUnique({ where: { subscriptionId_asaasPaymentId: { subscriptionId, asaasPaymentId } } })`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/services/invoice-sync.service.test.ts` — FAIL.

- [ ] **Step 3: Implementar** (esboço; completar conforme os testes)
```typescript
import { Prisma, type Invoice, type Subscription } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { asaas as defaultAsaas } from "@/lib/asaas";
import { nextSaasInvoiceNumber } from "@/lib/saas-invoice-number";
import { logger } from "@/lib/logger";
import type { AsaasPayment } from "@/lib/asaas";

const log = logger.child({ service: "invoice-sync" });
const ELIGIBLE: ReadonlySet<AsaasPayment["status"]> = new Set(["PENDING", "OVERDUE"]);

export interface InvoiceData {
  total: number; subtotal: number; discount: number;
  status: "PENDING"; dueDate: Date; asaasPaymentId: string;
  paymentUrl?: string; boletoUrl?: string; billingType?: string;
  periodStart: Date; periodEnd: Date;
}

export function mapPaymentToInvoiceData(payment: AsaasPayment, number: string): InvoiceData & { number: string } {
  const due = new Date(`${payment.dueDate}T00:00:00.000Z`);
  const periodStart = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0));
  const cents = Math.round(payment.value * 100);
  return {
    number, total: cents, subtotal: cents, discount: 0, status: "PENDING",
    dueDate: due, asaasPaymentId: payment.id,
    paymentUrl: payment.invoiceUrl, boletoUrl: payment.bankSlipUrl, billingType: payment.billingType,
    periodStart, periodEnd,
  };
}

interface Deps {
  asaasClient?: typeof defaultAsaas;
  prismaClient?: typeof defaultPrisma;
  sleep?: (ms: number) => Promise<void>;
}
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function syncInvoicesForSubscription(
  subscription: Pick<Subscription, "id" | "asaasSubscriptionId">,
  deps: Deps = {}
): Promise<Invoice[]> {
  const asaas = deps.asaasClient ?? defaultAsaas;
  const prisma = deps.prismaClient ?? defaultPrisma;
  const sleep = deps.sleep ?? realSleep;
  if (!subscription.asaasSubscriptionId) return [];

  // 1. coletar todas as cobranças (paginado + throttle)
  const payments: AsaasPayment[] = [];
  let offset = 0;
  for (;;) {
    const page = await asaas.payments.list({ subscription: subscription.asaasSubscriptionId, offset, limit: 100 });
    payments.push(...page.data);
    if (!page.hasMore) break;
    offset += page.data.length || 100;
    await sleep(200);
  }

  const novas: Invoice[] = [];
  for (const payment of payments) {
    if (!ELIGIBLE.has(payment.status)) continue;
    const existing = await prisma.invoice.findUnique({
      where: { subscriptionId_asaasPaymentId: { subscriptionId: subscription.id, asaasPaymentId: payment.id } },
    });
    if (existing) continue;

    const number = await nextSaasInvoiceNumber(prisma);
    const data = mapPaymentToInvoiceData(payment, number);

    // PIX (best-effort)
    let pixCode: string | undefined;
    try {
      const pix = await asaas.payments.pixQrCode(payment.id);
      pixCode = pix?.payload;
    } catch (e) {
      log.warn("pixQrCode falhou (segue sem PIX)", { paymentId: payment.id });
    }

    try {
      const created = await prisma.invoice.create({
        data: { ...data, subscriptionId: subscription.id, pixCode },
      });
      novas.push(created);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // corrida: já criada
      throw e;
    }
  }
  return novas;
}
```

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx vitest run src/services/invoice-sync.service.test.ts && npx tsc --noEmit` — PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/saas-invoice-number.ts src/lib/saas-invoice-number.test.ts \
  src/services/invoice-sync.service.ts src/services/invoice-sync.service.test.ts
git commit -m "feat(saas-cobranca): invoice-sync.service materializa Invoice do Asaas (filtro status, número atômico via SaasCounter, período derivado)"
```

---

### Task 5: 2 templates de email + catálogo

**Files:**
- Modify: `src/lib/emails/templates.ts`
- Test: `src/lib/emails/templates.test.ts` (estender)

**Contexto (da spec):** `saas-invoice-created` = "Sua fatura do Vis está disponível"; `saas-invoice-due-soon` = "Sua fatura do Vis vence em 3 dias". Conteúdo: valor (do Asaas), vencimento, **PIX copia-e-cola em destaque** (`pixCode`), **botão "Pagar agora"** (`paymentUrl`), **link do PDF do boleto** (`boletoUrl`). **SEM imagem de QR.** Se faltar `pixCode`/`boletoUrl`, degrada (mostra só o botão). Usar `renderSaasEmailLayout` (heading cru; bodyHtml com dados escapados via `escapeHtml`). Schema Zod por template. Campos do schema devem casar com o `SAMPLE` da preview (Task 2) e com o payload do motor (Task 6): `name, amountLabel, dueDateLabel, pixCode?, paymentUrl, boletoUrl?`.

- [ ] **Step 1: Teste falhando**
```typescript
import { renderEmailTemplate } from "./templates";

describe("saas-invoice-created", () => {
  const data = { name: "João", amountLabel: "R$ 149,90", dueDateLabel: "10/07/2026", pixCode: "PIXCOPIACOLA123", paymentUrl: "https://asaas/i/1", boletoUrl: "https://asaas/b/1" };
  it("renderiza com PIX copia-e-cola, botão e link do boleto", () => {
    const { html, text } = renderEmailTemplate("saas-invoice-created", data);
    expect(html).toContain("PIXCOPIACOLA123");
    expect(html).toContain("https://asaas/i/1");   // botão Pagar agora
    expect(html).toContain("https://asaas/b/1");   // boleto
    expect(html).toContain("R$ 149,90");
    expect(html).not.toContain("data:image");       // SEM imagem base64
    expect(html).not.toContain("encodedImage");
    expect(text).toContain("PIXCOPIACOLA123");
  });
  it("degrada sem pixCode/boletoUrl (só botão)", () => {
    const { html } = renderEmailTemplate("saas-invoice-created", { name: "João", amountLabel: "R$ 149,90", dueDateLabel: "10/07/2026", paymentUrl: "https://asaas/i/1" });
    expect(html).toContain("https://asaas/i/1");
  });
});

describe("saas-invoice-due-soon", () => {
  it("renderiza tom de lembrete", () => {
    const { html } = renderEmailTemplate("saas-invoice-due-soon", { name: "João", amountLabel: "R$ 149,90", dueDateLabel: "10/07/2026", pixCode: "PIX", paymentUrl: "https://asaas/i/1" });
    expect(html.toLowerCase()).toContain("vence");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/emails/templates.test.ts`

- [ ] **Step 3: Implementar** os 2 renders + cases. Esboço (em `templates.ts`, antes do router):
```typescript
const invoiceCreatedSchema = z.object({
  name: z.string().min(1),
  amountLabel: z.string().min(1),
  dueDateLabel: z.string().min(1),
  pixCode: z.string().optional(),
  paymentUrl: z.string().url(),
  boletoUrl: z.string().url().optional(),
});

function renderInvoiceBody(p: z.infer<typeof invoiceCreatedSchema>, isReminder: boolean): RenderedEmail {
  const amount = escapeHtml(p.amountLabel);
  const due = escapeHtml(p.dueDateLabel);
  const pix = p.pixCode ? escapeHtml(p.pixCode) : null;
  const boleto = p.boletoUrl ? escapeHtml(p.boletoUrl) : null;
  const intro = isReminder
    ? `<p style="margin:0 0 16px;">Passando para lembrar: sua fatura do Vis de <strong>${amount}</strong> vence em <strong>${due}</strong>.</p>`
    : `<p style="margin:0 0 16px;">Sua fatura do Vis de <strong>${amount}</strong> está disponível. Vencimento: <strong>${due}</strong>.</p>`;
  const pixBlock = pix
    ? `<p style="margin:0 0 8px;color:#374151;">PIX copia e cola:</p>
<p style="margin:0 0 22px;padding:12px;background:#f3f4f6;border-radius:6px;font-family:monospace;font-size:13px;word-break:break-all;">${pix}</p>`
    : "";
  const boletoBlock = boleto
    ? `<p style="margin:18px 0 0;font-size:13px;"><a href="${boleto}" style="color:#2563eb;">Baixar boleto em PDF</a></p>`
    : "";
  const bodyHtml = `${intro}${pixBlock}<p style="margin:0 0 6px;color:#6b7280;font-size:13px;">Prefere cartão ou ver o QR Code? Clique em "Pagar agora".</p>${boletoBlock}`;
  const html = renderSaasEmailLayout({
    previewTitle: isReminder ? "Sua fatura vence em breve" : "Sua fatura está disponível",
    heading: isReminder ? `${p.name}, sua fatura vence em 3 dias` : `${p.name}, sua fatura está disponível`,
    bodyHtml,
    cta: { label: "Pagar agora", url: p.paymentUrl },
  });
  const textLines = [
    isReminder ? `${p.name}, sua fatura do Vis de ${p.amountLabel} vence em ${p.dueDateLabel}.` : `${p.name}, sua fatura do Vis de ${p.amountLabel} está disponível (vence ${p.dueDateLabel}).`,
    "",
    pix ? `PIX copia e cola: ${p.pixCode}` : "",
    `Pagar agora: ${p.paymentUrl}`,
    boleto ? `Boleto: ${p.boletoUrl}` : "",
  ].filter(Boolean);
  return { html, text: textLines.join("\n") };
}

function renderSaasInvoiceCreated(data: unknown): RenderedEmail {
  return renderInvoiceBody(invoiceCreatedSchema.parse(data), false);
}
function renderSaasInvoiceDueSoon(data: unknown): RenderedEmail {
  return renderInvoiceBody(invoiceCreatedSchema.parse(data), true);
}
```
No switch de `renderEmailTemplate`:
```typescript
    case "saas-invoice-created":
      return renderSaasInvoiceCreated(data);
    case "saas-invoice-due-soon":
      return renderSaasInvoiceDueSoon(data);
```

- [ ] **Step 4: Rodar e ver passar + tsc** — `npx vitest run src/lib/emails/templates.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Commit**
```bash
git add src/lib/emails/templates.ts src/lib/emails/templates.test.ts
git commit -m "feat(saas-cobranca): templates saas-invoice-created e saas-invoice-due-soon (PIX copia-e-cola + botão, sem QR base64)"
```

---

### Task 6: Motor `runInvoiceReminders`

**Files:**
- Create: `src/services/invoice-reminders.service.ts`
- Test: `src/services/invoice-reminders.service.test.ts`

**Contexto (da spec):**
- `runInvoiceReminders(opts?: { now?: Date; deps? }): Promise<RunSummary>`.
- **Gate mestre:** lê `getSaasEmailConfig()`; se `invoiceGenerationEnabled === false` → retorna `{ skipped: "generation_disabled", ... }` SEM tocar Asaas.
- **Parte A (INVOICE_CREATED):** `subscription.findMany({ where: { status: "ACTIVE", asaasSubscriptionId: { not: null } } })` → `syncInvoicesForSubscription` → para cada fatura NOVA → `notifyCompany(companyId, "INVOICE_CREATED", payload, { periodKey: \`invoice:${id}:created\`, channels: ["email","inapp"], inapp })`. `companyId` vem de `subscription.companyId`.
- **Parte B (INVOICE_DUE_SOON):** `invoice.findMany({ where: { status: "PENDING", paymentConfirmedAt: null, subscription: { status: "ACTIVE" }, dueDate: { gt: now, lte: now+3d } } })` → `notifyCompany(.., "INVOICE_DUE_SOON", .., { periodKey: \`invoice:${id}:due_soon\` })` → marca `reminderSentAt: now`, `reminderCount: { increment: 1 }`.
- **RunSummary** serializável: `{ subscriptionsScanned, invoicesCreated, invoiceCreatedEmails, dueSoonEmails, skipped, errors, runAt }`.
- Per-sub try/catch (um erro não derruba a run). `now` injetável para testes determinísticos.
- O **payload** dos emails precisa de `name` (nome da empresa/dono), `amountLabel` (formatar `total` centavos → `R$ X,XX`), `dueDateLabel` (formatar `dueDate` pt-BR), `pixCode`, `paymentUrl`, `boletoUrl`. `name` = `company.name` (buscar via subscription→company) ou um fallback.

> **Idempotência:** o `SaasEmailLog` (periodKey por fatura+tipo) é a trava real (em `notifyCompany`). `reminderSentAt` é só marcador de UI — NÃO usar como dedupe.

- [ ] **Step 1: Teste falhando** (mockar `getSaasEmailConfig`, `syncInvoicesForSubscription`, `notifyCompany`, `prisma`)
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/saas-email-config.service", () => ({ getSaasEmailConfig: vi.fn() }));
vi.mock("@/services/invoice-sync.service", () => ({ syncInvoicesForSubscription: vi.fn() }));
vi.mock("@/services/saas-notification.service", () => ({ notifyCompany: vi.fn().mockResolvedValue({ status: "SENT" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  subscription: { findMany: vi.fn() },
  invoice: { findMany: vi.fn(), update: vi.fn() },
} }));

import { runInvoiceReminders } from "./invoice-reminders.service";
import { getSaasEmailConfig } from "@/services/saas-email-config.service";
import { syncInvoicesForSubscription } from "@/services/invoice-sync.service";
import { notifyCompany } from "@/services/saas-notification.service";
import { prisma } from "@/lib/prisma";

const NOW = new Date("2026-07-08T12:00:00Z");

beforeEach(() => vi.clearAllMocks());

it("gate: invoiceGenerationEnabled OFF → não toca Asaas", async () => {
  (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: false });
  const out = await runInvoiceReminders({ now: NOW });
  expect(out.skipped).toBe("generation_disabled");
  expect(syncInvoicesForSubscription).not.toHaveBeenCalled();
});

it("Parte A: cobrança nova de subscription ACTIVE → email INVOICE_CREATED", async () => {
  (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: true });
  (prisma.subscription.findMany as any).mockResolvedValue([
    { id: "sub_local", asaasSubscriptionId: "sub_1", companyId: "c1", company: { name: "Ótica X" } },
  ]);
  (syncInvoicesForSubscription as any).mockResolvedValue([
    { id: "inv_1", total: 14990, dueDate: NOW, paymentUrl: "https://asaas/i/1", boletoUrl: "https://asaas/b/1", pixCode: "PIX" },
  ]);
  (prisma.invoice.findMany as any).mockResolvedValue([]); // Parte B vazia
  const out = await runInvoiceReminders({ now: NOW });
  expect(out.invoiceCreatedEmails).toBe(1);
  expect(notifyCompany).toHaveBeenCalledWith("c1", "INVOICE_CREATED", expect.objectContaining({ paymentUrl: "https://asaas/i/1" }), expect.objectContaining({ periodKey: "invoice:inv_1:created" }));
});

it("Parte B: fatura PENDING vencendo em ≤3d → DUE_SOON + reminderSentAt", async () => {
  (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: true });
  (prisma.subscription.findMany as any).mockResolvedValue([]);
  (syncInvoicesForSubscription as any).mockResolvedValue([]);
  (prisma.invoice.findMany as any).mockResolvedValue([
    { id: "inv_2", total: 14990, dueDate: new Date("2026-07-10T00:00:00Z"), paymentUrl: "https://asaas/i/2", subscription: { companyId: "c2", company: { name: "Ótica Y" } } },
  ]);
  const out = await runInvoiceReminders({ now: NOW });
  expect(out.dueSoonEmails).toBe(1);
  expect(notifyCompany).toHaveBeenCalledWith("c2", "INVOICE_DUE_SOON", expect.anything(), expect.objectContaining({ periodKey: "invoice:inv_2:due_soon" }));
  expect(prisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv_2" } }));
});

it("erro numa subscription não derruba a run", async () => {
  (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: true });
  (prisma.subscription.findMany as any).mockResolvedValue([{ id: "s1", asaasSubscriptionId: "a1", companyId: "c1", company: { name: "X" } }]);
  (syncInvoicesForSubscription as any).mockRejectedValue(new Error("asaas down"));
  (prisma.invoice.findMany as any).mockResolvedValue([]);
  const out = await runInvoiceReminders({ now: NOW });
  expect(out.errors).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/services/invoice-reminders.service.test.ts`

- [ ] **Step 3: Implementar.** Esboço:
```typescript
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getSaasEmailConfig } from "@/services/saas-email-config.service";
import { syncInvoicesForSubscription } from "@/services/invoice-sync.service";
import { notifyCompany } from "@/services/saas-notification.service";

const log = logger.child({ service: "invoice-reminders" });

export interface RunSummary {
  subscriptionsScanned: number;
  invoicesCreated: number;
  invoiceCreatedEmails: number;
  dueSoonEmails: number;
  skipped: string | null;
  errors: number;
  runAt: string;
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dateBR(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Fortaleza" }).format(d);
}

export async function runInvoiceReminders(opts: { now?: Date } = {}): Promise<RunSummary> {
  const now = opts.now ?? new Date();
  const summary: RunSummary = { subscriptionsScanned: 0, invoicesCreated: 0, invoiceCreatedEmails: 0, dueSoonEmails: 0, skipped: null, errors: 0, runAt: now.toISOString() };

  const config = await getSaasEmailConfig();
  if (!config.invoiceGenerationEnabled) {
    summary.skipped = "generation_disabled";
    return summary;
  }

  // Parte A
  const subs = await prisma.subscription.findMany({
    where: { status: "ACTIVE", asaasSubscriptionId: { not: null } },
    include: { company: { select: { name: true } } },
  });
  summary.subscriptionsScanned = subs.length;
  for (const sub of subs) {
    try {
      const novas = await syncInvoicesForSubscription(sub);
      summary.invoicesCreated += novas.length;
      for (const inv of novas) {
        const r = await notifyCompany(sub.companyId, "INVOICE_CREATED", {
          name: sub.company?.name ?? "cliente",
          amountLabel: brl(inv.total),
          dueDateLabel: inv.dueDate ? dateBR(inv.dueDate) : "",
          pixCode: inv.pixCode ?? undefined,
          paymentUrl: inv.paymentUrl ?? "",
          boletoUrl: inv.boletoUrl ?? undefined,
        }, {
          periodKey: `invoice:${inv.id}:created`,
          channels: ["email", "inapp"],
          inapp: { title: "Nova fatura disponível", message: `Fatura ${brl(inv.total)} disponível para pagamento.`, link: "/dashboard/configuracoes" },
        });
        if (r.status === "SENT") summary.invoiceCreatedEmails++;
      }
    } catch (e) {
      summary.errors++;
      log.error("Falha ao sincronizar subscription", { subscriptionId: sub.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Parte B
  const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const dueSoon = await prisma.invoice.findMany({
    where: { status: "PENDING", paymentConfirmedAt: null, subscription: { status: "ACTIVE" }, dueDate: { gt: now, lte: in3d } },
    include: { subscription: { include: { company: { select: { name: true } } } } },
  });
  for (const inv of dueSoon) {
    try {
      const companyId = inv.subscription.companyId;
      const r = await notifyCompany(companyId, "INVOICE_DUE_SOON", {
        name: inv.subscription.company?.name ?? "cliente",
        amountLabel: brl(inv.total),
        dueDateLabel: inv.dueDate ? dateBR(inv.dueDate) : "",
        pixCode: inv.pixCode ?? undefined,
        paymentUrl: inv.paymentUrl ?? "",
        boletoUrl: inv.boletoUrl ?? undefined,
      }, {
        periodKey: `invoice:${inv.id}:due_soon`,
        channels: ["email", "inapp"],
        inapp: { title: "Fatura vence em breve", message: `Sua fatura de ${brl(inv.total)} vence em ${inv.dueDate ? dateBR(inv.dueDate) : "breve"}.`, link: "/dashboard/configuracoes" },
      });
      if (r.status === "SENT") {
        summary.dueSoonEmails++;
        await prisma.invoice.update({ where: { id: inv.id }, data: { reminderSentAt: now, reminderCount: { increment: 1 } } });
      }
    } catch (e) {
      summary.errors++;
      log.error("Falha no lembrete DUE_SOON", { invoiceId: inv.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return summary;
}
```
> **Ao implementador:** se algum mock do teste exigir um shape diferente (ex.: `inv.paymentUrl`), ajustar o teste OU a implementação para casar — mas manter os contratos da spec (periodKeys, filtros, RunSummary). Não enfraquecer os filtros de segurança.

- [ ] **Step 4: Rodar e ver passar + tsc** — `npx vitest run src/services/invoice-reminders.service.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Commit**
```bash
git add src/services/invoice-reminders.service.ts src/services/invoice-reminders.service.test.ts
git commit -m "feat(saas-cobranca): motor runInvoiceReminders (INVOICE_CREATED + DUE_SOON, gate mestre, RunSummary)"
```

---

### Task 7: Cron `invoice-reminders` + vercel.json

**Files:**
- Create: `src/app/api/cron/invoice-reminders/route.ts`
- Test: `src/app/api/cron/invoice-reminders/route.test.ts`
- Modify: `vercel.json`

**Contexto:** espelhar `reconcile-billing`: `GET`, fail-closed com `CRON_SECRET`, `maxDuration = 60`. Só autentica e chama `runInvoiceReminders()` (sem force), loga o RunSummary, responde JSON.

- [ ] **Step 1: Teste falhando**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/services/invoice-reminders.service", () => ({ runInvoiceReminders: vi.fn().mockResolvedValue({ skipped: null, invoiceCreatedEmails: 0, runAt: "x" }) }));
import { GET } from "./route";
import { runInvoiceReminders } from "@/services/invoice-reminders.service";

beforeEach(() => { vi.clearAllMocks(); process.env.CRON_SECRET = "sekret"; });

it("401 sem Bearer", async () => {
  const res = await GET(new Request("http://x/api/cron/invoice-reminders"));
  expect(res.status).toBe(401);
  expect(runInvoiceReminders).not.toHaveBeenCalled();
});
it("200 com Bearer correto e chama o motor", async () => {
  const res = await GET(new Request("http://x/api/cron/invoice-reminders", { headers: { authorization: "Bearer sekret" } }));
  expect(res.status).toBe(200);
  expect(runInvoiceReminders).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/api/cron/invoice-reminders/route.test.ts`

- [ ] **Step 3: Implementar**
```typescript
import { NextResponse } from "next/server";
import { runInvoiceReminders } from "@/services/invoice-reminders.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "cron/invoice-reminders" });
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) log.error("CRON_SECRET não configurado — invoice-reminders recusado (fail-closed)");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runInvoiceReminders();
    log.info("invoice-reminders concluído", { ...summary });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    log.error("Erro no invoice-reminders", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
```

- [ ] **Step 4: vercel.json** — adicionar ao array `crons` (vira 9):
```json
    {
      "path": "/api/cron/invoice-reminders",
      "schedule": "0 10 * * *"
    }
```

- [ ] **Step 5: Rodar e ver passar + tsc** — `npx vitest run src/app/api/cron/invoice-reminders/route.test.ts && npx tsc --noEmit`

- [ ] **Step 6: Commit**
```bash
git add src/app/api/cron/invoice-reminders/route.ts src/app/api/cron/invoice-reminders/route.test.ts vercel.json
git commit -m "feat(saas-cobranca): cron invoice-reminders (diário, fail-closed) + vercel.json 9 crons"
```

---

### Task 8: Gatilho manual `/api/admin/invoice-reminders/run`

**Files:**
- Create: `src/app/api/admin/invoice-reminders/run/route.ts`
- Test: `src/app/api/admin/invoice-reminders/run/route.test.ts`

**Contexto (da spec):** `POST`, auth por **sessão admin** SUPER_ADMIN (`getAdminSession` → 401 sem sessão, 403 não-SUPER_ADMIN). Chama o MESMO motor `runInvoiceReminders()` (sem force — respeita a flag mestre). Retorna o RunSummary para a UI.

- [ ] **Step 1: Teste falhando**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/admin-session", () => ({ getAdminSession: vi.fn() }));
vi.mock("@/services/invoice-reminders.service", () => ({ runInvoiceReminders: vi.fn().mockResolvedValue({ skipped: null, invoiceCreatedEmails: 2, dueSoonEmails: 1, runAt: "x" }) }));
import { POST } from "./route";
import { getAdminSession } from "@/lib/admin-session";
import { runInvoiceReminders } from "@/services/invoice-reminders.service";

beforeEach(() => vi.clearAllMocks());

it("401 sem sessão", async () => {
  (getAdminSession as any).mockResolvedValue(null);
  const res = await POST(new Request("http://x", { method: "POST" }));
  expect(res.status).toBe(401);
});
it("403 não-SUPER_ADMIN", async () => {
  (getAdminSession as any).mockResolvedValue({ id: "a", role: "SUPPORT" });
  const res = await POST(new Request("http://x", { method: "POST" }));
  expect(res.status).toBe(403);
  expect(runInvoiceReminders).not.toHaveBeenCalled();
});
it("SUPER_ADMIN → roda motor e retorna RunSummary", async () => {
  (getAdminSession as any).mockResolvedValue({ id: "a", role: "SUPER_ADMIN" });
  const res = await POST(new Request("http://x", { method: "POST" }));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.invoiceCreatedEmails).toBe(2);
  expect(runInvoiceReminders).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar**
```typescript
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { runInvoiceReminders } from "@/services/invoice-reminders.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/invoice-reminders/run" });
export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const summary = await runInvoiceReminders();
    log.info("invoice-reminders disparado manualmente", { adminId: admin.id, ...summary });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    log.error("Erro no disparo manual de invoice-reminders", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
```
> **Nota:** o teste chama `POST(req)` mas a assinatura é `POST()` — Next aceita handlers sem o param. Se o teste passar um Request, ajustar a assinatura para `POST(_request: Request)` (ignorado). Manter consistente.

- [ ] **Step 4: Rodar e ver passar + tsc**

- [ ] **Step 5: Commit**
```bash
git add src/app/api/admin/invoice-reminders/run/route.ts src/app/api/admin/invoice-reminders/run/route.test.ts
git commit -m "feat(saas-cobranca): gatilho manual POST /api/admin/invoice-reminders/run (SUPER_ADMIN, mesmo motor)"
```

---

### Task 9: Rota resend `/api/admin/invoices/[id]/resend-charge`

**Files:**
- Create: `src/app/api/admin/invoices/[id]/resend-charge/route.ts`
- Test: `src/app/api/admin/invoices/[id]/resend-charge/route.test.ts`

**Contexto (da spec):** `POST` (ADMIN ou SUPER_ADMIN). Carrega a Invoice (com subscription→companyId). Se faltar boleto/PIX, re-sincroniza (best-effort — opcional nesta fase; pode reusar `syncInvoicesForSubscription` ou só reenviar com o que tem). `notifyCompany(companyId, "INVOICE_CREATED", payload, { channels: ["email"], periodKey: \`invoice:${id}:resend:${YYYYMMDD}\` })` — o periodKey com data permite reenviar em dias diferentes mas não duplica no mesmo dia. Respeita modo teste (via notifyCompany). Next 16: `params` é `Promise` → `await params`.

- [ ] **Step 1: Teste falhando**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/admin-session", () => ({ getAdminSession: vi.fn() }));
vi.mock("@/services/saas-notification.service", () => ({ notifyCompany: vi.fn().mockResolvedValue({ status: "SENT" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { invoice: { findUnique: vi.fn() } } }));
import { POST } from "./route";
import { getAdminSession } from "@/lib/admin-session";
import { notifyCompany } from "@/services/saas-notification.service";
import { prisma } from "@/lib/prisma";

const ctx = { params: Promise.resolve({ id: "inv_1" }) };
beforeEach(() => vi.clearAllMocks());

it("401 sem sessão", async () => {
  (getAdminSession as any).mockResolvedValue(null);
  const res = await POST(new Request("http://x", { method: "POST" }), ctx);
  expect(res.status).toBe(401);
});
it("404 fatura inexistente", async () => {
  (getAdminSession as any).mockResolvedValue({ id: "a", role: "ADMIN" });
  (prisma.invoice.findUnique as any).mockResolvedValue(null);
  const res = await POST(new Request("http://x", { method: "POST" }), ctx);
  expect(res.status).toBe(404);
});
it("ADMIN → reenfileira via notifyCompany com periodKey de resend datado", async () => {
  (getAdminSession as any).mockResolvedValue({ id: "a", role: "ADMIN" });
  (prisma.invoice.findUnique as any).mockResolvedValue({
    id: "inv_1", total: 14990, dueDate: new Date("2026-07-10"), paymentUrl: "https://asaas/i/1", boletoUrl: "https://asaas/b/1", pixCode: "PIX",
    subscription: { companyId: "c1", company: { name: "Ótica X" } },
  });
  const res = await POST(new Request("http://x", { method: "POST" }), ctx);
  expect(res.status).toBe(200);
  const [companyId, type, , opts] = (notifyCompany as any).mock.calls[0];
  expect(companyId).toBe("c1");
  expect(type).toBe("INVOICE_CREATED");
  expect(opts.channels).toEqual(["email"]);
  expect(opts.periodKey).toMatch(/^invoice:inv_1:resend:\d{8}$/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar**
```typescript
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { notifyCompany } from "@/services/saas-notification.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/invoices/resend-charge" });
export const dynamic = "force-dynamic";

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dateBR(d: Date | null): string {
  return d ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Fortaleza" }).format(d) : "";
}
function yyyymmdd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN" && admin.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { subscription: { include: { company: { select: { name: true } } } } },
  });
  if (!invoice) return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });

  const companyId = invoice.subscription.companyId;
  const result = await notifyCompany(companyId, "INVOICE_CREATED", {
    name: invoice.subscription.company?.name ?? "cliente",
    amountLabel: brl(invoice.total),
    dueDateLabel: dateBR(invoice.dueDate),
    pixCode: invoice.pixCode ?? undefined,
    paymentUrl: invoice.paymentUrl ?? "",
    boletoUrl: invoice.boletoUrl ?? undefined,
  }, {
    channels: ["email"],
    periodKey: `invoice:${id}:resend:${yyyymmdd(new Date())}`,
  });
  log.info("reenvio de cobrança", { invoiceId: id, adminId: admin.id, status: result.status });
  return NextResponse.json({ success: true, status: result.status });
}
```
> **Nota:** `notifyCompany` exige `paymentUrl` válido (URL) no schema do template. Se a Invoice não tiver `paymentUrl` (fatura manual sem Asaas), o render falha → `notifyCompany` é fail-silent (FAILED). Aceitável nesta fase; a UI mostra o status retornado. (Re-sync para preencher boleto/PIX faltante fica como melhoria — YAGNI por ora; documentar.)

- [ ] **Step 4: Rodar e ver passar + tsc**

- [ ] **Step 5: Commit**
```bash
git add "src/app/api/admin/invoices/[id]/resend-charge/route.ts" "src/app/api/admin/invoices/[id]/resend-charge/route.test.ts"
git commit -m "feat(saas-cobranca): POST resend-charge (reenvia boleto/PIX via notifyCompany, periodKey datado)"
```

---

### Task 10: Tela admin — toggles + banner flag mestre + botão "Sincronizar agora"

**Files:**
- Create: `src/components/admin/sync-invoices-button.tsx`
- Modify: `src/app/admin/configuracoes/emails/emails-client.tsx`
- Modify: `src/app/admin/configuracoes/emails/page.tsx` (passar as 3 flags novas no `config`)
- Test: `src/components/admin/sync-invoices-button.test.tsx` (render + estado loading)

**Contexto:** A `EmailsClient` já recebe `config` e renderiza toggles a partir de `EMAIL_TYPES`. Adicionar:
1. Estender `interface EmailConfig` com `invoiceGenerationEnabled, invoiceCreatedEnabled, invoiceDueSoonEnabled`.
2. Adicionar ao array `EMAIL_TYPES` as 2 entradas novas: `{ key: "INVOICE_CREATED", label: "Fatura disponível", flag: "invoiceCreatedEnabled" }` e `{ key: "INVOICE_DUE_SOON", label: "Fatura a vencer", flag: "invoiceDueSoonEnabled" }`.
3. Novo bloco "Geração de cobrança" com toggle `invoiceGenerationEnabled` + banner condicional:
   - OFF → aviso cinza "Geração de cobrança DESLIGADA — o sistema não busca nem comunica cobranças. Ligue só quando estiver pronto."
   - ON + `testMode` → "Cobranças sendo processadas, mas emails vão só para `<testEmail>`."
   - ON + `!masterEnabled` → "⚠️ Geração ligada, mas o interruptor mestre de emails está DESLIGADO — nenhum email sai."
4. Botão `<SyncInvoicesButton />` (POST `/api/admin/invoice-reminders/run`, mostra RunSummary, desabilita durante o processamento).
5. Garantir que `page.tsx` (server) inclui as 3 flags ao montar o `config` passado ao client (se ele faz `select` explícito — senão já vem via objeto inteiro).

**Componente `sync-invoices-button.tsx`:**
```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncInvoicesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/invoice-reminders/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg((data as { error?: string }).error || "Erro ao sincronizar"); return; }
      if (data.skipped === "generation_disabled") {
        setMsg("Geração desligada — ligue a flag de geração primeiro.");
      } else {
        setMsg(`Processado: ${data.invoicesCreated ?? 0} faturas, ${(data.invoiceCreatedEmails ?? 0) + (data.dueSoonEmails ?? 0)} emails.`);
      }
      router.refresh();
    } catch {
      setMsg("Erro ao sincronizar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={run} disabled={loading}
        className="px-4 py-2 rounded-md font-semibold text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white">
        {loading ? "Sincronizando…" : "Sincronizar cobranças agora"}
      </button>
      {msg && <p className="text-sm text-gray-300">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 1: Teste falhando** (componente — mock `fetch` + `next/navigation`)
```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { SyncInvoicesButton } from "./sync-invoices-button";

it("mostra resumo após sincronizar", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, invoicesCreated: 3, invoiceCreatedEmails: 3, dueSoonEmails: 0 }), { status: 200 }));
  render(<SyncInvoicesButton />);
  fireEvent.click(screen.getByText("Sincronizar cobranças agora"));
  await waitFor(() => expect(screen.getByText(/Processado: 3 faturas/)).toBeInTheDocument());
});
```
> Se o projeto não tiver `@testing-library/react` configurado para componentes client, verificar como os testes de componente existentes rodam (procurar por `render(` em `src/**/*.test.tsx`). Se não houver infra de teste de componente, **reduzir** este teste a um teste de unidade da função de montagem da mensagem, ou pular o teste de UI e cobrir a rota (já coberta na Task 8) — registrar a decisão. Não introduzir framework novo.

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar** o componente + as edições em `emails-client.tsx` (EmailConfig estendido, EMAIL_TYPES +2, bloco de geração + banner, `<SyncInvoicesButton />`) e conferir `page.tsx`.

- [ ] **Step 4: Rodar testes do arquivo + tsc + build parcial**

Run: `npx vitest run src/components/admin/sync-invoices-button.test.tsx && npx tsc --noEmit`

- [ ] **Step 5: Commit**
```bash
git add src/components/admin/sync-invoices-button.tsx src/components/admin/sync-invoices-button.test.tsx \
  src/app/admin/configuracoes/emails/emails-client.tsx src/app/admin/configuracoes/emails/page.tsx
git commit -m "feat(saas-cobranca): tela emails ganha geração de cobrança (toggles + banner mestre + botão Sincronizar agora)"
```

---

### Task 11: Botões "Reenviar" (Faturas + Cliente) + "Sincronizar agora" em Faturas

**Files:**
- Create: `src/components/admin/resend-charge-button.tsx`
- Modify: `src/app/admin/financeiro/faturas/[id]/page.tsx` (montar `<ResendChargeButton invoiceId={...} />` + `<SyncInvoicesButton />`)
- Modify: `src/app/admin/clientes/[id]/page.tsx` (ou o componente da aba de faturas) — `<ResendChargeButton />` por fatura
- Test: `src/components/admin/resend-charge-button.test.tsx`

**Componente `resend-charge-button.tsx`** (mesma estrutura do sync, mas POST em `/api/admin/invoices/${invoiceId}/resend-charge`):
```typescript
"use client";
import { useState } from "react";

export function ResendChargeButton({ invoiceId, label = "Reenviar boleto/PIX" }: { invoiceId: string; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setLoading(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/resend-charge`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? (data.status === "SENT" ? "Reenviado." : `Status: ${data.status ?? "—"}`) : (data.error || "Erro"));
    } catch { setMsg("Erro"); } finally { setLoading(false); }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={loading} className="text-xs text-indigo-400 hover:text-indigo-300 underline disabled:opacity-50">
        {loading ? "Reenviando…" : label}
      </button>
      {msg && <span className="text-xs text-gray-400">{msg}</span>}
    </span>
  );
}
```

- [ ] **Step 1: Teste falhando** (mesmo padrão da Task 10; ou degradar para teste mínimo se não houver infra de componente — registrar).
- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar** o componente + montá-lo nas duas páginas. Em `faturas/[id]/page.tsx`, adicionar o botão resend perto das ações da fatura e o `<SyncInvoicesButton />` no topo da lista de faturas (`src/app/admin/financeiro/faturas/page.tsx` se for lá a lista). Em `clientes/[id]`, adicionar o resend na linha de cada Invoice da aba de faturas.
- [ ] **Step 4: Rodar testes do arquivo + tsc**
- [ ] **Step 5: Commit**
```bash
git add src/components/admin/resend-charge-button.tsx src/components/admin/resend-charge-button.test.tsx \
  "src/app/admin/financeiro/faturas/[id]/page.tsx" src/app/admin/financeiro/faturas/page.tsx \
  "src/app/admin/clientes/[id]/page.tsx"
git commit -m "feat(saas-cobranca): botões Reenviar boleto/PIX (Faturas + Cliente) + Sincronizar agora na lista de Faturas"
```

---

### Task 12: Widget "a receber esta semana" em `/admin/financeiro`

**Files:**
- Modify: `src/app/admin/financeiro/page.tsx`
- Test: `src/services/invoice-receivable.service.test.ts` (extrair a query para uma função pura testável)
- Create: `src/services/invoice-receivable.service.ts` (`getReceivableThisWeek(now)`)

**Contexto:** Componente de leitura. Query: faturas `status: PENDING`, `subscription.status: ACTIVE`, `dueDate` entre hoje e hoje+7d → lista (empresa, valor, vencimento) + total. Extrair a query para `getReceivableThisWeek(now, prismaClient?)` para testar.

- [ ] **Step 1: Teste falhando**
```typescript
import { describe, it, expect, vi } from "vitest";
import { getReceivableThisWeek } from "./invoice-receivable.service";

it("consulta PENDING/ACTIVE/próx 7d e soma total", async () => {
  const findMany = vi.fn().mockResolvedValue([
    { id: "i1", total: 14990, dueDate: new Date("2026-07-12"), subscription: { company: { name: "Ótica X" } } },
    { id: "i2", total: 18990, dueDate: new Date("2026-07-14"), subscription: { company: { name: "Ótica Y" } } },
  ]);
  const prismaClient = { invoice: { findMany } } as any;
  const out = await getReceivableThisWeek(new Date("2026-07-08T00:00:00Z"), prismaClient);
  expect(out.total).toBe(33980);
  expect(out.items).toHaveLength(2);
  const where = findMany.mock.calls[0][0].where;
  expect(where.status).toBe("PENDING");
  expect(where.subscription).toEqual({ status: "ACTIVE" });
  expect(where.dueDate.gte).toBeInstanceOf(Date);
  expect(where.dueDate.lte).toBeInstanceOf(Date);
});
```

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar** o service + montar o widget na página (card com lista + total). Service:
```typescript
import { prisma as defaultPrisma } from "@/lib/prisma";

export interface ReceivableItem { id: string; companyName: string; total: number; dueDate: Date | null; }
export interface ReceivableSummary { items: ReceivableItem[]; total: number; }

export async function getReceivableThisWeek(now: Date, prismaClient = defaultPrisma): Promise<ReceivableSummary> {
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const rows = await prismaClient.invoice.findMany({
    where: { status: "PENDING", subscription: { status: "ACTIVE" }, dueDate: { gte: now, lte: in7d } },
    include: { subscription: { include: { company: { select: { name: true } } } } },
    orderBy: { dueDate: "asc" },
  });
  const items = rows.map((r) => ({ id: r.id, companyName: r.subscription.company?.name ?? "—", total: r.total, dueDate: r.dueDate }));
  return { items, total: items.reduce((s, i) => s + i.total, 0) };
}
```

- [ ] **Step 4: Rodar e ver passar + tsc**

- [ ] **Step 5: Commit**
```bash
git add src/services/invoice-receivable.service.ts src/services/invoice-receivable.service.test.ts src/app/admin/financeiro/page.tsx
git commit -m "feat(saas-cobranca): widget 'a receber esta semana' em /admin/financeiro"
```

---

### Task 13: Suíte completa + build + revisão final

**Files:** nenhum novo (verificação).

- [ ] **Step 1: Suíte inteira verde**

Run: `npx vitest run`
Expected: 0 falhas (todos os ~700 testes + os novos da Fase 2).

- [ ] **Step 2: tsc limpo**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: build verde; rotas novas compiladas: `/api/cron/invoice-reminders`, `/api/admin/invoice-reminders/run`, `/api/admin/invoices/[id]/resend-charge`.

- [ ] **Step 4: Verificação de integração end-to-end (leitura, sem rodar)**

Conferir manualmente:
- enum `SaasEmailType` (schema) ↔ `SAAS_EMAIL_CATALOG` (Record completo) ↔ `SAMPLE` da preview (Record completo) ↔ switch de `renderEmailTemplate` (2 cases) — todos cobrem `INVOICE_CREATED` + `INVOICE_DUE_SOON`.
- campos do payload do motor (Task 6) ↔ campos dos schemas Zod dos templates (Task 5) ↔ `SAMPLE` da preview (Task 2) — mesmos nomes (`name, amountLabel, dueDateLabel, pixCode?, paymentUrl, boletoUrl?`).
- periodKeys distintos: `:created`, `:due_soon`, `:resend:YYYYMMDD` — nenhum colide.
- filtros de segurança presentes: status `{PENDING,OVERDUE}` no sync; `status: ACTIVE` no motor (A e B); `paymentConfirmedAt: null` + `dueDate > now` no DUE_SOON; valor sempre do Asaas.
- `invoiceGenerationEnabled` default `false` no schema; gate no motor.
- número da fatura via `nextSaasInvoiceNumber` (tabela `SaasCounter`, atômico, sem FK de Company) — **NÃO** `getNextSequence`/`Counter` (FK quebraria em prod). `SaasCounter` está na migration + semeado com o MAX atual de `INV-`.

- [ ] **Step 5: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore(saas-cobranca): suíte + build verdes, integração verificada"
```

---

## Notas de deploy / armadilhas (NÃO automatizar — só no fim, manual)

- **Estreia segura:** entregar com `invoiceGenerationEnabled = false` E `testMode = true`. Sequência pós-deploy: ligar a flag de geração (cron passa a processar; emails só p/ `testEmail`) → clicar "Sincronizar agora" → conferir boleto/PIX real chegando no `testEmail` → desligar modo teste (vai p/ clientes).
- **Deploy MANUAL** `vercel deploy --prod` (working tree, não o commit). Email do commit DEVE ser `cheapmilhas@users.noreply.github.com` (senão a Vercel BLOQUEIA o deploy). Vercel CLI em `~/.nvm/.../bin/vercel` (rodar `hash -r` se "command not found"), logado como `cheapmilhas-4586`, projeto `pdv-otica`.
- **Migration NÃO roda no build.** Aplicar manual via `prisma db execute` com **heredoc inline** (`<<'SQL'`) — o hook RTK quebra `--file` e `--stdin < arquivo` (`[rtk: No such file or directory]` exit 127). **`ALTER TYPE ... ADD VALUE` precisa de transação separada do uso do valor** (no Postgres o valor novo só fica visível após o commit da transação que o adicionou). Aplicar em 2 passos:
  1. `BEGIN; ALTER TYPE "SaasEmailType" ADD VALUE IF NOT EXISTS 'INVOICE_CREATED'; ALTER TYPE "SaasEmailType" ADD VALUE IF NOT EXISTS 'INVOICE_DUE_SOON'; COMMIT;`
  2. `BEGIN; ALTER TABLE "SaasEmailConfig" ADD COLUMN ...; CREATE UNIQUE INDEX ...; COMMIT;`
- **Registrar a migration em `_prisma_migrations`** manualmente (id, checksum, migration_name, finished_at) — senão um `migrate deploy` futuro tenta re-rodar. Calcular o checksum como nas migrations anteriores (ver o padrão usado na Fase 1, registrado na memória).
- **Drift do cockpit** (2 migrations `add_metric_sample`/`add_admin_action_log` no banco mas não no repo) continua pendente — pode fazer `migrate deploy` falhar com P3006/P3005; por isso aplicamos via `db execute` direto. NÃO tentar resolver o drift aqui.
- **ANTES de criar o unique:** conferir no banco de PROD que não há `(subscriptionId, asaasPaymentId)` duplicado com `asaasPaymentId` não-nulo:
  ```sql
  SELECT "subscriptionId", "asaasPaymentId", count(*)
  FROM "Invoice" WHERE "asaasPaymentId" IS NOT NULL
  GROUP BY 1,2 HAVING count(*) > 1;
  ```
  Se retornar linhas, resolver os duplicados antes de criar o índice (senão o `CREATE UNIQUE INDEX` falha).
- `vercel.json` vai de 8 → 9 crons (conta Pro/prod suporta).
- `ASAAS_API_KEY` já em prod (o cron usa ela via API direta, não o webhook). Webhook continua adiado — a Fase 2 NÃO depende dele.
- **`.env` local aponta para o Neon de PROD** — por isso NENHUM subagente roda `prisma migrate/db` durante a implementação.

## Fora de escopo (YAGNI — não implementar)

- SMS, desconto por pagamento antecipado, parcelamento, aviso de cartão vencido.
- Aviso pré-vencimento de 7 dias (só o de 3 dias).
- Dashboard MRR/Churn/Runway completo.
- NF-e anexada ao email.
- Backfill de empresas antigas sem `asaasSubscriptionId`.
- Bloqueio hard pós-trial-expired.
- Hospedar o QR base64 em CDN para `pixQrCodeUrl` (reservado, vazio nesta fase).
