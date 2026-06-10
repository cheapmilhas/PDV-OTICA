# Fase B — Automação "Correções Chegam a Todos" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cron diário que re-aplica os defaults de setup (financeiro + mensagens) a TODAS as empresas, sem nunca sobrescrever personalização, controlado pelo dono via tela no /admin (liga/desliga + modo simulação + relatório).

**Architecture:** Um service central (`company-resync.service.ts`) sincroniza UMA empresa (extraído do endpoint manual de resync + estendido com mensagens e dry-run). Um orquestrador (`syncAllCompanies`) itera todas as empresas com isolamento por empresa (padrão de `recalcAllActiveHealthScores`). Config singleton no banco (`AutoSyncConfig`) lida pelo cron e editada pela tela admin via PATCH. Relatórios via `GlobalAudit` (action `COMPANY_AUTO_SYNCED`) + resumo da última execução em `lastRunSummary`.

**Tech Stack:** Next.js 16 (App Router), Prisma/Postgres (Neon), Vitest, admin auth via `requireAdminRole` (cookie jose), cron Vercel com `CRON_SECRET`.

**Spec:** `docs/superpowers/specs/2026-06-09-bugs-vis-blindagem-automacao-catalogos-design.md` (Fase B, incl. B2.1).

**Branch:** criar `feat/auto-sync-fase-b` a partir da `main` (main está limpa, deployada).

---

## ⚠️ Convenções e armadilhas (LER ANTES DE COMEÇAR)

1. **Binários locais:** o proxy `rtk` falha com `npx`. Use SEMPRE:
   - `./node_modules/.bin/vitest run <path>` · `./node_modules/.bin/tsc --noEmit` · `./node_modules/.bin/prisma validate|generate`
2. **NÃO tocar o banco:** o `.env` aponta para o banco de PRODUÇÃO (Neon). NUNCA rode `prisma migrate dev/deploy` nem `db push`. Só crie os arquivos de migration; a aplicação é manual no deploy.
3. **Migration sem drift:** após editar o schema, gere o SQL canônico e confira que a migration bate:
   `./node_modules/.bin/prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script | grep -A12 'AutoSyncConfig'`
4. **Conta Vercel é HOBBY:** crons só DIÁRIOS (`0 X * * *`). O novo cron usa `0 4 * * *` (horários 3/5/6/7/8/11h ocupados). Deploy é MANUAL (`vercel deploy --prod`) — fora do escopo deste plano.
5. **Pre-commit hook** roda tsc + testes relacionados. Commits pequenos, só os arquivos da task.
6. **Testes:** `import { describe, it, expect, vi, beforeEach } from "vitest";` + mock de `@/lib/prisma` via `vi.mock` (padrão em `src/services/email-queue.service.test.ts`).

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `prisma/schema.prisma` | model `AutoSyncConfig` (singleton) | Modificar |
| `prisma/migrations/20260609210000_auto_sync_config/migration.sql` | cria a tabela | Criar |
| `src/services/auto-sync-config.service.ts` | get/update do singleton | Criar |
| `src/services/auto-sync-config.service.test.ts` | testes do helper | Criar |
| `src/lib/default-messages-history.ts` | B2.1: defaults conhecidos + classificação | Criar |
| `src/lib/default-messages-history.test.ts` | testes da regra pura | Criar |
| `src/services/finance-setup.service.ts` | exportar os seeds (se não exportados) | Modificar |
| `src/services/company-resync.service.ts` | cérebro: resync de 1 empresa + orquestrador | Criar |
| `src/services/company-resync.service.test.ts` | testes do cérebro | Criar |
| `src/app/api/admin/companies/[id]/resync/route.ts` | passa a usar o service | Modificar |
| `src/app/api/admin/companies/[id]/resync/route.test.ts` | mocks atualizados | Modificar |
| `src/app/api/cron/sync-all-companies/route.ts` | cron GET (CRON_SECRET) | Criar |
| `src/app/api/cron/sync-all-companies/route.test.ts` | testes do cron | Criar |
| `src/app/api/admin/auto-sync/config/route.ts` | PATCH (SUPER_ADMIN) | Criar |
| `src/app/api/admin/auto-sync/config/route.test.ts` | testes de autorização | Criar |
| `src/app/admin/configuracoes/sincronizacao/page.tsx` | tela (server) | Criar |
| `src/app/admin/configuracoes/sincronizacao/sincronizacao-client.tsx` | tela (client) | Criar |
| `src/app/admin/admin-nav.tsx` | item de menu | Modificar |
| `vercel.json` | + cron `0 4 * * *` | Modificar |

---

## Task 0: Branch

- [ ] **Step 1:** `git checkout main && git pull origin main && git checkout -b feat/auto-sync-fase-b`

---

## Task 1: Model `AutoSyncConfig` + migration + service do singleton

**Files:**
- Modify: `prisma/schema.prisma` (adicionar model no fim, perto de `PlanInterest`)
- Create: `prisma/migrations/20260609210000_auto_sync_config/migration.sql`
- Create: `src/services/auto-sync-config.service.ts`
- Create: `src/services/auto-sync-config.service.test.ts`

> Prisma NÃO aceita literal estático em `@default()` de `@id` — o singleton é garantido por upsert com id fixo `"singleton"` no helper (decisão da spec, ISSUE 1). Convenção: models globais (sem companyId) não usam `@@map` (precedente: `PlanInterest`).

- [ ] **Step 1: Teste do helper (falhando)** — `src/services/auto-sync-config.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { autoSyncConfig: { upsert: (...a: unknown[]) => upsert(...a) } },
}));

import { getAutoSyncConfig, updateAutoSyncConfig } from "./auto-sync-config.service";

describe("auto-sync-config.service", () => {
  beforeEach(() =>
    upsert.mockReset().mockResolvedValue({ id: "singleton", isEnabled: false, dryRun: true })
  );

  it("getAutoSyncConfig garante o singleton via upsert (create defaults, update vazio)", async () => {
    const cfg = await getAutoSyncConfig();
    expect(cfg.isEnabled).toBe(false);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "singleton" });
    expect(arg.create).toEqual({ id: "singleton" });
    expect(arg.update).toEqual({});
  });

  it("updateAutoSyncConfig aplica patch + updatedBy no mesmo singleton", async () => {
    await updateAutoSyncConfig({ isEnabled: true }, "admin-1");
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "singleton" });
    expect(arg.update).toEqual({ isEnabled: true, updatedBy: "admin-1" });
    expect(arg.create).toMatchObject({ id: "singleton", isEnabled: true, updatedBy: "admin-1" });
  });
});
```

