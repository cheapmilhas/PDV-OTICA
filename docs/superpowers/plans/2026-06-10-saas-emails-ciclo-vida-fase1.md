# Emails Automáticos do SaaS — Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar automaticamente 7 emails transacionais do ciclo de vida da assinatura (boas-vindas, trial acabando/expirado, fatura vencida, pagamento confirmado, suspensão, cancelamento) aos clientes (donos das óticas), com controle por tela admin (liga/desliga + modo teste + histórico).

**Architecture:** Reusa 80% da infra existente (fila `email_queue` + Resend + cron email-queue; cron dunning; webhook Asaas; `CompanyNotification` in-app). Adiciona uma "camada de mensagens" no meio: um service `saas-notification.service.ts` (`notifyCompany`) que resolve destinatário, checa a config, garante idempotência, enfileira email + in-app e registra histórico. Dois models novos (`SaasEmailConfig` singleton + `SaasEmailLog`), 7 templates de email, 1 cron novo (`subscription-watch` p/ trial) e ganchos nos 3 gatilhos existentes (webhook, dunning, ativação).

**Tech Stack:** Next.js 16 (App Router), Prisma + PostgreSQL (Neon), TypeScript, Zod, Resend, Vitest, Shadcn UI.

**Spec de referência:** `docs/superpowers/specs/2026-06-10-saas-emails-ciclo-vida-design.md`

---

## Princípios desta Fase

- **TDD:** teste falhando primeiro, implementação mínima, teste passando, commit. Cada task é um ciclo.
- **Fail-silent:** nenhuma notificação pode quebrar o webhook/cron/ativação que a chamou. `notifyCompany` engole erro e loga.
- **Idempotência:** `SaasEmailLog` com `@@unique([companyId, eventType, periodKey])` é a trava anti-duplicata. Antes de enfileirar, inserir o log; colisão de unique = já enviado = SKIP.
- **Modo teste LIGADO na entrega:** os emails saem só para `testEmail` do dono até ele desligar o modo teste na tela.
- **Sem in-app duplicado no dunning:** o cron dunning JÁ cria `CompanyNotification`. Nos itens INVOICE_OVERDUE/SUSPENDED/CANCELED o `notifyCompany` envia **só email** (`channels: ["email"]`).
- **Antes de cada commit:** `npm run typecheck` (ou `npx tsc --noEmit`) + suíte de testes do arquivo + `npm run build` no final de cada task que toca rota/page. Tudo verde.

## Convenções do projeto (ler antes de começar)

- **Prisma multi-tenant:** sempre `companyId` nos filtros. `prisma` importado de `@/lib/prisma`.
- **Logger:** `import { logger } from "@/lib/logger"` → `const log = logger.child({ service: "..." })`. Nada de `console.log`.
- **Enfileirar email:** `prisma.emailQueue.create({ data: { to, subject, template, data } })`. O cron `email-queue` (7h) processa e o `renderEmailTemplate(template, data)` renderiza. `template` é a string do switch em `src/lib/emails/templates.ts`.
- **In-app:** `createCompanyNotification({ companyId, userId: null, type: CompanyNotificationType.BILLING, title, message, link, metadata })` de `@/services/company-notification.service`.
- **Admin auth:** páginas → `await requireAdminRole(["SUPER_ADMIN"])`; rotas API → `const admin = await getAdminSession(); if (!admin) 401; if (admin.role !== "SUPER_ADMIN") 403;` (ambos de `@/lib/admin-session`).
- **Singleton config:** padrão de `AutoSyncConfig` / `auto-sync-config.service.ts` (upsert com `id: "singleton"`).
- **Escape de HTML em templates:** `escapeHtml` de `@/lib/escape-html` em TODO dado dinâmico interpolado no HTML (ver `renderInviteEmail`).
- **Testes:** Vitest. Arquivos `*.test.ts` ao lado do código. Rodar `npx vitest run <arquivo>`.

---

## File Structure

**Models (Prisma):**
- `prisma/schema.prisma` — adicionar `model SaasEmailConfig`, `model SaasEmailLog`, `enum SaasEmailType`, `enum SaasEmailLogStatus`. Migration aditiva.

**Camada de mensagens (cérebro):**
- `src/services/saas-notification.service.ts` (criar) — `notifyCompany()` + resolução de destinatário + idempotência + dispatch.
- `src/services/saas-notification.service.test.ts` (criar) — testes do cérebro.
- `src/services/saas-email-config.service.ts` (criar) — get/update do singleton `SaasEmailConfig` (espelha `auto-sync-config.service.ts`).
- `src/services/saas-email-config.service.test.ts` (criar).

**Templates (7):**
- `src/lib/emails/templates.ts` (modificar) — estender o `switch` de `renderEmailTemplate` com 7 casos + 1 layout base "modo email" Vis reusável.
- `src/lib/emails/templates.test.ts` (modificar) — render + Zod de cada template.

**Gatilhos:**
- `src/app/api/webhooks/asaas/route.ts` (modificar) — PAYMENT_CONFIRMED → `notifyCompany`.
- `src/app/api/cron/dunning/route.ts` (modificar) — marcos 3/7/14 → INVOICE_OVERDUE; suspensão → SUBSCRIPTION_SUSPENDED; cancelamento → SUBSCRIPTION_CANCELED (só email).
- `src/app/api/auth/activate/route.ts` (modificar) — pós-commit → WELCOME.
- `src/app/api/cron/subscription-watch/route.ts` (criar) — cron novo do trial.
- `src/services/subscription-watch.service.ts` (criar) — lógica pura/testável do varredor de trial.
- `src/services/subscription-watch.service.test.ts` (criar).
- `vercel.json` (modificar) — +1 cron.

**Tela admin:**
- `src/app/api/admin/saas-emails/config/route.ts` (criar) — GET/PATCH config (SUPER_ADMIN).
- `src/app/api/admin/saas-emails/config/route.test.ts` (criar).
- `src/app/api/admin/saas-emails/preview/route.ts` (criar) — preview HTML de um template (SUPER_ADMIN).
- `src/app/admin/configuracoes/emails/page.tsx` (criar) — server page.
- `src/app/admin/configuracoes/emails/emails-client.tsx` (criar) — client (toggles + preview + histórico + modo teste).
- Item no menu admin (modificar o componente de navegação admin — localizar na Task 11).

---

## Task 1: Models Prisma (`SaasEmailConfig`, `SaasEmailLog`, enums) + migration

**Files:**
- Modify: `prisma/schema.prisma` (adicionar ao final, perto de `AutoSyncConfig`)
- Migration: `prisma/migrations/<timestamp>_saas_email_models/migration.sql`

- [ ] **Step 1: Adicionar enums e models ao schema**

Adicionar no `prisma/schema.prisma` (logo após o `model AutoSyncConfig`):

```prisma
/// Tipos de email transacional do ciclo de vida da assinatura (Fase 1).
enum SaasEmailType {
  WELCOME
  TRIAL_ENDING
  TRIAL_EXPIRED
  INVOICE_OVERDUE
  PAYMENT_CONFIRMED
  SUBSCRIPTION_SUSPENDED
  SUBSCRIPTION_CANCELED
}

enum SaasEmailLogStatus {
  PENDING
  SENT
  SKIPPED
  FAILED
}

/// Config global dos emails do SaaS. Registro ÚNICO (id fixo "singleton" via
/// upsert no service). Flags liga/desliga por tipo + modo teste. Entregue com
/// testMode LIGADO (emails vão só p/ testEmail até o dono desligar).
model SaasEmailConfig {
  id                        String   @id
  masterEnabled             Boolean  @default(true)
  testMode                  Boolean  @default(true)
  testEmail                 String?
  welcomeEnabled            Boolean  @default(true)
  trialEndingEnabled        Boolean  @default(true)
  trialExpiredEnabled       Boolean  @default(true)
  invoiceOverdueEnabled     Boolean  @default(true)
  paymentConfirmedEnabled   Boolean  @default(true)
  subscriptionSuspendedEnabled  Boolean @default(true)
  subscriptionCanceledEnabled   Boolean @default(true)
  updatedBy                 String?
  updatedAt                 DateTime @updatedAt
}

/// Histórico + chave de idempotência de cada notificação do SaaS disparada.
/// A unique (companyId, eventType, periodKey) impede reenviar o mesmo evento
/// no mesmo período (ex.: "vencida 7d" uma vez só; trial ending uma vez só).
model SaasEmailLog {
  id           String             @id @default(cuid())
  companyId    String
  eventType    SaasEmailType
  periodKey    String
  to           String
  status       SaasEmailLogStatus @default(PENDING)
  channels     String             @default("email")
  emailQueueId String?
  skipReason   String?
  createdAt    DateTime           @default(now())

  company Company @relation(fields: [companyId], references: [id])

  @@unique([companyId, eventType, periodKey])
  @@index([companyId, createdAt])
  @@index([eventType, createdAt])
}
```

Adicionar a relação inversa no `model Company` (procurar o bloco `model Company`, adicionar na lista de relações):

```prisma
  saasEmailLogs SaasEmailLog[]
```

- [ ] **Step 2: Gerar a migration (sem aplicar em prod)**

Run: `npx prisma migrate dev --name saas_email_models --create-only`
Expected: cria `prisma/migrations/<timestamp>_saas_email_models/migration.sql` com `CREATE TABLE "SaasEmailConfig"`, `CREATE TABLE "SaasEmailLog"`, os 2 enums e o unique index. Inspecionar o SQL: deve ser **puramente aditivo** (só CREATE, nenhum DROP/ALTER destrutivo).

- [ ] **Step 3: Aplicar localmente e gerar o client**

Run: `npx prisma migrate dev` (aplica no banco local) e confirmar `npx prisma generate`.
Expected: migration aplicada; `SaasEmailType`, `SaasEmailLogStatus`, `SaasEmailConfig`, `SaasEmailLog` disponíveis em `@prisma/client`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (nenhum erro de tipo novo).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(saas-emails): models SaasEmailConfig + SaasEmailLog (Fase 1)"
```

---

## Task 2: Service de config singleton (`saas-email-config.service.ts`)

Espelha `src/services/auto-sync-config.service.ts`.

**Files:**
- Create: `src/services/saas-email-config.service.ts`
- Test: `src/services/saas-email-config.service.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { saasEmailConfig: { upsert: (...a: unknown[]) => upsert(...a) } },
}));

import { getSaasEmailConfig, updateSaasEmailConfig } from "./saas-email-config.service";

describe("saas-email-config.service", () => {
  beforeEach(() => upsert.mockReset());

  it("getSaasEmailConfig faz upsert do singleton e retorna o registro", async () => {
    upsert.mockResolvedValue({ id: "singleton", masterEnabled: true, testMode: true });
    const cfg = await getSaasEmailConfig();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "singleton" }, create: { id: "singleton" } })
    );
    expect(cfg.testMode).toBe(true);
  });

  it("updateSaasEmailConfig aplica o patch e registra updatedBy", async () => {
    upsert.mockResolvedValue({ id: "singleton", testMode: false });
    await updateSaasEmailConfig({ testMode: false }, "admin-1");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "singleton" },
        update: { testMode: false, updatedBy: "admin-1" },
      })
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/services/saas-email-config.service.test.ts`
Expected: FAIL ("Cannot find module './saas-email-config.service'").

- [ ] **Step 3: Implementar**

```typescript
import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "singleton";

export interface SaasEmailConfigPatch {
  masterEnabled?: boolean;
  testMode?: boolean;
  testEmail?: string | null;
  welcomeEnabled?: boolean;
  trialEndingEnabled?: boolean;
  trialExpiredEnabled?: boolean;
  invoiceOverdueEnabled?: boolean;
  paymentConfirmedEnabled?: boolean;
  subscriptionSuspendedEnabled?: boolean;
  subscriptionCanceledEnabled?: boolean;
}

/** Lê (e garante) o registro único de config dos emails do SaaS. */
export async function getSaasEmailConfig() {
  return prisma.saasEmailConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
}

/** Atualiza o singleton registrando quem mudou. */
export async function updateSaasEmailConfig(patch: SaasEmailConfigPatch, updatedBy?: string) {
  return prisma.saasEmailConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...patch, updatedBy },
    update: { ...patch, updatedBy },
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/services/saas-email-config.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/services/saas-email-config.service.ts src/services/saas-email-config.service.test.ts
git commit -m "feat(saas-emails): service de config singleton"
```

---

## Task 3: Mapa de tipos de email (catálogo) — `saas-email-catalog.ts`

Tabela pura que liga cada `SaasEmailType` ao `template`, ao `subject` e à flag da config. Mantém o service e a tela DRY.

**Files:**
- Create: `src/lib/emails/saas-email-catalog.ts`
- Test: `src/lib/emails/saas-email-catalog.test.ts`

- [ ] **Step 1: Teste falhando**

```typescript
import { describe, it, expect } from "vitest";
import { SAAS_EMAIL_CATALOG, isSaasEmailEnabled } from "./saas-email-catalog";
import type { SaasEmailType } from "@prisma/client";