- [ ] **Step 2:** Rodar `./node_modules/.bin/vitest run src/services/auto-sync-config.service.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Schema.** Em `prisma/schema.prisma`, adicionar (perto do model `PlanInterest`, fim do arquivo):

```prisma
// Config global da sincronização automática de setup (Fase B). Registro ÚNICO
// (id fixo "singleton" garantido por upsert no service — Prisma não aceita
// literal em @default de @id). Entregue DESLIGADO e em modo SIMULAÇÃO.
model AutoSyncConfig {
  id             String    @id
  isEnabled      Boolean   @default(false)
  dryRun         Boolean   @default(true)
  lastRunAt      DateTime?
  lastRunSummary Json?
  updatedBy      String?
  updatedAt      DateTime  @updatedAt
}
```

- [ ] **Step 4: Migration.** Criar `prisma/migrations/20260609210000_auto_sync_config/migration.sql`:

```sql
-- Fase B (automação de setup): config global singleton da sincronização.
-- Registro único id="singleton" criado via upsert no service na 1ª leitura.
-- Entregue DESLIGADO (isEnabled=false) e em SIMULAÇÃO (dryRun=true).
CREATE TABLE "AutoSyncConfig" (
  "id" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMP(3),
  "lastRunSummary" JSONB,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutoSyncConfig_pkey" PRIMARY KEY ("id")
);
```

- [ ] **Step 5: Validar schema/migration SEM tocar o banco:**
  - `./node_modules/.bin/prisma validate` → "schema is valid".
  - `./node_modules/.bin/prisma generate` → 0 erros.
  - Anti-drift: `./node_modules/.bin/prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script | grep -A12 '"AutoSyncConfig"'` e conferir que colunas/tipos batem com a migration (JSONB pode aparecer como JSONB; `@updatedAt` é client-side, sem default no SQL — correto).

- [ ] **Step 6: Service.** Criar `src/services/auto-sync-config.service.ts`:

```typescript
import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "singleton";

export interface AutoSyncPatch {
  isEnabled?: boolean;
  dryRun?: boolean;
}

/** Lê (e garante) o registro único de configuração da sincronização automática. */
export async function getAutoSyncConfig() {
  return prisma.autoSyncConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
}

/** Atualiza o singleton (liga/desliga, modo) registrando quem mudou. */
export async function updateAutoSyncConfig(patch: AutoSyncPatch, updatedBy?: string) {
  return prisma.autoSyncConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...patch, updatedBy },
    update: { ...patch, updatedBy },
  });
}
```

- [ ] **Step 7:** Rodar o teste → PASS. `./node_modules/.bin/tsc --noEmit` → 0 erros.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260609210000_auto_sync_config/ src/services/auto-sync-config.service.ts src/services/auto-sync-config.service.test.ts
git commit -m "feat(auto-sync): model AutoSyncConfig singleton + service (entregue OFF + dry-run)"
```

---

## Task 2: B2.1 — `default-messages-history.ts` (default intacto vs personalização)

**Files:**
- Create: `src/lib/default-messages-history.ts`
- Create: `src/lib/default-messages-history.test.ts`

**Contexto:** "Preencher só NULL" não cumpre o item 8 — empresas com o default ANTIGO gravado nunca receberiam melhoria. Regra (spec B2.1): NULL → preenche; valor == default conhecido (atual OU histórico) → "default intacto" (pode atualizar); valor ≠ qualquer default conhecido → personalização (NÃO toca). Comparação com `trim()`.

- [ ] **Step 1: Teste (falhando)** — `src/lib/default-messages-history.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { DEFAULT_MESSAGES } from "./default-messages";
import { classifyMessageValue } from "./default-messages-history";

describe("classifyMessageValue (B2.1)", () => {
  it("NULL/vazio → missing (vai preencher)", () => {
    expect(classifyMessageValue("thankYou", null)).toBe("missing");
    expect(classifyMessageValue("thankYou", "")).toBe("missing");
    expect(classifyMessageValue("thankYou", "   ")).toBe("missing");
  });

  it("igual ao default ATUAL → current-default (nada a fazer)", () => {
    expect(classifyMessageValue("quote", DEFAULT_MESSAGES.quote)).toBe("current-default");
    // tolera whitespace nas pontas
    expect(classifyMessageValue("quote", `  ${DEFAULT_MESSAGES.quote}  `)).toBe("current-default");
  });

  it("igual a um default HISTÓRICO → stale-default (vai atualizar)", () => {
    const history = { thankYou: ["Texto antigo v1"], quote: [], reminder: [], birthday: [] };
    expect(classifyMessageValue("thankYou", "Texto antigo v1", history)).toBe("stale-default");
  });

  it("texto próprio do cliente → custom (NUNCA toca)", () => {
    expect(classifyMessageValue("birthday", "Parabéns do jeito da minha ótica!")).toBe("custom");
  });
});
```

- [ ] **Step 2:** Rodar → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** `src/lib/default-messages-history.ts`:

```typescript
import { DEFAULT_MESSAGES } from "./default-messages";

export type MessageKey = keyof typeof DEFAULT_MESSAGES;

/**
 * Histórico de TODOS os textos default já distribuídos pelo sistema.
 *
 * REGRA DE MANUTENÇÃO (importante): ao MUDAR um texto em DEFAULT_MESSAGES,
 * adicione o texto ANTIGO ao array do campo correspondente aqui. É assim que o
 * sincronizador automático distingue "default antigo intacto" (atualiza para o
 * novo) de "texto personalizado pela ótica" (nunca toca).
 */
export const HISTORICAL_DEFAULTS: Record<MessageKey, string[]> = {
  thankYou: [],
  quote: [],
  reminder: [],
  birthday: [],
};

export type MessageClass = "missing" | "current-default" | "stale-default" | "custom";

/** Coluna do CompanySettings correspondente a cada chave de mensagem. */
export const MESSAGE_FIELD_BY_KEY = {
  thankYou: "messageThankYou",
  quote: "messageQuote",
  reminder: "messageReminder",
  birthday: "messageBirthday",
} as const;

export function classifyMessageValue(
  key: MessageKey,
  value: string | null | undefined,
  history: Record<MessageKey, string[]> = HISTORICAL_DEFAULTS
): MessageClass {
  if (value == null || value.trim() === "") return "missing";
  const v = value.trim();
  if (v === DEFAULT_MESSAGES[key].trim()) return "current-default";
  if (history[key].some((old) => old.trim() === v)) return "stale-default";
  return "custom";
}
```