describe("saas-email-catalog", () => {
  it("cobre os 7 tipos da Fase 1", () => {
    const keys = Object.keys(SAAS_EMAIL_CATALOG);
    expect(keys.sort()).toEqual(
      [
        "WELCOME",
        "TRIAL_ENDING",
        "TRIAL_EXPIRED",
        "INVOICE_OVERDUE",
        "PAYMENT_CONFIRMED",
        "SUBSCRIPTION_SUSPENDED",
        "SUBSCRIPTION_CANCELED",
      ].sort()
    );
  });

  it("cada tipo tem template e subject", () => {
    for (const entry of Object.values(SAAS_EMAIL_CATALOG)) {
      expect(entry.template).toMatch(/^saas-/);
      expect(entry.subject.length).toBeGreaterThan(0);
    }
  });

  it("isSaasEmailEnabled lê a flag certa da config", () => {
    const cfg = { invoiceOverdueEnabled: false, welcomeEnabled: true } as never;
    expect(isSaasEmailEnabled("INVOICE_OVERDUE" as SaasEmailType, cfg)).toBe(false);
    expect(isSaasEmailEnabled("WELCOME" as SaasEmailType, cfg)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/emails/saas-email-catalog.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```typescript
import type { SaasEmailType } from "@prisma/client";

export interface SaasEmailCatalogEntry {
  /** string do switch em renderEmailTemplate */
  template: string;
  /** assunto do email */
  subject: string;
  /** chave da flag liga/desliga no SaasEmailConfig */
  configFlag:
    | "welcomeEnabled"
    | "trialEndingEnabled"
    | "trialExpiredEnabled"
    | "invoiceOverdueEnabled"
    | "paymentConfirmedEnabled"
    | "subscriptionSuspendedEnabled"
    | "subscriptionCanceledEnabled";
}

export const SAAS_EMAIL_CATALOG: Record<SaasEmailType, SaasEmailCatalogEntry> = {
  WELCOME: {
    template: "saas-welcome",
    subject: "Bem-vindo(a) ao Vis 🎉",
    configFlag: "welcomeEnabled",
  },
  TRIAL_ENDING: {
    template: "saas-trial-ending",
    subject: "Seu período de teste do Vis está acabando",
    configFlag: "trialEndingEnabled",
  },
  TRIAL_EXPIRED: {
    template: "saas-trial-expired",
    subject: "Seu período de teste do Vis terminou",
    configFlag: "trialExpiredEnabled",
  },
  INVOICE_OVERDUE: {
    template: "saas-invoice-overdue",
    subject: "Pagamento da sua assinatura Vis em atraso",
    configFlag: "invoiceOverdueEnabled",
  },
  PAYMENT_CONFIRMED: {
    template: "saas-payment-confirmed",
    subject: "Pagamento confirmado — obrigado!",
    configFlag: "paymentConfirmedEnabled",
  },
  SUBSCRIPTION_SUSPENDED: {
    template: "saas-subscription-suspended",
    subject: "Seu acesso ao Vis foi suspenso",
    configFlag: "subscriptionSuspendedEnabled",
  },
  SUBSCRIPTION_CANCELED: {
    template: "saas-subscription-canceled",
    subject: "Sua assinatura do Vis foi cancelada",
    configFlag: "subscriptionCanceledEnabled",
  },
};

/** True se o tipo está ligado na config (e o mestre está ligado — checado fora). */
export function isSaasEmailEnabled(
  eventType: SaasEmailType,
  config: Record<string, boolean>
): boolean {
  const flag = SAAS_EMAIL_CATALOG[eventType].configFlag;
  return config[flag] !== false;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/emails/saas-email-catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/lib/emails/saas-email-catalog.ts src/lib/emails/saas-email-catalog.test.ts
git commit -m "feat(saas-emails): catálogo de tipos (template/subject/flag)"
```

---

## Task 4: Layout base "modo email" Vis (reusável)

Antes dos 7 templates, criar um helper de layout que todos reusam (DRY). HTML modo-email (tabelas, CSS inline, ~600px, marca Vis #2E6BFF). Base de compatibilidade: o `renderInviteEmail` atual.

**Files:**
- Create: `src/lib/emails/saas-email-layout.ts`
- Test: `src/lib/emails/saas-email-layout.test.ts`

- [ ] **Step 1: Teste falhando**

```typescript
import { describe, it, expect } from "vitest";
import { renderSaasEmailLayout } from "./saas-email-layout";

describe("renderSaasEmailLayout", () => {
  it("monta HTML com título, corpo, botão e marca Vis", () => {
    const html = renderSaasEmailLayout({
      previewTitle: "Bem-vindo",
      heading: "Olá, João",
      bodyHtml: "<p>Conta criada.</p>",
      cta: { label: "Acessar", url: "https://app.vis.app.br" },
    });
    expect(html).toContain("Olá, João");
    expect(html).toContain("Acessar");
    expect(html).toContain("https://app.vis.app.br");
    expect(html).toContain("#2E6BFF"); // marca Vis
    expect(html).toContain("<table"); // modo email
    expect(html).not.toContain("display:flex"); // sem flexbox
  });

  it("funciona sem CTA (botão opcional)", () => {
    const html = renderSaasEmailLayout({
      previewTitle: "Aviso",
      heading: "Aviso",
      bodyHtml: "<p>Corpo.</p>",
    });
    expect(html).toContain("Aviso");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/emails/saas-email-layout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
import { escapeHtml } from "@/lib/escape-html";

export interface SaasEmailCta {
  label: string;
  url: string;
}

export interface SaasEmailLayoutInput {
  /** vai no <title>, não exibido no corpo */
  previewTitle: string;
  /** título grande do email (texto puro, será escapado) */
  heading: string;
  /** corpo já em HTML seguro (montado pelo template, dados já escapados lá) */
  bodyHtml: string;
  cta?: SaasEmailCta;
}

const BRAND = "#2E6BFF";

/**
 * Layout base "modo email" da marca Vis: tabelas, CSS inline, ~600px.
 * Os templates montam `bodyHtml` com seus próprios dados (já escapados) e
 * passam um CTA opcional. O `heading` é escapado aqui.
 */
export function renderSaasEmailLayout(input: SaasEmailLayoutInput): string {
  const title = escapeHtml(input.previewTitle);
  const heading = escapeHtml(input.heading);
  const ctaHtml = input.cta
    ? `<p style="margin:0 0 26px;">
         <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;border-radius:6px;padding:12px 20px;font-weight:700;">${escapeHtml(
        input.cta.label
      )}</a>
       </p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#f6f7fb;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 10px;color:${BRAND};font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Vis</p>
                <h1 style="margin:0;color:#111827;font-size:24px;line-height:1.25;">${heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 4px;color:#374151;font-size:15px;line-height:1.6;">
                ${input.bodyHtml}
                ${ctaHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 28px;color:#9ca3af;font-size:12px;line-height:1.5;border-top:1px solid #f0f1f4;">
                Vis — Sistema de gestão para óticas.<br />
                Você recebeu este email porque tem uma conta no Vis.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/emails/saas-email-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/lib/emails/saas-email-layout.ts src/lib/emails/saas-email-layout.test.ts
git commit -m "feat(saas-emails): layout base modo-email da marca Vis"
```

---

## Task 5: Os 7 templates + integração no `renderEmailTemplate`

Cada template tem schema Zod próprio e monta `bodyHtml` + CTA, delegando o chrome ao `renderSaasEmailLayout`. Registrar os 7 no `switch`.

**Files:**
- Modify: `src/lib/emails/templates.ts`
- Modify: `src/lib/emails/templates.test.ts`

- [ ] **Step 1: Escrever os testes falhando** (adicionar ao `templates.test.ts`)

```typescript
import { renderEmailTemplate } from "./templates";

describe("templates SaaS (Fase 1)", () => {
  const base = "https://app.vis.app.br";

  it("saas-welcome renderiza com nome e URL de acesso", () => {
    const { html, text } = renderEmailTemplate("saas-welcome", {
      name: "João",
      loginUrl: base,
    });
    expect(html).toContain("João");
    expect(html).toContain(base);
    expect(text).toContain("João");
  });

  it("saas-trial-ending mostra dias restantes e CTA de assinar", () => {
    const { html } = renderEmailTemplate("saas-trial-ending", {
      name: "João",
      daysLeft: 3,
      subscribeUrl: base + "/dashboard/upgrade",
    });
    expect(html).toContain("3");
    expect(html).toContain("/dashboard/upgrade");
  });

  it("saas-trial-expired renderiza CTA de assinar", () => {
    const { html } = renderEmailTemplate("saas-trial-expired", {
      name: "João",
      subscribeUrl: base + "/dashboard/upgrade",
    });
    expect(html).toContain("/dashboard/upgrade");
  });

  it("saas-invoice-overdue mostra dias de atraso e CTA de pagar", () => {
    const { html } = renderEmailTemplate("saas-invoice-overdue", {
      name: "João",
      daysOverdue: 7,
      payUrl: base + "/dashboard/configuracoes",
    });
    expect(html).toContain("7");
    expect(html).toContain("/dashboard/configuracoes");
  });

  it("saas-payment-confirmed mostra valor", () => {
    const { html } = renderEmailTemplate("saas-payment-confirmed", {
      name: "João",
      amountLabel: "R$ 149,90",
    });
    expect(html).toContain("R$ 149,90");
  });

  it("saas-subscription-suspended renderiza CTA de regularizar", () => {
    const { html } = renderEmailTemplate("saas-subscription-suspended", {
      name: "João",
      payUrl: base + "/dashboard/configuracoes",
    });
    expect(html).toContain("/dashboard/configuracoes");
  });

  it("saas-subscription-canceled renderiza mensagem de cancelamento", () => {
    const { html } = renderEmailTemplate("saas-subscription-canceled", {
      name: "João",
      reactivateUrl: base + "/dashboard/upgrade",
    });
    expect(html).toContain("/dashboard/upgrade");
  });

  it("rejeita dados inválidos (Zod)", () => {
    expect(() => renderEmailTemplate("saas-welcome", { name: "" })).toThrow();
  });

  it("escapa HTML do nome (anti-injeção)", () => {
    const { html } = renderEmailTemplate("saas-welcome", {
      name: "<script>x</script>",
      loginUrl: base,
    });
    expect(html).not.toContain("<script>x</script>");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/emails/templates.test.ts`
Expected: FAIL ("Unsupported email template: saas-welcome").

- [ ] **Step 3: Implementar os 7 templates em `templates.ts`**

No topo, importar o layout:

```typescript
import { renderSaasEmailLayout, type SaasEmailCta } from "@/lib/emails/saas-email-layout";
```

Adicionar os schemas + funções de render (exemplo de 2; seguir o mesmo padrão para os outros 5 — escapar TODO dado, usar `<p>` no bodyHtml, CTA conforme catálogo). Texto plano (`text`) curto em paralelo ao HTML:

```typescript
const welcomeSchema = z.object({ name: z.string().min(1), loginUrl: z.string().url() });
function renderSaasWelcome(data: unknown): RenderedEmail {
  const p = welcomeSchema.parse(data);
  const name = escapeHtml(p.name);
  const bodyHtml = `<p style="margin:0 0 16px;">Sua conta no Vis está ativa. A partir de agora você tem o controle completo da sua ótica em um só lugar — vendas, ordens de serviço, estoque e financeiro.</p>
<p style="margin:0 0 22px;">Clique abaixo para começar.</p>`;
  const html = renderSaasEmailLayout({
    previewTitle: "Bem-vindo ao Vis",
    heading: `Bem-vindo(a), ${name}`,
    bodyHtml,
    cta: { label: "Acessar o sistema", url: p.loginUrl },
  });
  const text = [`Bem-vindo(a), ${p.name}`, "", "Sua conta no Vis está ativa.", `Acesse: ${p.loginUrl}`].join("\n");
  return { html, text };
}

const invoiceOverdueSchema = z.object({
  name: z.string().min(1),
  daysOverdue: z.number().int().nonnegative(),
  payUrl: z.string().url(),
});
function renderSaasInvoiceOverdue(data: unknown): RenderedEmail {
  const p = invoiceOverdueSchema.parse(data);
  const name = escapeHtml(p.name);
  const bodyHtml = `<p style="margin:0 0 16px;">Identificamos um atraso de <strong>${p.daysOverdue} dia(s)</strong> no pagamento da sua assinatura Vis.</p>
<p style="margin:0 0 22px;">Regularize agora para manter seu acesso ativo e evitar a suspensão.</p>`;
  const html = renderSaasEmailLayout({
    previewTitle: "Pagamento em atraso",
    heading: `${name}, seu pagamento está em atraso`,
    bodyHtml,
    cta: { label: "Pagar agora", url: p.payUrl },
  });
  const text = [`${p.name}, seu pagamento está em atraso (${p.daysOverdue} dia(s)).`, "", `Regularize: ${p.payUrl}`].join("\n");
  return { html, text };
}
```

> Implementar também: `renderSaasTrialEnding` (campos `name`, `daysLeft:number`, `subscribeUrl`), `renderSaasTrialExpired` (`name`, `subscribeUrl`), `renderSaasPaymentConfirmed` (`name`, `amountLabel:string`; CTA opcional — pode não ter botão, apenas agradecimento), `renderSaasSubscriptionSuspended` (`name`, `payUrl`), `renderSaasSubscriptionCanceled` (`name`, `reactivateUrl`). Cada um com seu schema Zod, escape de dados, e `text` curto.

Estender o `switch`:

```typescript
export function renderEmailTemplate(template: string, data: unknown): RenderedEmail {
  switch (template) {
    case "invite":
      return renderInviteEmail(data);
    case "saas-welcome":
      return renderSaasWelcome(data);
    case "saas-trial-ending":
      return renderSaasTrialEnding(data);
    case "saas-trial-expired":
      return renderSaasTrialExpired(data);
    case "saas-invoice-overdue":
      return renderSaasInvoiceOverdue(data);
    case "saas-payment-confirmed":
      return renderSaasPaymentConfirmed(data);
    case "saas-subscription-suspended":
      return renderSaasSubscriptionSuspended(data);
    case "saas-subscription-canceled":
      return renderSaasSubscriptionCanceled(data);
    default:
      throw new Error(`Unsupported email template: ${template}`);
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/emails/templates.test.ts`
Expected: PASS (todos, incluindo o de escape e o de Zod).

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/lib/emails/templates.ts src/lib/emails/templates.test.ts
git commit -m "feat(saas-emails): 7 templates transacionais (modo email Vis)"
```

---

## Task 6: O cérebro — `saas-notification.service.ts` (`notifyCompany`)

O coração da Fase 1. Resolve destinatário, checa config, garante idempotência via `SaasEmailLog`, enfileira email + in-app, fail-silent.

**Files:**
- Create: `src/services/saas-notification.service.ts`
- Test: `src/services/saas-notification.service.test.ts`

**Contrato:**

```typescript
notifyCompany(
  companyId: string,
  eventType: SaasEmailType,
  payload: Record<string, unknown>, // dados do template (name, daysLeft, etc.)
  opts: {
    periodKey: string;            // chave de idempotência (ex.: "welcome", "stage:7", "trial-ending")
    channels?: ("email" | "inapp")[]; // default ["email","inapp"]
    inapp?: { title: string; message: string; link?: string }; // obrigatório se "inapp" em channels
  }
): Promise<{ status: "SENT" | "SKIPPED" | "FAILED"; reason?: string }>
```

**Lógica (ordem):**
1. Carrega `getSaasEmailConfig()`. Se `!masterEnabled` → registra log SKIPPED (reason "master_off"), retorna SKIPPED.
2. Se `!isSaasEmailEnabled(eventType, config)` → log SKIPPED (reason "type_off"), retorna.
3. Resolve destinatário: `billingEmail` → `email` → email do User ADMIN mais antigo. Sem nenhum → log SKIPPED (reason "no_recipient"), retorna.
4. Se `config.testMode` → `to = config.testEmail` (se vazio → SKIPPED reason "test_mode_no_email").
5. **Idempotência:** tenta `prisma.saasEmailLog.create({ companyId, eventType, periodKey, to, status: PENDING, channels })`. Se P2002 (unique) → já enviado → retorna SKIPPED (reason "duplicate") **sem** enfileirar nada.
6. Enfileira email (`emailQueue.create`, template = catálogo, subject = catálogo, data = payload) se "email" em channels. Guarda `emailQueueId`.
7. Cria `CompanyNotification` se "inapp" em channels (usa `opts.inapp`).
8. Atualiza o log: `status: SENT`, `emailQueueId`.
9. **Fail-silent:** qualquer throw inesperado → loga, tenta marcar o log FAILED, retorna `{ status: "FAILED" }` (NUNCA relança).

- [ ] **Step 1: Escrever os testes falhando**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client"; // necessário para o teste de idempotência (P2002)

const prismaMock = {
  saasEmailConfig: { upsert: vi.fn() },
  company: { findUnique: vi.fn() },
  user: { findFirst: vi.fn() },
  saasEmailLog: { create: vi.fn(), update: vi.fn() },
  emailQueue: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const createCompanyNotification = vi.fn();
vi.mock("@/services/company-notification.service", () => ({
  createCompanyNotification: (...a: unknown[]) => createCompanyNotification(...a),
}));

import { notifyCompany } from "./saas-notification.service";

const fullConfig = {
  masterEnabled: true,
  testMode: false,
  testEmail: null,
  welcomeEnabled: true,
  invoiceOverdueEnabled: true,
};

beforeEach(() => {
  Object.values(prismaMock).forEach((m) =>
    Object.values(m).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset())
  );
  createCompanyNotification.mockReset().mockResolvedValue(true);
  prismaMock.saasEmailConfig.upsert.mockResolvedValue(fullConfig);
  prismaMock.company.findUnique.mockResolvedValue({ billingEmail: "bill@x.com", email: null });
  prismaMock.saasEmailLog.create.mockResolvedValue({ id: "log-1" });
  prismaMock.emailQueue.create.mockResolvedValue({ id: "q-1" });
});

describe("notifyCompany", () => {
  it("master desligado → SKIPPED, não enfileira", async () => {
    prismaMock.saasEmailConfig.upsert.mockResolvedValue({ ...fullConfig, masterEnabled: false });
    const r = await notifyCompany("c1", "WELCOME" as never, { name: "J", loginUrl: "https://a" }, { periodKey: "welcome" });
    expect(r.status).toBe("SKIPPED");
    expect(prismaMock.emailQueue.create).not.toHaveBeenCalled();
  });

  it("tipo desligado → SKIPPED", async () => {
    prismaMock.saasEmailConfig.upsert.mockResolvedValue({ ...fullConfig, welcomeEnabled: false });
    const r = await notifyCompany("c1", "WELCOME" as never, {}, { periodKey: "welcome" });
    expect(r.status).toBe("SKIPPED");
    expect(r.reason).toBe("type_off");
  });

  it("resolve billingEmail → email → dono (fallback)", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ billingEmail: null, email: null });
    prismaMock.user.findFirst.mockResolvedValue({ email: "dono@x.com" });
    await notifyCompany("c1", "WELCOME" as never, { name: "J", loginUrl: "https://a" }, { periodKey: "welcome", channels: ["email"] });
    // `data` aqui é o WRAPPER do Prisma create; `data.to` é a COLUNA `to` da EmailQueue
    // (NÃO o payload do template). A chamada real é
    //   prisma.emailQueue.create({ data: { to, subject, template, data: payload } })
    expect(prismaMock.emailQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ to: "dono@x.com", template: "saas-welcome" }) })
    );
  });

  it("sem email nenhum → SKIPPED no_recipient", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ billingEmail: null, email: null });
    prismaMock.user.findFirst.mockResolvedValue(null);
    const r = await notifyCompany("c1", "WELCOME" as never, {}, { periodKey: "welcome" });
    expect(r.reason).toBe("no_recipient");
  });

  it("testMode → manda pro testEmail, não pro cliente", async () => {
    prismaMock.saasEmailConfig.upsert.mockResolvedValue({ ...fullConfig, testMode: true, testEmail: "dono@vis.com" });
    await notifyCompany("c1", "WELCOME" as never, { name: "J", loginUrl: "https://a" }, { periodKey: "welcome", channels: ["email"] });
    expect(prismaMock.emailQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ to: "dono@vis.com" }) })
    );
  });

  it("idempotência: P2002 no log → SKIPPED duplicate, não enfileira", async () => {
    // IMPORTANTE: rejeitar com a CLASSE real de erro do Prisma — a implementação
    // checa `instanceof Prisma.PrismaClientKnownRequestError`; um objeto plano
    // `{ code: "P2002" }` NÃO passaria nesse instanceof e cairia no fail-silent
    // (FAILED), quebrando este teste. Importar `Prisma` no topo do arquivo de teste:
    //   import { Prisma } from "@prisma/client";
    const dupErr = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "test",
    });
    prismaMock.saasEmailLog.create.mockRejectedValue(dupErr);
    const r = await notifyCompany("c1", "INVOICE_OVERDUE" as never, {}, { periodKey: "stage:7", channels: ["email"] });
    expect(r.status).toBe("SKIPPED");
    expect(r.reason).toBe("duplicate");
    expect(prismaMock.emailQueue.create).not.toHaveBeenCalled();
  });

  it("channels ['email'] não cria in-app", async () => {
    await notifyCompany("c1", "INVOICE_OVERDUE" as never, {}, { periodKey: "stage:7", channels: ["email"] });
    expect(createCompanyNotification).not.toHaveBeenCalled();
  });

  it("channels padrão cria email + in-app", async () => {
    await notifyCompany(
      "c1",
      "PAYMENT_CONFIRMED" as never,
      { name: "J", amountLabel: "R$ 1" },
      { periodKey: "pay:1", inapp: { title: "Pago", message: "ok" } }
    );
    expect(prismaMock.emailQueue.create).toHaveBeenCalled();
    expect(createCompanyNotification).toHaveBeenCalled();
  });

  it("fail-silent: erro inesperado não propaga", async () => {
    prismaMock.emailQueue.create.mockRejectedValue(new Error("boom"));
    const r = await notifyCompany("c1", "WELCOME" as never, { name: "J", loginUrl: "https://a" }, { periodKey: "welcome", channels: ["email"] });
    expect(r.status).toBe("FAILED");
  });
});
```

> Nota: o catálogo (`paymentConfirmedEnabled` etc.) precisa estar presente no objeto de config dos mocks que testam tipos específicos; ajustar `fullConfig` se um teste usar um tipo cuja flag não esteja no objeto (a função lê `config[flag] !== false`, então flag ausente = ligada — o teste "tipo desligado" usa `welcomeEnabled:false` explícito).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/services/saas-notification.service.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```typescript
import { Prisma, type SaasEmailType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getSaasEmailConfig } from "@/services/saas-email-config.service";
import { SAAS_EMAIL_CATALOG, isSaasEmailEnabled } from "@/lib/emails/saas-email-catalog";
import { createCompanyNotification } from "@/services/company-notification.service";
import { CompanyNotificationType } from "@prisma/client";