- [ ] **Step 4:** Rodar → PASS. tsc → 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/default-messages-history.ts src/lib/default-messages-history.test.ts
git commit -m "feat(auto-sync): classificação default-intacto vs personalização (B2.1)"
```

---

## Task 3: `company-resync.service.ts` — o cérebro (1 empresa) + refactor do endpoint manual

**Files:**
- Modify: `src/services/finance-setup.service.ts` (exportar seeds, se necessário)
- Create: `src/services/company-resync.service.ts`
- Create: `src/services/company-resync.service.test.ts`
- Modify: `src/app/api/admin/companies/[id]/resync/route.ts`
- Modify: `src/app/api/admin/companies/[id]/resync/route.test.ts`

**Contexto:** A lógica de resync hoje vive dentro do endpoint manual. Extrair para um service que: (a) sincroniza financeiro (real: `setupCompanyFinance` em transação; dry-run: diff contra os seeds sem escrever); (b) sincroniza mensagens pela regra B2.1; (c) grava `GlobalAudit` quando algo mudou (action `COMPANY_RESYNCED` se ADMIN_USER, `COMPANY_AUTO_SYNCED` se SYSTEM, metadata inclui `dryRun`).

**Fatos confirmados:**
- `setupCompanyFinance(tx, companyId, branchId?)` — upserts por `{companyId, code}` (chart) e `{companyId, name}` (contas); chama `setupReconciliationDefaults(tx, companyId)` (upsert por `{companyId, name}`).
- Seeds: `CHART_OF_ACCOUNTS_SEED` (~28, campo `code`) e `FINANCE_ACCOUNTS_SEED` (4, campo `name`) em `finance-setup.service.ts`; `DEFAULT_TEMPLATES` (4, campo `name`) em `reconciliation-template.service.ts`. **Verificar se têm `export`; se não, adicionar `export` (mudança aditiva).**
- `CompanySettings` (1:1 por `companyId @unique`): `messageThankYou/messageQuote/messageReminder/messageBirthday String?`, `defaultQuoteValidDays Int @default(15)`.
- `GlobalAudit`: `actorType String`, `actorId String?` (FK→AdminUser, então **`actorId` deve ser null quando actorType=SYSTEM**), `companyId String?` (FK→Company), `action`, `metadata Json?`.

- [ ] **Step 1: Teste do service (falhando)** — `src/services/company-resync.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_MESSAGES } from "@/lib/default-messages";

const setupCompanyFinance = vi.fn();
vi.mock("@/services/finance-setup.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/finance-setup.service")>();
  return { ...actual, setupCompanyFinance: (...a: unknown[]) => setupCompanyFinance(...a) };
});

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

const companyFindUnique = vi.fn();
const branchFindFirst = vi.fn();
const chartCount = vi.fn();
const financeCount = vi.fn();
const templateCount = vi.fn();
const chartFindMany = vi.fn();
const financeFindMany = vi.fn();
const templateFindMany = vi.fn();
const settingsFindUnique = vi.fn();
const settingsCreate = vi.fn();
const settingsUpdate = vi.fn();
const auditCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: (...a: unknown[]) => companyFindUnique(...a) },
    branch: { findFirst: (...a: unknown[]) => branchFindFirst(...a) },
    chartOfAccounts: {
      count: (...a: unknown[]) => chartCount(...a),
      findMany: (...a: unknown[]) => chartFindMany(...a),
    },
    financeAccount: {
      count: (...a: unknown[]) => financeCount(...a),
      findMany: (...a: unknown[]) => financeFindMany(...a),
    },
    reconciliationTemplate: {
      count: (...a: unknown[]) => templateCount(...a),
      findMany: (...a: unknown[]) => templateFindMany(...a),
    },
    companySettings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      create: (...a: unknown[]) => settingsCreate(...a),
      update: (...a: unknown[]) => settingsUpdate(...a),
    },
    globalAudit: { create: (...a: unknown[]) => auditCreate(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  },
}));

import { resyncCompanySetup } from "./company-resync.service";

// Settings completos (todas mensagens = default atual → nada a fazer)
const fullSettings = {
  messageThankYou: DEFAULT_MESSAGES.thankYou,
  messageQuote: DEFAULT_MESSAGES.quote,
  messageReminder: DEFAULT_MESSAGES.reminder,
  messageBirthday: DEFAULT_MESSAGES.birthday,
};

describe("resyncCompanySetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    companyFindUnique.mockResolvedValue({ id: "co-1", name: "Ótica X" });
    branchFindFirst.mockResolvedValue({ id: "br-1" });
    chartCount.mockResolvedValue(28);
    financeCount.mockResolvedValue(4);
    templateCount.mockResolvedValue(4);
    settingsFindUnique.mockResolvedValue(fullSettings);
    auditCreate.mockResolvedValue({});
    settingsUpdate.mockResolvedValue({});
    settingsCreate.mockResolvedValue({});
  });

  it("retorna null quando a empresa não existe", async () => {
    companyFindUnique.mockResolvedValue(null);
    const r = await resyncCompanySetup("nope", { actorType: "SYSTEM" });
    expect(r).toBeNull();
    expect(setupCompanyFinance).not.toHaveBeenCalled();
  });

  it("modo REAL: roda setupCompanyFinance na transação e reporta created via before/after", async () => {
    chartCount.mockResolvedValueOnce(26).mockResolvedValueOnce(28); // before=26, after=28
    const r = await resyncCompanySetup("co-1", { actorType: "ADMIN_USER", actorId: "adm-1" });
    expect(setupCompanyFinance).toHaveBeenCalledWith({}, "co-1", "br-1");
    expect(r?.created.chartOfAccounts).toBe(2);
    expect(r?.changed).toBe(true);
    // audita com action de admin
    expect(auditCreate.mock.calls[0][0].data.action).toBe("COMPANY_RESYNCED");
  });

  it("modo DRY-RUN: NÃO chama setupCompanyFinance nem grava settings; calcula faltantes via seeds", async () => {
    chartFindMany.mockResolvedValue([{ code: "1" }]); // só 1 dos ~28 → faltam muitos
    financeFindMany.mockResolvedValue([{ name: "Caixa" }]);
    templateFindMany.mockResolvedValue([]);
    const r = await resyncCompanySetup("co-1", { actorType: "SYSTEM", dryRun: true });
    expect(setupCompanyFinance).not.toHaveBeenCalled();
    expect(settingsUpdate).not.toHaveBeenCalled();
    expect(settingsCreate).not.toHaveBeenCalled();
    expect(r?.created.chartOfAccounts).toBeGreaterThan(0);
    expect(r?.dryRun).toBe(true);
    // audita a simulação (é o relatório da tela) com action SYSTEM
    expect(auditCreate.mock.calls[0][0].data.action).toBe("COMPANY_AUTO_SYNCED");
    expect(auditCreate.mock.calls[0][0].data.metadata.dryRun).toBe(true);
    expect(auditCreate.mock.calls[0][0].data.actorId).toBeNull();
  });

  it("mensagens: preenche NULL e NÃO toca em texto personalizado", async () => {
    chartCount.mockResolvedValue(28); // financeiro sem mudança
    settingsFindUnique.mockResolvedValue({
      ...fullSettings,
      messageThankYou: null, // vazio → preenche
      messageBirthday: "Texto personalizado da ótica", // custom → não toca
    });
    const r = await resyncCompanySetup("co-1", { actorType: "SYSTEM" });
    expect(r?.messages.filled).toEqual(["thankYou"]);
    expect(r?.messages.updated).toEqual([]);
    const patch = settingsUpdate.mock.calls[0][0].data;
    expect(patch.messageThankYou).toBe(DEFAULT_MESSAGES.thankYou);
    expect(patch.messageBirthday).toBeUndefined(); // personalização intocada
  });

  it("sem NENHUMA mudança: changed=false e NÃO grava auditoria", async () => {
    chartCount.mockResolvedValue(28);
    const r = await resyncCompanySetup("co-1", { actorType: "SYSTEM" });
    expect(r?.changed).toBe(false);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("mensagens: ATUALIZA default antigo intacto (B2.1 fio completo)", async () => {
    // simula um default histórico registrado: o texto antigo deve ser atualizado
    // para o default atual. Requer mockar o history — usar vi.mock parcial de
    // @/lib/default-messages-history com HISTORICAL_DEFAULTS contendo o texto antigo,
    // OU (mais simples) usar vi.spyOn em HISTORICAL_DEFAULTS se for objeto mutável:
    // HISTORICAL_DEFAULTS.quote.push("Texto default antigo v1") + restaurar no fim.
    const { HISTORICAL_DEFAULTS } = await import("@/lib/default-messages-history");
    HISTORICAL_DEFAULTS.quote.push("Texto default antigo v1");
    try {
      settingsFindUnique.mockResolvedValue({
        ...fullSettings,
        messageQuote: "Texto default antigo v1", // default antigo intacto → atualiza
      });
      const r = await resyncCompanySetup("co-1", { actorType: "SYSTEM" });
      expect(r?.messages.updated).toEqual(["quote"]);
      const patch = settingsUpdate.mock.calls[0][0].data;
      expect(patch.messageQuote).toBe(DEFAULT_MESSAGES.quote);
    } finally {
      HISTORICAL_DEFAULTS.quote.pop(); // restaura o estado do módulo
    }
  });
});
```

- [ ] **Step 2:** Rodar → FAIL (módulo não existe).

- [ ] **Step 3: Exportar os seeds.** Em `src/services/finance-setup.service.ts`, conferir se `CHART_OF_ACCOUNTS_SEED` e `FINANCE_ACCOUNTS_SEED` têm `export`; adicionar se não. Idem `DEFAULT_TEMPLATES` em `src/services/reconciliation-template.service.ts`. (Mudança aditiva, zero comportamento.)

- [ ] **Step 4: Implementar** `src/services/company-resync.service.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import {
  setupCompanyFinance,
  CHART_OF_ACCOUNTS_SEED,
  FINANCE_ACCOUNTS_SEED,
} from "@/services/finance-setup.service";
import { DEFAULT_TEMPLATES } from "@/services/reconciliation-template.service";
import { DEFAULT_MESSAGES } from "@/lib/default-messages";
import {
  classifyMessageValue,
  MESSAGE_FIELD_BY_KEY,
  type MessageKey,
} from "@/lib/default-messages-history";
import { getAutoSyncConfig } from "@/services/auto-sync-config.service";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "company-resync" });

export interface ResyncOptions {
  actorType: "ADMIN_USER" | "SYSTEM";
  actorId?: string | null;
  actorEmail?: string | null;
  dryRun?: boolean;
}

interface FinanceCounts {
  chartOfAccounts: number;
  financeAccounts: number;
  reconciliationTemplates: number;
}

export interface ResyncResult {
  companyId: string;
  companyName: string;
  changed: boolean;
  dryRun: boolean;
  before: FinanceCounts;
  after: FinanceCounts;
  created: FinanceCounts;
  messages: { filled: MessageKey[]; updated: MessageKey[] };
}

async function countFinance(companyId: string): Promise<FinanceCounts> {
  const [chartOfAccounts, financeAccounts, reconciliationTemplates] = await Promise.all([
    prisma.chartOfAccounts.count({ where: { companyId } }),
    prisma.financeAccount.count({ where: { companyId } }),
    prisma.reconciliationTemplate.count({ where: { companyId } }),
  ]);
  return { chartOfAccounts, financeAccounts, reconciliationTemplates };
}

/** Dry-run do financeiro: quantos defaults FALTAM, comparando com os seeds (sem escrever). */
async function diffFinanceDefaults(companyId: string): Promise<FinanceCounts> {
  const [charts, accounts, templates] = await Promise.all([
    prisma.chartOfAccounts.findMany({ where: { companyId }, select: { code: true } }),
    prisma.financeAccount.findMany({ where: { companyId }, select: { name: true } }),
    prisma.reconciliationTemplate.findMany({ where: { companyId }, select: { name: true } }),
  ]);
  const codes = new Set(charts.map((c) => c.code));
  const names = new Set(accounts.map((a) => a.name));
  const tnames = new Set(templates.map((t) => t.name));
  return {
    chartOfAccounts: CHART_OF_ACCOUNTS_SEED.filter((s) => !codes.has(s.code)).length,
    financeAccounts: FINANCE_ACCOUNTS_SEED.filter((s) => !names.has(s.name)).length,
    reconciliationTemplates: DEFAULT_TEMPLATES.filter((t) => !tnames.has(t.name)).length,
  };
}

/** Mensagens (B2.1): preenche NULL, atualiza default-antigo-intacto, NUNCA toca personalização. */
async function syncMessages(
  companyId: string,
  dryRun: boolean
): Promise<{ filled: MessageKey[]; updated: MessageKey[] }> {
  const keys = Object.keys(MESSAGE_FIELD_BY_KEY) as MessageKey[];
  const settings = await prisma.companySettings.findUnique({ where: { companyId } });

  if (!settings) {
    // Empresa sem settings: nasce com todos os defaults (espelha settingsService.get).
    if (!dryRun) {
      await prisma.companySettings.create({
        data: {
          companyId,
          messageThankYou: DEFAULT_MESSAGES.thankYou,
          messageQuote: DEFAULT_MESSAGES.quote,
          messageReminder: DEFAULT_MESSAGES.reminder,
          messageBirthday: DEFAULT_MESSAGES.birthday,
        },
      });
    }
    return { filled: keys, updated: [] };
  }

  const filled: MessageKey[] = [];
  const updated: MessageKey[] = [];
  const patch: Record<string, string> = {};

  for (const key of keys) {
    const field = MESSAGE_FIELD_BY_KEY[key];
    const cls = classifyMessageValue(key, (settings as Record<string, unknown>)[field] as string | null);
    if (cls === "missing") {
      patch[field] = DEFAULT_MESSAGES[key];
      filled.push(key);
    } else if (cls === "stale-default") {
      patch[field] = DEFAULT_MESSAGES[key];
      updated.push(key);
    }
    // current-default e custom: não toca.
  }

  if (!dryRun && Object.keys(patch).length > 0) {
    await prisma.companySettings.update({ where: { companyId }, data: patch });
  }
  return { filled, updated };
}