const log = logger.child({ service: "saas-notification" });

export type SaasChannel = "email" | "inapp";

export interface NotifyCompanyOpts {
  periodKey: string;
  channels?: SaasChannel[];
  inapp?: { title: string; message: string; link?: string };
}

export interface NotifyResult {
  status: "SENT" | "SKIPPED" | "FAILED";
  reason?: string;
}

async function resolveRecipient(companyId: string): Promise<string | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { billingEmail: true, email: true },
  });
  if (company?.billingEmail) return company.billingEmail;
  if (company?.email) return company.email;
  const owner = await prisma.user.findFirst({
    where: { companyId, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return owner?.email ?? null;
}

export async function notifyCompany(
  companyId: string,
  eventType: SaasEmailType,
  payload: Record<string, unknown>,
  opts: NotifyCompanyOpts
): Promise<NotifyResult> {
  const channels = opts.channels ?? ["email", "inapp"];
  try {
    const config = await getSaasEmailConfig();

    if (!config.masterEnabled) {
      await safeLog(companyId, eventType, opts.periodKey, "—", "SKIPPED", channels, "master_off");
      return { status: "SKIPPED", reason: "master_off" };
    }
    if (!isSaasEmailEnabled(eventType, config as unknown as Record<string, boolean>)) {
      await safeLog(companyId, eventType, opts.periodKey, "—", "SKIPPED", channels, "type_off");
      return { status: "SKIPPED", reason: "type_off" };
    }

    let to = await resolveRecipient(companyId);
    if (!to) {
      await safeLog(companyId, eventType, opts.periodKey, "—", "SKIPPED", channels, "no_recipient");
      return { status: "SKIPPED", reason: "no_recipient" };
    }
    if (config.testMode) {
      if (!config.testEmail) {
        await safeLog(companyId, eventType, opts.periodKey, "—", "SKIPPED", channels, "test_mode_no_email");
        return { status: "SKIPPED", reason: "test_mode_no_email" };
      }
      to = config.testEmail;
    }

    // Idempotência: criar o log ANTES de enfileirar. Unique colidiu = já enviado.
    let logId: string;
    try {
      const created = await prisma.saasEmailLog.create({
        data: {
          companyId,
          eventType,
          periodKey: opts.periodKey,
          to,
          status: "PENDING",
          channels: channels.join(","),
        },
      });
      logId = created.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { status: "SKIPPED", reason: "duplicate" };
      }
      throw e;
    }

    let emailQueueId: string | null = null;
    if (channels.includes("email")) {
      const entry = SAAS_EMAIL_CATALOG[eventType];
      // `data:` é o WRAPPER do Prisma create. `to`/`subject`/`template` são COLUNAS
      // da EmailQueue; `data: payload` é a COLUNA Json `data` (payload do template,
      // que o cron passa intacto ao renderEmailTemplate). NÃO injetar `to` no
      // payload — os schemas Zod dos templates (Task 5) não têm campo `to`.
      const queued = await prisma.emailQueue.create({
        data: { to, subject: entry.subject, template: entry.template, data: payload },
      });
      emailQueueId = queued.id;
    }

    if (channels.includes("inapp") && opts.inapp) {
      await createCompanyNotification({
        companyId,
        userId: null,
        type: CompanyNotificationType.BILLING,
        title: opts.inapp.title,
        message: opts.inapp.message,
        link: opts.inapp.link,
        metadata: { eventType, periodKey: opts.periodKey },
      });
    }

    await prisma.saasEmailLog.update({
      where: { id: logId },
      data: { status: "SENT", emailQueueId },
    });
    return { status: "SENT" };
  } catch (error) {
    log.error("notifyCompany falhou (fail-silent)", {
      companyId,
      eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "FAILED", reason: "error" };
  }
}

/** Grava um SaasEmailLog de forma best-effort (não relança). */
async function safeLog(
  companyId: string,
  eventType: SaasEmailType,
  periodKey: string,
  to: string,
  status: "SKIPPED",
  channels: SaasChannel[],
  skipReason: string
): Promise<void> {
  try {
    await prisma.saasEmailLog.create({
      data: { companyId, eventType, periodKey, to, status, channels: channels.join(","), skipReason },
    });
  } catch (e) {
    // SKIPPED duplicado (já há log do mesmo período) é inofensivo — ignora.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    log.warn("Falha ao gravar SaasEmailLog SKIPPED", { companyId, eventType, skipReason });
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/services/saas-notification.service.test.ts`
Expected: PASS (todos os 9 casos).

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/services/saas-notification.service.ts src/services/saas-notification.service.test.ts
git commit -m "feat(saas-emails): saas-notification.service (cérebro notifyCompany)"
```

---

## Task 7: Gatilho WELCOME na ativação do invite

**Files:**
- Create: `src/services/saas-welcome.service.ts` (função pequena e testável, evita mockar o `$transaction` da rota)
- Test: `src/services/saas-welcome.service.test.ts`
- Modify: `src/app/api/auth/activate/route.ts`

> **Abordagem (decisão travada):** extrair o disparo do WELCOME para `sendWelcomeEmail(companyId, name)` e testar essa função isolada. A rota só a chama (após o commit). Isso evita um mock pesado do `$transaction` e deixa a task com um RED test concreto.

- [ ] **Step 1: Escrever o teste falhando**

`src/services/saas-welcome.service.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const notifyCompany = vi.fn().mockResolvedValue({ status: "SENT" });
vi.mock("@/services/saas-notification.service", () => ({
  notifyCompany: (...a: unknown[]) => notifyCompany(...a),
}));

import { sendWelcomeEmail } from "./saas-welcome.service";

describe("sendWelcomeEmail", () => {
  beforeEach(() => notifyCompany.mockClear());

  it("chama notifyCompany com WELCOME, periodKey 'welcome' e payload name+loginUrl", async () => {
    await sendWelcomeEmail("c1", "João");
    expect(notifyCompany).toHaveBeenCalledTimes(1);
    const [companyId, eventType, payload, opts] = notifyCompany.mock.calls[0];
    expect(companyId).toBe("c1");
    expect(eventType).toBe("WELCOME");
    expect(payload).toEqual(expect.objectContaining({ name: "João", loginUrl: expect.stringContaining("/login") }));
    expect(opts).toEqual(expect.objectContaining({ periodKey: "welcome", channels: ["email", "inapp"] }));
    expect(opts.inapp).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/services/saas-welcome.service.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar a função extraída**

`src/services/saas-welcome.service.ts`:
```typescript
import { notifyCompany } from "@/services/saas-notification.service";

/** Dispara o email/in-app de boas-vindas. Fail-silent (notifyCompany nunca relança). */
export async function sendWelcomeEmail(companyId: string, name: string): Promise<void> {
  const loginUrl = `${process.env.NEXTAUTH_URL ?? "https://app.vis.app.br"}/login`;
  await notifyCompany(
    companyId,
    "WELCOME",
    { name, loginUrl },
    {
      periodKey: "welcome",
      channels: ["email", "inapp"],
      inapp: { title: "Bem-vindo ao Vis", message: "Sua conta está ativa. Explore o sistema.", link: "/dashboard" },
    }
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/services/saas-welcome.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Chamar da rota de ativação**

No `activate/route.ts`, **depois** do `await prisma.$transaction(...)` (fora da transação, com o `result` em mãos), antes do `return NextResponse.json(...)`:
```typescript
import { sendWelcomeEmail } from "@/services/saas-welcome.service";
// ...
await sendWelcomeEmail(invite.companyId, invite.name);
```
(Fail-silent — não envolver em try/catch extra.)

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/services/saas-welcome.service.ts src/services/saas-welcome.service.test.ts src/app/api/auth/activate/route.ts
git commit -m "feat(saas-emails): WELCOME no fim da ativação do invite"
```

---

## Task 8: Gatilho PAYMENT_CONFIRMED no webhook Asaas

**Files:**
- Modify: `src/app/api/webhooks/asaas/route.ts`

- [ ] **Step 1: Teste falhando**

Estender o teste do webhook (ou criar `route.test.ts`). Mock `notifyCompany`. Enviar evento `PAYMENT_CONFIRMED` com `subscription` resolvendo `companyId`; assegurar `notifyCompany(companyId, "PAYMENT_CONFIRMED", {name, amountLabel}, { periodKey: "pay:<paymentId>", inapp: {...} })`. Garantir que **não** dispara em `PAYMENT_OVERDUE` (esse fica no dunning).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/webhooks/asaas/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

No `case "PAYMENT_CONFIRMED": case "PAYMENT_RECEIVED":`, depois de atualizar Subscription/Invoice e `trackServer`, **se `companyId`**:

```typescript
import { notifyCompany } from "@/services/saas-notification.service";
// dentro do case, com companyId resolvido:
const amountLabel = event.payment?.value != null
  ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(event.payment.value)
  : "";
// nome do destinatário: usar o nome da empresa (buscar minimal) ou genérico
const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
await notifyCompany(
  companyId,
  "PAYMENT_CONFIRMED",
  { name: company?.name ?? "Cliente", amountLabel },
  {
    periodKey: `pay:${event.payment?.id ?? event.id}`,
    channels: ["email", "inapp"],
    inapp: { title: "Pagamento confirmado", message: `Recebemos seu pagamento${amountLabel ? ` de ${amountLabel}` : ""}. Obrigado!`, link: "/dashboard/configuracoes" },
  }
);
```

(Colocar **antes** do `break`, dentro do `try` do switch — `notifyCompany` é fail-silent, não compromete o webhook.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/app/api/webhooks/asaas/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/app/api/webhooks/asaas/route.ts src/app/api/webhooks/asaas/route.test.ts
git commit -m "feat(saas-emails): PAYMENT_CONFIRMED no webhook Asaas"
```

---

## Task 9: Gatilhos no cron dunning (INVOICE_OVERDUE, SUSPENDED, CANCELED) — só email

**Files:**
- Modify: `src/app/api/cron/dunning/route.ts`

**⚠️ Crítico:** o dunning JÁ cria `CompanyNotification` e JÁ é idempotente via `lastDunningStage`. Pendurar `notifyCompany` com `channels: ["email"]` (sem in-app, sem duplicar). `periodKey` = o MESMO `stage`/marco do dunning. Colocar cada chamada **dentro** do bloco idempotente correspondente, **após** o `createCompanyNotification` existente.

- [ ] **Step 1: Teste falhando**

Estender o teste do cron dunning (mock `notifyCompany`). Cenários:
- Marco 7 atingido (e notificado) → `notifyCompany(companyId, "INVOICE_OVERDUE", {name, daysOverdue}, { periodKey: "stage:7", channels: ["email"] })`.
- Suspensão (14d) → `notifyCompany(.., "SUBSCRIPTION_SUSPENDED", .., { periodKey: "suspended", channels: ["email"] })`.
- Cancelamento (30d) → `notifyCompany(.., "SUBSCRIPTION_CANCELED", .., { periodKey: "canceled", channels: ["email"] })`.
- Nenhuma chamada cria in-app (assegurar `channels: ["email"]`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/cron/dunning/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Importar `notifyCompany`. Definir UMA vez, no topo do handler `GET` (logo após `const now = new Date();`), a base de URL usada nos 3 blocos — os snippets abaixo referenciam `base`:
```typescript
const base = process.env.NEXTAUTH_URL ?? "https://app.vis.app.br";
```

Nos 3 pontos (dentro do `try`):

No bloco do marco (depois de `if (ok) { ...update lastDunningStage... }`):
```typescript
await notifyCompany(
  sub.companyId,
  "INVOICE_OVERDUE",
  { name: "Cliente", daysOverdue, payUrl: `${base}/dashboard/configuracoes` },
  { periodKey: `stage:${stage}`, channels: ["email"] }
);
```
> Para o `name`, buscar `company.name` uma vez por sub (ou usar genérico "Cliente"). Preferir buscar o nome (uma query a mais por inadimplente; volume baixo).
>
> **periodKey de SUSPENDED/CANCELED — decisão consciente:** os marcos overdue usam `periodKey: "stage:${stage}"` (um por marco). Suspensão/cancelamento usam `"suspended"`/`"canceled"` FIXOS → idempotência "uma vez por empresa, para sempre" (dado o unique `(companyId, eventType, periodKey)`). Isso é **intencional** na Fase 1: cada empresa recebe no máximo 1 email de suspensão e 1 de cancelamento, espelhando que o dunning suspende/cancela uma vez por ciclo de inadimplência. **Limitação aceita:** se uma empresa recupera, volta a ficar inadimplente e é suspensa de novo, NÃO recebe um 2º email de suspensão. Reavaliar na Fase 2 (amarrar o periodKey ao `invoiceId`/ciclo) se o reenvio passar a ser desejado. NÃO mudar agora.

No bloco de suspensão (depois do `createAdminNotification` de suspensão):
```typescript
await notifyCompany(sub.companyId, "SUBSCRIPTION_SUSPENDED",
  { name: "Cliente", payUrl: `${base}/dashboard/configuracoes` },
  { periodKey: "suspended", channels: ["email"] });
```

No bloco de cancelamento (depois do `createCompanyNotification` de cancelamento existente):
```typescript
await notifyCompany(sub.companyId, "SUBSCRIPTION_CANCELED",
  { name: "Cliente", reactivateUrl: `${base}/dashboard/upgrade` },
  { periodKey: "canceled", channels: ["email"] });
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/app/api/cron/dunning/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/app/api/cron/dunning/route.ts src/app/api/cron/dunning/route.test.ts
git commit -m "feat(saas-emails): dunning dispara emails (overdue/suspended/canceled, só email)"
```

---

## Task 10: Cron novo `subscription-watch` (trial) + service puro

`checkSubscription` é lazy. Cron diário varre `Subscription` TRIAL: `trialEndsAt` em ~3 dias → `TRIAL_ENDING`; `trialEndsAt` passou → persiste `status=TRIAL_EXPIRED` + email `TRIAL_EXPIRED`. Idempotência via `SaasEmailLog`.

**Files:**
- Create: `src/services/subscription-watch.service.ts` (lógica pura: decide a ação por sub)
- Test: `src/services/subscription-watch.service.test.ts`
- Create: `src/app/api/cron/subscription-watch/route.ts`
- Test: `src/app/api/cron/subscription-watch/route.test.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Teste da lógica pura falhando**

```typescript
import { describe, it, expect } from "vitest";
import { trialAction } from "./subscription-watch.service";

const day = 24 * 60 * 60 * 1000;
const now = new Date("2026-06-10T12:00:00Z");

describe("trialAction", () => {
  it("trialEndsAt em 3 dias → TRIAL_ENDING", () => {
    expect(trialAction(new Date(now.getTime() + 3 * day), now)).toBe("TRIAL_ENDING");
  });
  it("trialEndsAt em 2 dias → TRIAL_ENDING (<=3)", () => {
    expect(trialAction(new Date(now.getTime() + 2 * day), now)).toBe("TRIAL_ENDING");
  });
  it("trialEndsAt em 10 dias → nenhuma", () => {
    expect(trialAction(new Date(now.getTime() + 10 * day), now)).toBeNull();
  });
  it("trialEndsAt no passado → TRIAL_EXPIRED", () => {
    expect(trialAction(new Date(now.getTime() - 1 * day), now)).toBe("TRIAL_EXPIRED");
  });
  it("trialEndsAt null → nenhuma", () => {
    expect(trialAction(null, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/services/subscription-watch.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar a lógica pura**

```typescript
const DAY = 24 * 60 * 60 * 1000;
export const TRIAL_ENDING_DAYS = 3;

export type TrialAction = "TRIAL_ENDING" | "TRIAL_EXPIRED" | null;

/** Decide a ação de email para uma subscription TRIAL, dado trialEndsAt e now. */
export function trialAction(trialEndsAt: Date | null, now: Date): TrialAction {
  if (!trialEndsAt) return null;
  const ms = trialEndsAt.getTime() - now.getTime();
  if (ms < 0) return "TRIAL_EXPIRED";
  if (ms <= TRIAL_ENDING_DAYS * DAY) return "TRIAL_ENDING";
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/services/subscription-watch.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar a rota do cron (fail-closed CRON_SECRET, espelha email-queue/route.ts)**

`src/app/api/cron/subscription-watch/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { trialAction } from "@/services/subscription-watch.service";
import { notifyCompany } from "@/services/saas-notification.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const log = logger.child({ route: "cron/subscription-watch" });

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const base = process.env.NEXTAUTH_URL ?? "https://app.vis.app.br";
  const trials = await prisma.subscription.findMany({
    where: { status: "TRIAL", trialEndsAt: { not: null } },
    select: { id: true, companyId: true, trialEndsAt: true, company: { select: { name: true } } },
  });

  const summary = { total: trials.length, ending: 0, expired: 0 };
  for (const sub of trials) {
    const action = trialAction(sub.trialEndsAt, now);
    if (!action) continue;
    const name = sub.company?.name ?? "Cliente";
    try {
      if (action === "TRIAL_ENDING") {
        const daysLeft = Math.max(0, Math.ceil((sub.trialEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
        await notifyCompany(sub.companyId, "TRIAL_ENDING",
          { name, daysLeft, subscribeUrl: `${base}/dashboard/upgrade` },
          { periodKey: "trial-ending", channels: ["email", "inapp"], inapp: { title: "Seu teste está acabando", message: `Faltam ${daysLeft} dia(s) do seu período de teste.`, link: "/dashboard/upgrade" } });
        summary.ending++;
      } else {
        // ORDEM IMPORTA: notificar ANTES de virar o status. Se virássemos o status
        // primeiro e o email fosse SKIPPED naquele instante (ex.: master_off), na
        // próxima run a sub já não é TRIAL e o TRIAL_EXPIRED nunca seria reenviado —
        // email perdido pra sempre. Como notifyCompany é idempotente via SaasEmailLog
        // (periodKey "trial-expired"), chamá-lo antes não duplica entre runs.
        await notifyCompany(sub.companyId, "TRIAL_EXPIRED",
          { name, subscribeUrl: `${base}/dashboard/upgrade` },
          { periodKey: "trial-expired", channels: ["email", "inapp"], inapp: { title: "Seu teste terminou", message: "Assine para continuar usando o Vis.", link: "/dashboard/upgrade" } });
        // persiste a transição de status (idempotente: só TRIAL → TRIAL_EXPIRED)
        await prisma.subscription.updateMany({ where: { id: sub.id, status: "TRIAL" }, data: { status: "TRIAL_EXPIRED" } });
        summary.expired++;
      }
    } catch (err) {
      log.error("Erro no subscription-watch", { subId: sub.id, err: String(err) });
    }
  }
  return NextResponse.json({ ok: true, ...summary, runAt: now.toISOString() });
}
```

- [ ] **Step 6: Teste da rota (401 sem secret; varre TRIAL)**

`route.test.ts`: 401 sem `Authorization`; com secret, mock prisma retornando 1 sub TRIAL com `trialEndsAt` no passado → chama `notifyCompany` com `TRIAL_EXPIRED` e faz `updateMany` para `TRIAL_EXPIRED`.

Run: `npx vitest run src/app/api/cron/subscription-watch/route.test.ts`
Expected: PASS.

- [ ] **Step 7: Registrar o cron no `vercel.json`**

Adicionar (horário livre, ex.: 9h):
```json
{ "path": "/api/cron/subscription-watch", "schedule": "0 9 * * *" }
```

- [ ] **Step 8: Typecheck + build + commit**

```bash
npx tsc --noEmit && npm run build
git add src/services/subscription-watch.service.ts src/services/subscription-watch.service.test.ts src/app/api/cron/subscription-watch vercel.json
git commit -m "feat(saas-emails): cron subscription-watch (trial ending/expired)"
```

---

## Task 11: API de config + preview da tela admin

**Files:**
- Create: `src/app/api/admin/saas-emails/config/route.ts` (GET + PATCH, SUPER_ADMIN)
- Test: `src/app/api/admin/saas-emails/config/route.test.ts`
- Create: `src/app/api/admin/saas-emails/preview/route.ts` (GET ?type=, SUPER_ADMIN — renderiza HTML com dados de exemplo)

- [ ] **Step 1: Teste falhando (auth + patch)**

Espelhar `src/app/api/admin/auto-sync/config/route.test.ts`. Casos:
- PATCH sem sessão → 401.
- PATCH com ADMIN (não SUPER_ADMIN) → 403.
- PATCH SUPER_ADMIN com `{ testMode: false }` → 200 + `updateSaasEmailConfig` chamado + audit `SAAS_EMAILS_CONFIG_CHANGED`.
- GET SUPER_ADMIN → 200 com a config.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/admin/saas-emails/config/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `config/route.ts`** (espelha auto-sync, com bodySchema cobrindo todas as flags + testMode/testEmail/masterEnabled; audit best-effort)

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
import { getSaasEmailConfig, updateSaasEmailConfig } from "@/services/saas-email-config.service";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/saas-emails/config" });

const bodySchema = z.object({
  masterEnabled: z.boolean().optional(),
  testMode: z.boolean().optional(),
  testEmail: z.string().email().nullable().optional(),
  welcomeEnabled: z.boolean().optional(),
  trialEndingEnabled: z.boolean().optional(),
  trialExpiredEnabled: z.boolean().optional(),
  invoiceOverdueEnabled: z.boolean().optional(),
  paymentConfirmedEnabled: z.boolean().optional(),
  subscriptionSuspendedEnabled: z.boolean().optional(),
  subscriptionCanceledEnabled: z.boolean().optional(),
}).refine((b) => Object.keys(b).length > 0, { message: "Nada para atualizar" });

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const config = await getSaasEmailConfig();
  return NextResponse.json({ success: true, data: config });
}

export async function PATCH(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    const config = await updateSaasEmailConfig(parsed.data, admin.id);
    try {
      await prisma.globalAudit.create({
        data: { actorType: "ADMIN_USER", actorId: admin.id, action: "SAAS_EMAILS_CONFIG_CHANGED", metadata: { ...parsed.data, adminEmail: admin.email } },
      });
    } catch (auditError) {
      log.error("Falha ao auditar SAAS_EMAILS_CONFIG_CHANGED (config foi alterada)", { error: String(auditError) });
    }
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    log.error("Erro ao alterar config de emails do SaaS", { error: String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implementar `preview/route.ts`** (GET ?type=WELCOME → renderiza o template com dados de exemplo)

```typescript
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { renderEmailTemplate } from "@/lib/emails/templates";
import { SAAS_EMAIL_CATALOG } from "@/lib/emails/saas-email-catalog";
import type { SaasEmailType } from "@prisma/client";

const SAMPLE: Record<SaasEmailType, Record<string, unknown>> = {
  WELCOME: { name: "João Silva", loginUrl: "https://app.vis.app.br/login" },
  TRIAL_ENDING: { name: "João Silva", daysLeft: 3, subscribeUrl: "https://app.vis.app.br/dashboard/upgrade" },
  TRIAL_EXPIRED: { name: "João Silva", subscribeUrl: "https://app.vis.app.br/dashboard/upgrade" },
  INVOICE_OVERDUE: { name: "João Silva", daysOverdue: 7, payUrl: "https://app.vis.app.br/dashboard/configuracoes" },
  PAYMENT_CONFIRMED: { name: "João Silva", amountLabel: "R$ 149,90" },
  SUBSCRIPTION_SUSPENDED: { name: "João Silva", payUrl: "https://app.vis.app.br/dashboard/configuracoes" },
  SUBSCRIPTION_CANCELED: { name: "João Silva", reactivateUrl: "https://app.vis.app.br/dashboard/upgrade" },
};

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const type = new URL(request.url).searchParams.get("type") as SaasEmailType | null;
  if (!type || !(type in SAAS_EMAIL_CATALOG)) return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });

  const { html } = renderEmailTemplate(SAAS_EMAIL_CATALOG[type].template, SAMPLE[type]);
  return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}
```

- [ ] **Step 5: Rodar testes e ver passar**

Run: `npx vitest run src/app/api/admin/saas-emails/config/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/api/admin/saas-emails
git commit -m "feat(saas-emails): API admin config + preview (SUPER_ADMIN)"
```

---

## Task 12: Tela `/admin/configuracoes/emails` (page + client) + item no menu

Espelha `src/app/admin/configuracoes/sincronizacao/{page,sincronizacao-client}.tsx`.

**Files:**
- Create: `src/app/admin/configuracoes/emails/page.tsx`
- Create: `src/app/admin/configuracoes/emails/emails-client.tsx`
- Modify: o componente de navegação admin (localizar via grep abaixo)

- [ ] **Step 1: Implementar a server page**

```typescript
import { requireAdminRole } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { getSaasEmailConfig } from "@/services/saas-email-config.service";
import { EmailsClient } from "./emails-client";

export default async function EmailsConfigPage() {
  await requireAdminRole(["SUPER_ADMIN"]);
  const config = await getSaasEmailConfig();
  const logs = await prisma.saasEmailLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { company: { select: { name: true } } },
  });
  return (
    <EmailsClient
      config={{
        masterEnabled: config.masterEnabled,
        testMode: config.testMode,
        testEmail: config.testEmail,
        welcomeEnabled: config.welcomeEnabled,
        trialEndingEnabled: config.trialEndingEnabled,
        trialExpiredEnabled: config.trialExpiredEnabled,
        invoiceOverdueEnabled: config.invoiceOverdueEnabled,
        paymentConfirmedEnabled: config.paymentConfirmedEnabled,
        subscriptionSuspendedEnabled: config.subscriptionSuspendedEnabled,
        subscriptionCanceledEnabled: config.subscriptionCanceledEnabled,
      }}
      logs={logs.map((l) => ({
        id: l.id,
        companyName: l.company?.name ?? l.companyId,
        eventType: l.eventType,
        status: l.status,
        to: l.to,
        createdAt: l.createdAt.toISOString(),
      }))}
    />
  );
}
```

- [ ] **Step 2: Implementar o client** (`"use client"`)

Requisitos (espelhar o estilo de `sincronizacao-client.tsx`):
- Interruptor mestre (`masterEnabled`).
- Toggle "Modo teste" + campo de email (`testMode` / `testEmail`). **Banner de aviso quando testMode ligado:** "Modo teste ligado — emails vão só para X, não para os clientes."
- Checkbox por tipo (7), usando os rótulos amigáveis (Boas-vindas, Trial acabando, etc.).
- Botão "Pré-visualizar" por tipo → abre `window.open('/api/admin/saas-emails/preview?type=<TYPE>')`.
- Salvar via `PATCH /api/admin/saas-emails/config` (toast de sucesso/erro; sem falha silenciosa).
- Tabela de histórico (últimos 50): empresa, tipo, status (badge colorido por status), destinatário, data.

> Usar os componentes Shadcn já presentes no projeto (Switch, Card, Button, Table, Badge, Input, useToast). Conferir imports reais em `sincronizacao-client.tsx`.

- [ ] **Step 3: Adicionar item no menu admin**

Localizar a navegação admin:
Run: `grep -rln "configuracoes/sincronizacao\|Sincronização" src/app/admin src/components 2>/dev/null`
Adicionar entrada "Emails" apontando para `/admin/configuracoes/emails` na seção Configurações (só visível p/ SUPER_ADMIN, espelhando como o item de sincronização é exibido).

- [ ] **Step 4: Build (valida a page/client)**

Run: `npx tsc --noEmit && npm run build`
Expected: build verde, rota `/admin/configuracoes/emails` gerada.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/configuracoes/emails
git add -A  # inclui o arquivo de menu modificado
git commit -m "feat(saas-emails): tela admin de configuração de emails"
```

---

## Task 13: Suíte completa + build final + verificação manual

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: todos verdes (incluindo os pré-existentes — nenhuma regressão).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: ambos verdes.

- [ ] **Step 3: Smoke local da tela admin**

Subir `npm run dev`, logar como SUPER_ADMIN, abrir `/admin/configuracoes/emails`:
- Confirmar que `testMode` vem **LIGADO** por padrão (entrega segura).
- Pré-visualizar cada um dos 7 templates (abre HTML renderizado).
- Salvar uma mudança (ex.: setar testEmail) → toast de sucesso.

- [ ] **Step 4: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore(saas-emails): suíte verde + smoke da tela (Fase 1 completa)"
```

---

## Deploy (executar com o dono / fora do escopo de execução automatizada)

> **NÃO deployar automaticamente.** Registrar aqui o runbook; o dono dispara.

1. **Branch:** trabalho na `feat/saas-emails`. Considerar worktree se houver sessão paralela no mesmo clone.
2. **Email do commit:** garantir `cheapmilhas@users.noreply.github.com` nos commits (senão a Vercel bloqueia o deploy). Conferir `git log --format='%ae' -1`.
3. **Deploy:** MANUAL via `vercel deploy --prod` (CLI) — push NÃO deploya. O deploy envia o working tree.
4. **Migrations:** `build` NÃO roda migrate. Pós-deploy, rodar `npm run migrate:deploy` (ou `npx prisma migrate deploy`) apontando para o banco de prod — cria `SaasEmailConfig` + `SaasEmailLog` (aditivo, seguro). Neon scale-to-zero pode exigir retry.
5. **Config inicial:** confirmar no `/admin/configuracoes/emails` que `testMode` está LIGADO e setar `testEmail` para o email do dono. Os 7 tipos ligados por padrão, mas tudo vai só pro testEmail até o dono desligar o modo teste.
6. **Crons:** o `vercel.json` passa de 7 → 8 crons (projeto é Pro — confirmar no dashboard). Conferir que `subscription-watch` aparece no painel de Crons e que `CRON_SECRET` está setado.
7. **Smoke prod:** `GET /api/cron/subscription-watch` sem auth → 401 (fail-closed). Com o dono, validar um WELCOME real (ativar um invite de teste) chegando no testEmail.

---

## Fora de escopo (Fase 2 — NÃO fazer agora)

- `INVOICE_CREATED` / `INVOICE_DUE_SOON` + geração do boleto/PIX Asaas + cron `invoice-reminders`.
- WhatsApp do SaaS, emails de marketing/dica com opt-out, preferências de canal por cliente.