/**
 * Re-sincroniza UMA empresa ao padrão atual do sistema. Aditivo e idempotente:
 * só cria/preenche o que falta; nunca apaga dados, mexe em saldos ou sobrescreve
 * personalização. dryRun calcula e reporta sem gravar (exceto a auditoria, que É
 * o relatório da simulação). Retorna null se a empresa não existir.
 */
export async function resyncCompanySetup(
  companyId: string,
  opts: ResyncOptions
): Promise<ResyncResult | null> {
  const dryRun = opts.dryRun ?? false;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) return null;

  let before: FinanceCounts;
  let after: FinanceCounts;
  let created: FinanceCounts;

  if (dryRun) {
    before = await countFinance(companyId);
    created = await diffFinanceDefaults(companyId);
    after = {
      chartOfAccounts: before.chartOfAccounts + created.chartOfAccounts,
      financeAccounts: before.financeAccounts + created.financeAccounts,
      reconciliationTemplates: before.reconciliationTemplates + created.reconciliationTemplates,
    };
  } else {
    const branch = await prisma.branch.findFirst({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    before = await countFinance(companyId);
    await prisma.$transaction(async (tx) => {
      await setupCompanyFinance(tx, companyId, branch?.id);
    });
    after = await countFinance(companyId);
    created = {
      chartOfAccounts: after.chartOfAccounts - before.chartOfAccounts,
      financeAccounts: after.financeAccounts - before.financeAccounts,
      reconciliationTemplates: after.reconciliationTemplates - before.reconciliationTemplates,
    };
  }

  const messages = await syncMessages(companyId, dryRun);
  const changed =
    created.chartOfAccounts + created.financeAccounts + created.reconciliationTemplates > 0 ||
    messages.filled.length > 0 ||
    messages.updated.length > 0;

  if (changed) {
    await prisma.globalAudit.create({
      data: {
        actorType: opts.actorType,
        // actorId é FK para AdminUser — DEVE ser null quando SYSTEM.
        actorId: opts.actorType === "SYSTEM" ? null : (opts.actorId ?? null),
        companyId,
        action: opts.actorType === "SYSTEM" ? "COMPANY_AUTO_SYNCED" : "COMPANY_RESYNCED",
        metadata: {
          before,
          after,
          created,
          messages,
          dryRun,
          ...(opts.actorEmail ? { adminEmail: opts.actorEmail } : {}),
        },
      },
    });
  }

  return {
    companyId,
    companyName: company.name,
    changed,
    dryRun,
    before,
    after,
    created,
    messages,
  };
}

export interface SyncAllResult {
  skipped: boolean;
  dryRun?: boolean;
  total?: number;
  changed?: number;
  unchanged?: number;
  errors?: number;
}

/**
 * Orquestrador do cron: sincroniza TODAS as empresas ativas, isolando falhas
 * (uma empresa com erro não derruba as outras — padrão recalcAllActiveHealthScores).
 * Lê o AutoSyncConfig: desligado → no-op; dryRun → só simula/reporta.
 */
export async function syncAllCompanies(): Promise<SyncAllResult> {
  const config = await getAutoSyncConfig();
  if (!config.isEnabled) {
    log.info("Auto-sync desligado — no-op");
    return { skipped: true };
  }

  const companies = await prisma.company.findMany({
    where: {
      isBlocked: false,
      subscriptions: { some: { status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } } },
    },
    select: { id: true },
  });

  let changed = 0;
  let unchanged = 0;
  let errors = 0;

  for (const company of companies) {
    try {
      const r = await resyncCompanySetup(company.id, {
        actorType: "SYSTEM",
        dryRun: config.dryRun,
      });
      if (r?.changed) changed++;
      else unchanged++;
    } catch (error) {
      errors++;
      log.error("Auto-sync falhou para empresa (isolado, segue para a próxima)", {
        companyId: company.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary: SyncAllResult = {
    skipped: false,
    dryRun: config.dryRun,
    total: companies.length,
    changed,
    unchanged,
    errors,
  };

  await prisma.autoSyncConfig.update({
    where: { id: "singleton" },
    data: { lastRunAt: new Date(), lastRunSummary: summary as object },
  });

  return summary;
}
```

- [ ] **Step 5:** Rodar o teste do service → PASS. (Ajustar detalhes de mocks se a forma real dos seeds divergir — manter o SENTIDO dos asserts.)

- [ ] **Step 6: Refatorar o endpoint manual.** `src/app/api/admin/companies/[id]/resync/route.ts` passa a delegar:

```typescript
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { resyncCompanySetup } from "@/services/company-resync.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/companies/[id]/resync" });

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id: companyId } = await params;
  try {
    const result = await resyncCompanySetup(companyId, {
      actorType: "ADMIN_USER",
      actorId: admin.id,
      actorEmail: admin.email,
    });
    if (!result) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }
    log.info("Empresa re-sincronizada", { companyId, created: result.created });
    return NextResponse.json({
      success: true,
      data: {
        companyName: result.companyName,
        before: result.before,
        after: result.after,
        created: {
          chartOfAccounts: result.created.chartOfAccounts,
          financeAccounts: result.created.financeAccounts,
          reconciliationTemplates: result.created.reconciliationTemplates,
        },
        messages: result.messages,
      },
    });
  } catch (error) {
    log.error("Erro ao re-sincronizar empresa", {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erro interno ao re-sincronizar" }, { status: 500 });
  }
}
```

- [ ] **Step 7: Atualizar os mocks do teste do endpoint.** Em `route.test.ts`, o service real roda com o prisma mockado. DUAS mudanças obrigatórias:

**(a) O mock de `finance-setup.service` DEVE virar parcial via `importOriginal`** — o novo service importa também os seeds (`CHART_OF_ACCOUNTS_SEED`/`FINANCE_ACCOUNTS_SEED`) desse módulo; um mock que só define `setupCompanyFinance` quebraria se os seeds forem acessados:

```typescript
vi.mock("@/services/finance-setup.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/finance-setup.service")>();
  return { ...actual, setupCompanyFinance: (...a: unknown[]) => setupCompanyFinance(...a) };
});
```

**(b) O mock do prisma precisa ganhar `companySettings`** (retornando settings completos = defaults atuais, para não gerar mudança de mensagens) e `findMany` nos 3 models financeiros. Adicionar ao `vi.mock("@/lib/prisma")` existente:

```typescript
companySettings: {
  findUnique: vi.fn(async () => ({
    messageThankYou: DEFAULT_MESSAGES.thankYou,
    messageQuote: DEFAULT_MESSAGES.quote,
    messageReminder: DEFAULT_MESSAGES.reminder,
    messageBirthday: DEFAULT_MESSAGES.birthday,
  })),
  create: vi.fn(),
  update: vi.fn(),
},
```
(+ `import { DEFAULT_MESSAGES } from "@/lib/default-messages";` e `findMany: vi.fn(async () => [])` em chartOfAccounts/financeAccount/reconciliationTemplate). **Os 5 asserts existentes devem continuar passando sem alteração de expectativa** (401/403/404, idempotência created=0, criados+auditoria `COMPANY_RESYNCED`). Se um assert falhar, o comportamento divergiu — corrigir o SERVICE, não o assert.

> **Mudanças de comportamento conscientes (documentar na msg de commit):**
> 1. O endpoint manual deixa de auditar resync SEM mudança (antes auditava sempre; agora o service audita só quando `changed=true` — menos ruído no GlobalAudit).
> 2. A spec B4 menciona GET/PATCH; implementamos só PATCH — a tela lê a config server-side direto pelo service (YAGNI, funcionalmente equivalente).

- [ ] **Step 8:** Rodar `./node_modules/.bin/vitest run "src/app/api/admin/companies/[id]/resync/route.test.ts" src/services/company-resync.service.test.ts` → PASS (10 testes). tsc → 0 erros.

- [ ] **Step 9: Commit**

```bash
git add src/services/company-resync.service.ts src/services/company-resync.service.test.ts src/services/finance-setup.service.ts src/services/reconciliation-template.service.ts "src/app/api/admin/companies/[id]/resync/route.ts" "src/app/api/admin/companies/[id]/resync/route.test.ts"
git commit -m "feat(auto-sync): service central de resync (financeiro+mensagens B2.1, dry-run) + endpoint manual delega"
```

---

## Task 4: Cron `sync-all-companies`

**Files:**
- Create: `src/app/api/cron/sync-all-companies/route.ts`
- Create: `src/app/api/cron/sync-all-companies/route.test.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Teste (falhando)** — `src/app/api/cron/sync-all-companies/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const syncAllCompanies = vi.fn();
vi.mock("@/services/company-resync.service", () => ({
  syncAllCompanies: (...a: unknown[]) => syncAllCompanies(...a),
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

import { GET } from "./route";

function req(auth?: string) {
  return new Request("http://x/api/cron/sync-all-companies", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("GET /api/cron/sync-all-companies", () => {
  const ORIGINAL = process.env.CRON_SECRET;
  beforeEach(() => {
    syncAllCompanies.mockReset().mockResolvedValue({ skipped: false, total: 2, changed: 1, unchanged: 1, errors: 0, dryRun: true });
    process.env.CRON_SECRET = "s3cret";
  });
  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL;
  });

  it("401 sem Bearer correto", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer errado"))).status).toBe(401);
    expect(syncAllCompanies).not.toHaveBeenCalled();
  });

  it("401 fail-closed quando CRON_SECRET não está configurado", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer s3cret"))).status).toBe(401);
  });

  it("200 com o resumo quando autorizado", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, total: 2, changed: 1 });
  });

  it("500 quando o orquestrador lança", async () => {
    syncAllCompanies.mockRejectedValue(new Error("boom"));
    expect((await GET(req("Bearer s3cret"))).status).toBe(500);
  });
});
```

- [ ] **Step 2:** Rodar → FAIL.

- [ ] **Step 3: Implementar** `src/app/api/cron/sync-all-companies/route.ts` (espelha `recalc-health`):

```typescript
/**
 * Sincronização automática de setup — roda diariamente (0 4 * * *).
 * Lê AutoSyncConfig: desligado → no-op; dryRun → só relatório.
 * Autenticação: Authorization: Bearer <CRON_SECRET> (fail-closed).
 */
import { NextResponse } from "next/server";
import { syncAllCompanies } from "@/services/company-resync.service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "cron/sync-all-companies" });

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) {
      log.error("CRON_SECRET não configurado — sync-all-companies recusado (fail-closed)");
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncAllCompanies();
    log.info("Auto-sync executado", { ...result });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    log.error("Erro geral no auto-sync", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erro no auto-sync" }, { status: 500 });
  }
}
```

- [ ] **Step 4: vercel.json** — adicionar ao array `crons` (DIÁRIO — conta Hobby):

```json
{
  "path": "/api/cron/sync-all-companies",
  "schedule": "0 4 * * *"
}
```
> Nota: hoje há 6 crons diários e o deploy passa. Se o deploy futuro reclamar de LIMITE DE QUANTIDADE de crons no Hobby com o 7º, fallback documentado: disparar `syncAllCompanies()` dentro do cron `recalc-health` (mesmo horário-base) em vez de cron próprio. NÃO implementar o fallback agora.

- [ ] **Step 5:** Rodar o teste → PASS. tsc → 0 erros.

- [ ] **Step 6: Testes do orquestrador** (isolamento por empresa) — adicionar ao `company-resync.service.test.ts`:

```typescript
// no mock do prisma, adicionar:
//   autoSyncConfig: { upsert: (...a) => configUpsert(...a), update: (...a) => configUpdate(...a) },
//   company.findMany: (...a) => companyFindMany(...a),
import { syncAllCompanies } from "./company-resync.service";

describe("syncAllCompanies", () => {
  // ⚠️ beforeEach PRÓPRIO e completo — NÃO depender do beforeEach do describe
  // anterior (vi.clearAllMocks não limpa mockResolvedValue; herdar implementações
  // tornaria estes testes dependentes de ordem de execução).
  beforeEach(() => {
    vi.clearAllMocks();
    configUpsert.mockResolvedValue({ id: "singleton", isEnabled: true, dryRun: false });
    configUpdate.mockResolvedValue({});
    companyFindMany.mockResolvedValue([]);
    companyFindUnique.mockResolvedValue({ id: "co-x", name: "X" });
    branchFindFirst.mockResolvedValue({ id: "br-1" });
    chartCount.mockResolvedValue(28);
    financeCount.mockResolvedValue(4);
    templateCount.mockResolvedValue(4);
    settingsFindUnique.mockResolvedValue(fullSettings); // sem mudança de mensagens
    auditCreate.mockResolvedValue({});
  });

  it("desligado → no-op (não consulta empresas)", async () => {
    configUpsert.mockResolvedValue({ id: "singleton", isEnabled: false, dryRun: true });
    const r = await syncAllCompanies();
    expect(r.skipped).toBe(true);
    expect(companyFindMany).not.toHaveBeenCalled();
  });

  it("erro em UMA empresa não para as outras + grava lastRunSummary", async () => {
    companyFindMany.mockResolvedValue([{ id: "co-1" }, { id: "co-2" }]);
    // co-1 falha (company.findUnique lança), co-2 ok sem mudanças
    companyFindUnique
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ id: "co-2", name: "Ok" });
    const r = await syncAllCompanies();
    expect(r).toMatchObject({ total: 2, errors: 1, changed: 0, unchanged: 1 });
    expect(configUpdate).toHaveBeenCalledOnce(); // lastRunAt + lastRunSummary
  });
});
```
(Declarar `configUpsert/configUpdate/companyFindMany` como `vi.fn()` no topo e incluí-los no `vi.mock("@/lib/prisma")`. O `getAutoSyncConfig` usa o MESMO mock de prisma — não mockar o módulo `auto-sync-config.service`.)

- [ ] **Step 7:** Rodar TODOS os testes da fase → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/cron/sync-all-companies/ vercel.json src/services/company-resync.service.test.ts
git commit -m "feat(auto-sync): cron diário sync-all-companies (0 4) com isolamento por empresa"
```

---

## Task 5: PATCH `/api/admin/auto-sync/config` (só SUPER_ADMIN)

**Files:**
- Create: `src/app/api/admin/auto-sync/config/route.ts`
- Create: `src/app/api/admin/auto-sync/config/route.test.ts`

- [ ] **Step 1: Teste (falhando)**:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
vi.mock("@/lib/admin-session", () => ({ getAdminSession: () => getAdminSession() }));

const updateAutoSyncConfig = vi.fn();
vi.mock("@/services/auto-sync-config.service", () => ({
  updateAutoSyncConfig: (...a: unknown[]) => updateAutoSyncConfig(...a),
}));

const auditCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { globalAudit: { create: (...a: unknown[]) => auditCreate(...a) } },
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

import { PATCH } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/admin/auto-sync/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/auto-sync/config", () => {
  beforeEach(() => {
    getAdminSession.mockReset();
    updateAutoSyncConfig.mockReset().mockResolvedValue({
      id: "singleton", isEnabled: true, dryRun: true, lastRunAt: null, lastRunSummary: null,
    });
    auditCreate.mockReset().mockResolvedValue({});
  });

  it("401 sem sessão", async () => {
    getAdminSession.mockResolvedValue(null);
    expect((await PATCH(req({ isEnabled: true }))).status).toBe(401);
  });

  it.each(["ADMIN", "SUPPORT", "BILLING"])("403 para %s (só SUPER_ADMIN liga/desliga)", async (role) => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role });
    expect((await PATCH(req({ isEnabled: true }))).status).toBe(403);
    expect(updateAutoSyncConfig).not.toHaveBeenCalled();
  });

  it("400 com body vazio (nada para atualizar)", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role: "SUPER_ADMIN" });
    expect((await PATCH(req({}))).status).toBe(400);
  });

  it("200 para SUPER_ADMIN: atualiza e audita AUTO_SYNC_TOGGLED", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role: "SUPER_ADMIN" });
    const res = await PATCH(req({ isEnabled: true, dryRun: false }));
    expect(res.status).toBe(200);
    expect(updateAutoSyncConfig).toHaveBeenCalledWith({ isEnabled: true, dryRun: false }, "a1");
    const audit = auditCreate.mock.calls[0][0].data;
    expect(audit.action).toBe("AUTO_SYNC_TOGGLED");
    expect(audit.actorType).toBe("ADMIN_USER");
    expect(audit.metadata).toMatchObject({ isEnabled: true, dryRun: false });
  });
});
```

- [ ] **Step 2:** Rodar → FAIL.

- [ ] **Step 3: Implementar** `src/app/api/admin/auto-sync/config/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
import { updateAutoSyncConfig } from "@/services/auto-sync-config.service";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/auto-sync/config" });

const bodySchema = z
  .object({
    isEnabled: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  })
  .refine((b) => b.isEnabled !== undefined || b.dryRun !== undefined, {
    message: "Nada para atualizar",
  });

export async function PATCH(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  // Liga/desliga da sincronização global é decisão de dono — só SUPER_ADMIN.
  if (admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const config = await updateAutoSyncConfig(parsed.data, admin.id);
    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        action: "AUTO_SYNC_TOGGLED",
        metadata: { ...parsed.data, adminEmail: admin.email },
      },
    });
    log.info("Auto-sync config alterada", { ...parsed.data, adminId: admin.id });
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    log.error("Erro ao alterar auto-sync config", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
```

- [ ] **Step 4:** Rodar → PASS. tsc → 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/auto-sync/
git commit -m "feat(auto-sync): PATCH config (liga/desliga + modo) restrito a SUPER_ADMIN com auditoria"
```

---

## Task 6: Tela `/admin/configuracoes/sincronizacao` + item no menu

**Files:**
- Create: `src/app/admin/configuracoes/sincronizacao/page.tsx`
- Create: `src/app/admin/configuracoes/sincronizacao/sincronizacao-client.tsx`
- Modify: `src/app/admin/admin-nav.tsx`

**Padrões a seguir:** page server component com `requireAdminRole(["SUPER_ADMIN"])` + data fetching direto via prisma + serialização de datas (`.toISOString()`); client component com `"use client"`, fetch PATCH, `router.refresh()`. Visual consistente com as demais telas do admin (mesmo tema/cards de `/admin/configuracoes/planos`).

- [ ] **Step 1: page.tsx**:

```typescript
import { requireAdminRole } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { getAutoSyncConfig } from "@/services/auto-sync-config.service";
import { SincronizacaoClient } from "./sincronizacao-client";

export default async function SincronizacaoPage() {
  await requireAdminRole(["SUPER_ADMIN"]);

  const config = await getAutoSyncConfig();
  const audits = await prisma.globalAudit.findMany({
    where: { action: "COMPANY_AUTO_SYNCED" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { company: { select: { name: true } } },
  });

  return (
    <SincronizacaoClient
      config={{
        isEnabled: config.isEnabled,
        dryRun: config.dryRun,
        lastRunAt: config.lastRunAt?.toISOString() ?? null,
        lastRunSummary: (config.lastRunSummary as Record<string, unknown> | null) ?? null,
      }}
      audits={audits.map((a) => ({
        id: a.id,
        companyName: a.company?.name ?? a.companyId ?? "—",
        createdAt: a.createdAt.toISOString(),
        metadata: (a.metadata as Record<string, unknown> | null) ?? null,
      }))}
    />
  );
}
```

- [ ] **Step 2: sincronizacao-client.tsx** (estrutura — o executor pode ajustar classes ao tema do admin, mantendo os elementos):

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Config {
  isEnabled: boolean;
  dryRun: boolean;
  lastRunAt: string | null;
  lastRunSummary: Record<string, unknown> | null;
}
interface AuditRow {
  id: string;
  companyName: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export function SincronizacaoClient({ config, audits }: { config: Config; audits: AuditRow[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function patch(body: { isEnabled?: boolean; dryRun?: boolean }) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/auto-sync/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao salvar");
        return;
      }
      router.refresh();
    } catch {
      setError("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const s = config.lastRunSummary;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Sincronização Automática</h1>
        <p className="text-sm text-gray-400 mt-1">
          Re-aplica o padrão atual do sistema (plano de contas, contas financeiras, templates e
          mensagens padrão) a todas as empresas, toda madrugada (4h). Aditivo: nunca apaga dados,
          não mexe em saldos e nunca sobrescreve textos personalizados pelas óticas.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Interruptor principal */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 flex items-center justify-between">
        <div>
          <p className="font-semibold text-white">
            Status: {config.isEnabled ? "🟢 Ligada" : "⚪ Desligada"}
          </p>
          <p className="text-sm text-gray-400">
            {config.isEnabled
              ? "Roda toda madrugada às 4h."
              : "Nada acontece até você ligar."}
          </p>
        </div>
        <button
          onClick={() => patch({ isEnabled: !config.isEnabled })}
          disabled={saving}
          className={`px-4 py-2 rounded-md font-semibold text-sm disabled:opacity-50 ${
            config.isEnabled ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"
          }`}
        >
          {config.isEnabled ? "Desligar" : "Ligar"}
        </button>
      </div>

      {/* Modo */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <p className="font-semibold text-white mb-2">Modo</p>
        <div className="flex gap-3">
          <button
            onClick={() => patch({ dryRun: true })}
            disabled={saving || config.dryRun}
            className={`px-4 py-2 rounded-md text-sm ${config.dryRun ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
          >
            🔍 Simulação (só relatório)
          </button>
          <button
            onClick={() => {
              if (confirm("Aplicar DE VERDADE nas empresas a partir da próxima execução?")) {
                patch({ dryRun: false });
              }
            }}
            disabled={saving || !config.dryRun}
            className={`px-4 py-2 rounded-md text-sm ${!config.dryRun ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
          >
            ✅ Aplicar de verdade
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Em Simulação, a execução só gera o relatório do que MUDARIA — não grava nada nas empresas.
        </p>
      </div>

      {/* Última execução */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <p className="font-semibold text-white mb-2">Última execução</p>
        {config.lastRunAt ? (
          <div className="text-sm text-gray-300 space-y-1">
            <p>{new Date(config.lastRunAt).toLocaleString("pt-BR")} {s?.dryRun ? "(simulação)" : ""}</p>
            {s && (
              <p>
                ✅ {String(s.changed ?? 0)} com mudança · ⏭️ {String(s.unchanged ?? 0)} sem mudança · ❌{" "}
                {String(s.errors ?? 0)} erro(s) · total {String(s.total ?? 0)}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Ainda não rodou.</p>
        )}
      </div>

      {/* Relatório por empresa */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <p className="font-semibold text-white mb-3">O que mudou por empresa (últimos 50)</p>
        {audits.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum registro ainda.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {audits.map((a) => {
              const created = (a.metadata?.created ?? {}) as Record<string, number>;
              const messages = (a.metadata?.messages ?? {}) as { filled?: string[]; updated?: string[] };
              const isDry = Boolean(a.metadata?.dryRun);
              const parts: string[] = [];
              if (created.chartOfAccounts) parts.push(`+${created.chartOfAccounts} plano de contas`);
              if (created.financeAccounts) parts.push(`+${created.financeAccounts} contas financeiras`);
              if (created.reconciliationTemplates) parts.push(`+${created.reconciliationTemplates} templates`);
              if (messages.filled?.length) parts.push(`${messages.filled.length} mensagem(ns) preenchida(s)`);
              if (messages.updated?.length) parts.push(`${messages.updated.length} mensagem(ns) atualizada(s)`);
              return (
                <li key={a.id} className="border-b border-gray-700/60 pb-2">
                  <span className="text-white">{a.companyName}</span>{" "}
                  <span className="text-gray-400">— {parts.join(" · ") || "mudança registrada"}</span>{" "}
                  {isDry && <span className="text-blue-400">[simulação]</span>}
                  <span className="text-gray-600 ml-2">{new Date(a.createdAt).toLocaleString("pt-BR")}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Item no menu.** Em `src/app/admin/admin-nav.tsx`, na seção `"Configurações"`, adicionar ANTES do item "Config":

```typescript
{ href: "/admin/configuracoes/sincronizacao", icon: RefreshCw, label: "Sincronização", exact: false },
```
(+ `RefreshCw` no import de `lucide-react`.)

- [ ] **Step 4:** `./node_modules/.bin/tsc --noEmit` → 0 erros. Subir o dev server NÃO é necessário; a validação visual fica para o smoke pós-deploy.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/configuracoes/sincronizacao/ src/app/admin/admin-nav.tsx
git commit -m "feat(auto-sync): tela admin de sincronização (liga/desliga, modo simulação, relatório)"
```

---

## Task 7: Validação final da Fase B

- [ ] **Step 1:** `./node_modules/.bin/vitest run` → TODOS verdes (511 + ~15 novos).
- [ ] **Step 2:** `./node_modules/.bin/tsc --noEmit` → 0 erros.
- [ ] **Step 3:** `npm run build` → exit 0, ~297+ páginas (a tela nova entra como dynamic).
- [ ] **Step 4:** `git status -s` → árvore limpa (fora untracked não-relacionados).

---

## Notas de deploy (manual — fora do escopo das tasks)

1. Merge `feat/auto-sync-fase-b` → `main` (ff ou PR).
2. **Deploy é MANUAL:** `vercel deploy --prod` (CLI em `/Users/matheusreboucas/.nvm/versions/node/v22.18.0/bin/vercel`, já logado). O push NÃO deploya.
3. **Migration manual pós-deploy:** `npm run migrate:deploy` (aplica `20260609210000_auto_sync_config`; tabela nova, sem dedup — segura).
4. Se o deploy falhar por LIMITE de quantidade de crons (7º cron no Hobby): remover o cron novo do vercel.json e usar o fallback documentado na Task 4 (chamar `syncAllCompanies()` dentro do recalc-health).
5. Entregue **DESLIGADO + SIMULAÇÃO**. Fluxo do dono: ligar → ler relatórios uns dias → mudar para "Aplicar de verdade" → qualquer susto, desligar na tela (instantâneo).
