# Cockpit Didático + Aba de Resolução — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o cockpit `/admin/monitoramento` didático (métricas em português + semáforo) e adicionar uma aba "Resolução" que lista problemas detectados como cartões acionáveis, reusando o motor de ações existente.

**Architecture:** Detector de problemas puro e testável (`src/lib/monitoring/issues.ts`) + camada async que achata empresas problemáticas (`problem-companies.ts`), expostos via extensão do endpoint `/api/admin/observability`. UI ganha abas (Visão Geral didática | Resolução) e um `IssueCard` que abre o `ActionModal` já existente (Fase 5). Zero ação nova de banco — só conecta detecção → blueprints.

**Tech Stack:** Next.js 14 (App Router), Prisma + PostgreSQL (Neon), TypeScript, Zod, Vitest, Tailwind. Branch: `feature/cockpit-monitoramento`.

**Spec de referência:** `docs/superpowers/specs/2026-06-05-cockpit-didatico-resolucao-design.md`

---

## Convenções deste plano (ler antes de começar)

- **Testes:** Vitest. `import { describe, it, expect } from "vitest";`. Rodar um arquivo: `npm test -- caminho`. Tudo: `npm test`.
- **Cobertura mede só `src/lib/**` e `src/services/**`** → toda lógica testável mora em `src/lib/` (funções puras). UI não tem teste unitário (padrão do projeto) — validar por smoke/build.
- **Auth admin:** `requireAdminAuth()` de `@/lib/admin-auth-helpers` (rotas) e `requireAdmin()` de `@/lib/admin-session` (páginas server).
- **Erros de API:** `handleApiError(error)` de `@/lib/error-handler`.
- **Sem migration nesta fase** — tudo lê tabelas existentes.
- **Checagem de fim de fase (REGRA DO PROJETO):** ao fim, rodar nesta ordem e só seguir se tudo passar: `npx tsc --noEmit` → `npm run build` → `npm test` → review (general-purpose herda Opus; code-reviewer/Sonnet está no limite até 9/jun).
- **NÃO reiniciar o dev server repetidamente** (corrompe Turbopack → 500).
- **Commits frequentes:** um por tarefa (teste+impl juntos). Conventional: `feat:`/`test:`.
- **best-effort:** detecção nunca derruba o cockpit (try/catch → lista vazia), espelhando `getSystemTrends`.

---

## File Structure (mapa de decomposição)

**Lógica (testável, `src/lib/monitoring/`):**
- Create: `issues.ts` — tipos `Issue`/`IssueInput`/`ProblemCompany` + detectores puros + `detectIssues` + `sortIssues`. Responsabilidade: regras de "o que é um problema".
- Create: `issues.test.ts`
- Create: `problem-companies.ts` — `getProblemCompanies()` (query Prisma + achatamento Company×Subscription×Invoice). Responsabilidade: buscar+achatar empresas problemáticas.

**Endpoint:**
- Modify: `src/app/api/admin/observability/route.ts` — adiciona `getProblemCompanies()` ao `Promise.all` + `detectIssues` + `issues` no payload.

**UI (`src/app/admin/monitoramento/`):**
- Create: `issue-card.tsx` — renderiza um `Issue` + botão "Resolver" (abre ActionModal / navega / explica).
- Modify: `cockpit-client.tsx` — abas (Visão Geral | Resolução), cards didáticos (frase+tooltip+detalhes recolhíveis), resumo no topo, fetch de descritores de blueprint, wiring do IssueCard→ActionModal.

---

# FASE ÚNICA — Cockpit didático + Resolução

### Task 1: Tipos + primeiro detector (sistema lento) — TDD

**Files:**
- Create: `src/lib/monitoring/issues.ts`
- Test: `src/lib/monitoring/issues.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/monitoring/issues.test.ts
import { describe, it, expect } from "vitest";
import { detectSystemIssues } from "./issues";
import type { SystemPulse } from "./system-pulse";

function pulse(over: Partial<SystemPulse> = {}): SystemPulse {
  return {
    status: "ok",
    db: { status: "ok", latencyMs: 40 },
    uptimeS: 100, version: "abc", timestamp: "2026-06-05T00:00:00.000Z",
    reqCount: 100, errorCount: 0, errorRatePct: 0,
    p50Ms: 50, p95Ms: 200, slowQueries: 0,
    cacheHits: 0, cacheMisses: 0, cacheHitRatePct: null,
    memoryRssMb: 100, memoryHeapUsedMb: 60,
    ...over,
  };
}

describe("detectSystemIssues — sistema lento/fora do ar", () => {
  it("não dispara quando db ok e status ok", () => {
    expect(detectSystemIssues(pulse())).toEqual([]);
  });
  it("dispara warning quando db degraded", () => {
    const issues = detectSystemIssues(pulse({ db: { status: "degraded", latencyMs: 900 }, status: "degraded" }));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].category).toBe("system");
    expect(issues[0].id).toBe("system_slow");
  });
  it("dispara critical quando sistema down", () => {
    const issues = detectSystemIssues(pulse({ db: { status: "down", latencyMs: null }, status: "down" }));
    expect(issues[0].severity).toBe("critical");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/monitoring/issues.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/monitoring/issues.ts
import type { SystemPulse } from "./system-pulse";
import type { SystemTrends } from "./system-trends";
import type { HealthCategory, SubscriptionStatus } from "@prisma/client";

export type IssueSeverity = "critical" | "warning" | "info";
export type IssueCategory = "system" | "client";

export interface IssueAction {
  kind: "blueprint" | "link" | "info";
  blueprintId?: string;
  href?: string;
  label: string;
}

export interface Issue {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  explanation: string;
  companyId?: string;
  companyName?: string;
  action?: IssueAction;
}

// ── Limiares (constantes documentadas; não editáveis pela UI — YAGNI) ──
export const ERROR_RATE_PCT = 5;
export const MIN_REQ_FOR_ERROR_ALERT = 20;
export const TRIAL_WARNING_DAYS = 3;

export function detectSystemIssues(pulse: SystemPulse): Issue[] {
  const issues: Issue[] = [];
  if (pulse.status === "down" || pulse.db.status === "down") {
    issues.push({
      id: "system_slow", severity: "critical", category: "system",
      title: "Sistema fora do ar",
      explanation: "O sistema não está conseguindo responder agora. Os usuários podem estar sem acesso.",
      action: { kind: "info", label: "Verificar novamente" },
    });
  } else if (pulse.status === "degraded" || pulse.db.status === "degraded") {
    issues.push({
      id: "system_slow", severity: "warning", category: "system",
      title: "Sistema lento",
      explanation: "As telas estão demorando mais que o normal para responder. Pode ser um pico temporário.",
      action: { kind: "info", label: "Verificar novamente" },
    });
  }
  return issues;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/monitoring/issues.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/monitoring/issues.ts src/lib/monitoring/issues.test.ts
git commit -m "feat(monitoring): tipos Issue + detector de sistema lento/fora do ar"
```

---

### Task 2: Detector de taxa de erro — TDD

**Files:**
- Modify: `src/lib/monitoring/issues.ts`
- Test: `src/lib/monitoring/issues.test.ts` (estender)

- [ ] **Step 1: Write the failing test**

```ts
// adicionar em issues.test.ts
describe("detectErrorRateIssue", () => {
  it("não dispara abaixo do limiar", () => {
    expect(detectErrorRateIssue(pulse({ reqCount: 100, errorRatePct: 2 }))).toBeNull();
  });
  it("não dispara com poucas requests (evita falso positivo)", () => {
    expect(detectErrorRateIssue(pulse({ reqCount: 5, errorRatePct: 50 }))).toBeNull();
  });
  it("dispara critical quando erro >= 5% com requests suficientes", () => {
    const i = detectErrorRateIssue(pulse({ reqCount: 100, errorRatePct: 8 }));
    expect(i?.severity).toBe("critical");
    expect(i?.id).toBe("error_rate");
    expect(i?.action?.kind).toBe("link");
  });
});
```

Lembrar de importar `detectErrorRateIssue` no topo do test.

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- src/lib/monitoring/issues.test.ts`

- [ ] **Step 3: Implementar**

```ts
// em issues.ts
export function detectErrorRateIssue(pulse: SystemPulse): Issue | null {
  if (pulse.reqCount < MIN_REQ_FOR_ERROR_ALERT) return null;
  if (pulse.errorRatePct < ERROR_RATE_PCT) return null;
  return {
    id: "error_rate", severity: "critical", category: "system",
    title: "Muitos erros acontecendo",
    explanation: `${pulse.errorRatePct}% das últimas requisições falharam. Algo pode estar quebrado para os usuários.`,
    action: { kind: "link", href: "/admin/configuracoes/logs", label: "Ver registros de erro" },
  };
}
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/monitoring/issues.ts src/lib/monitoring/issues.test.ts
git commit -m "feat(monitoring): detector de taxa de erro alta"
```

---

### Task 3: Detectores de cliente (por empresa) — TDD

**Files:**
- Modify: `src/lib/monitoring/issues.ts`
- Test: `src/lib/monitoring/issues.test.ts` (estender)

Cobre os 6 casos de cliente: billing sync, inadimplência, trial vencendo (5a), trial vencido (5b), saúde crítica, suspensa. Cada um lê um `ProblemCompany`.

- [ ] **Step 1: Write the failing test**

```ts
// adicionar em issues.test.ts
import { detectCompanyIssues, type ProblemCompany } from "./issues";

const NOW = new Date("2026-06-05T12:00:00.000Z");

function company(over: Partial<ProblemCompany> = {}): ProblemCompany {
  return {
    id: "c1", name: "Ótica Teste",
    isBlocked: false, healthCategory: "HEALTHY",
    subscriptionStatus: "ACTIVE", trialEndsAt: null, pastDueSince: null,
    billingSyncPending: false, overdueInvoiceCount: 0, overdueTotalCents: 0,
    ...over,
  };
}

describe("detectCompanyIssues", () => {
  it("empresa saudável e ativa → nenhum problema", () => {
    expect(detectCompanyIssues(company(), NOW)).toEqual([]);
  });

  it("billing sync pendente → warning, link p/ cliente", () => {
    const [i] = detectCompanyIssues(company({ billingSyncPending: true }), NOW);
    expect(i.id).toBe("billing_sync:c1");
    expect(i.severity).toBe("warning");
    expect(i.action?.kind).toBe("link");
    expect(i.action?.href).toBe("/admin/clientes/c1");
  });

  it("inadimplência → critical, link", () => {
    const [i] = detectCompanyIssues(company({ overdueInvoiceCount: 2, overdueTotalCents: 30000 }), NOW);
    expect(i.id).toBe("overdue:c1");
    expect(i.severity).toBe("critical");
    expect(i.explanation).toContain("R$");
  });

  it("trial vencendo (status TRIAL, <=3 dias) → info + blueprint extend_trial", () => {
    const trialEndsAt = new Date("2026-06-07T12:00:00.000Z"); // +2 dias
    const [i] = detectCompanyIssues(company({ subscriptionStatus: "TRIAL", trialEndsAt }), NOW);
    expect(i.id).toBe("trial_ending:c1");
    expect(i.severity).toBe("info");
    expect(i.action?.kind).toBe("blueprint");
    expect(i.action?.blueprintId).toBe("extend_trial");
  });

  it("trial vencido (TRIAL_EXPIRED) → warning + link (não extend_trial)", () => {
    const [i] = detectCompanyIssues(company({ subscriptionStatus: "TRIAL_EXPIRED" }), NOW);
    expect(i.id).toBe("trial_expired:c1");
    expect(i.severity).toBe("warning");
    expect(i.action?.kind).toBe("link");
  });

  it("trial com status TRIAL mas data já passada → vencido (link)", () => {
    const trialEndsAt = new Date("2026-06-01T12:00:00.000Z"); // passado
    const [i] = detectCompanyIssues(company({ subscriptionStatus: "TRIAL", trialEndsAt }), NOW);
    expect(i.id).toBe("trial_expired:c1");
    expect(i.action?.kind).toBe("link");
  });

  it("saúde crítica → warning + link", () => {
    const [i] = detectCompanyIssues(company({ healthCategory: "CRITICAL" }), NOW);
    expect(i.id).toBe("health_critical:c1");
    expect(i.action?.href).toBe("/admin/clientes/c1");
  });

  it("suspensa → warning + blueprint reactivate", () => {
    const [i] = detectCompanyIssues(company({ subscriptionStatus: "SUSPENDED" }), NOW);
    expect(i.id).toBe("suspended:c1");
    expect(i.action?.blueprintId).toBe("reactivate");
  });

  it("pagamento atrasado (PAST_DUE) → warning + link", () => {
    const [i] = detectCompanyIssues(company({ subscriptionStatus: "PAST_DUE" }), NOW);
    expect(i.id).toBe("past_due:c1");
    expect(i.severity).toBe("warning");
    expect(i.action?.kind).toBe("link");
  });

  it("empresa com 2 problemas gera 2 cards distintos", () => {
    const issues = detectCompanyIssues(company({ subscriptionStatus: "SUSPENDED", healthCategory: "CRITICAL" }), NOW);
    const ids = issues.map((i) => i.id);
    expect(ids).toContain("suspended:c1");
    expect(ids).toContain("health_critical:c1");
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementar**

```ts
// em issues.ts — adicionar ProblemCompany e detectCompanyIssues

export interface ProblemCompany {
  id: string;
  name: string;
  isBlocked: boolean;
  healthCategory: HealthCategory | null;
  subscriptionStatus: SubscriptionStatus | null;
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
  billingSyncPending: boolean;
  overdueInvoiceCount: number;
  overdueTotalCents: number;
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function detectCompanyIssues(c: ProblemCompany, now: Date): Issue[] {
  const issues: Issue[] = [];

  // Inadimplência (critical)
  if (c.overdueInvoiceCount > 0) {
    issues.push({
      id: `overdue:${c.id}`, severity: "critical", category: "client",
      title: "Cliente com fatura vencida",
      explanation: `${c.name} tem ${c.overdueInvoiceCount} fatura(s) vencida(s), somando ${brl(c.overdueTotalCents)}.`,
      companyId: c.id, companyName: c.name,
      action: { kind: "link", href: `/admin/clientes/${c.id}`, label: "Ver cliente" },
    });
  }

  // Cobrança não sincronizada (warning)
  if (c.billingSyncPending) {
    issues.push({
      id: `billing_sync:${c.id}`, severity: "warning", category: "client",
      title: "Cobrança não sincronizada",
      explanation: `A cobrança de ${c.name} não foi atualizada no sistema de pagamento. O valor cobrado pode estar incorreto.`,
      companyId: c.id, companyName: c.name,
      action: { kind: "link", href: `/admin/clientes/${c.id}`, label: "Ver cliente" },
    });
  }

  // Trial vencendo (info) vs vencido (warning)
  const trialPast = c.trialEndsAt !== null && c.trialEndsAt.getTime() < now.getTime();
  if (c.subscriptionStatus === "TRIAL_EXPIRED" || (c.subscriptionStatus === "TRIAL" && trialPast)) {
    issues.push({
      id: `trial_expired:${c.id}`, severity: "warning", category: "client",
      title: "Teste grátis expirado",
      explanation: `O período de teste de ${c.name} acabou. Sem ação, o cliente pode parar de usar o sistema.`,
      companyId: c.id, companyName: c.name,
      action: { kind: "link", href: `/admin/clientes/${c.id}`, label: "Ver cliente" },
    });
  } else if (c.subscriptionStatus === "TRIAL" && c.trialEndsAt !== null) {
    const days = Math.ceil((c.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= TRIAL_WARNING_DAYS) {
      issues.push({
        id: `trial_ending:${c.id}`, severity: "info", category: "client",
        title: "Teste grátis terminando",
        explanation: `O teste de ${c.name} termina em ${days} dia(s). Você pode estender se quiser dar mais tempo.`,
        companyId: c.id, companyName: c.name,
        action: { kind: "blueprint", blueprintId: "extend_trial", label: "Estender +7 dias" },
      });
    }
  }

  // Suspensa (warning) → reativar
  if (c.subscriptionStatus === "SUSPENDED") {
    issues.push({
      id: `suspended:${c.id}`, severity: "warning", category: "client",
      title: "Assinatura suspensa",
      explanation: `A assinatura de ${c.name} está suspensa. O acesso fica limitado até reativar.`,
      companyId: c.id, companyName: c.name,
      action: { kind: "blueprint", blueprintId: "reactivate", label: "Reativar" },
    });
  }

  // Pagamento atrasado (warning) → ainda não suspensa; ver cliente p/ cobrar/decidir.
  // (Sem blueprint dedicado de cobrança — leva à página do cliente, como overdue.)
  if (c.subscriptionStatus === "PAST_DUE") {
    issues.push({
      id: `past_due:${c.id}`, severity: "warning", category: "client",
      title: "Pagamento atrasado",
      explanation: `A assinatura de ${c.name} está com pagamento atrasado. Vale acompanhar antes que seja suspensa.`,
      companyId: c.id, companyName: c.name,
      action: { kind: "link", href: `/admin/clientes/${c.id}`, label: "Ver cliente" },
    });
  }

  // Saúde crítica (warning)
  if (c.healthCategory === "CRITICAL") {
    issues.push({
      id: `health_critical:${c.id}`, severity: "warning", category: "client",
      title: "Cliente em risco de cancelar",
      explanation: `${c.name} está com sinais de baixo uso/engajamento. Vale uma aproximação.`,
      companyId: c.id, companyName: c.name,
      action: { kind: "link", href: `/admin/clientes/${c.id}`, label: "Ver cliente" },
    });
  }

  return issues;
}
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/monitoring/issues.ts src/lib/monitoring/issues.test.ts
git commit -m "feat(monitoring): 6 detectores de problemas de cliente"
```

---

### Task 4: `detectIssues` + `sortIssues` (agregador) — TDD

**Files:**
- Modify: `src/lib/monitoring/issues.ts`
- Test: `src/lib/monitoring/issues.test.ts` (estender)

- [ ] **Step 1: Write the failing test**

```ts
// adicionar em issues.test.ts
import { detectIssues, sortIssues } from "./issues";

describe("detectIssues + ordenação", () => {
  it("combina sistema + clientes", () => {
    const issues = detectIssues({
      pulse: pulse({ db: { status: "degraded", latencyMs: 900 }, status: "degraded" }),
      trends: {} as any,
      problemCompanies: [company({ subscriptionStatus: "SUSPENDED" })],
    }, NOW);
    expect(issues.length).toBe(2);
  });

  it("ordena critical → warning → info; system antes de client no empate", () => {
    const sorted = sortIssues([
      { id: "a", severity: "info", category: "client", title: "", explanation: "" },
      { id: "b", severity: "critical", category: "client", title: "", explanation: "" },
      { id: "c", severity: "warning", category: "client", title: "", explanation: "" },
      { id: "d", severity: "warning", category: "system", title: "", explanation: "" },
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["b", "d", "c", "a"]);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementar**

```ts
// em issues.ts
export interface IssueInput {
  pulse: SystemPulse;
  trends: SystemTrends;
  problemCompanies: ProblemCompany[];
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { critical: 0, warning: 1, info: 2 };
const CATEGORY_RANK: Record<IssueCategory, number> = { system: 0, client: 1 };

export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    return CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
  });
}

export function detectIssues(input: IssueInput, now: Date = new Date()): Issue[] {
  const issues: Issue[] = [];
  issues.push(...detectSystemIssues(input.pulse));
  const errorIssue = detectErrorRateIssue(input.pulse);
  if (errorIssue) issues.push(errorIssue);
  for (const c of input.problemCompanies) {
    issues.push(...detectCompanyIssues(c, now));
  }
  return sortIssues(issues);
}
```

- [ ] **Step 4: Run → PASS** (rodar o arquivo todo: `npm test -- src/lib/monitoring/issues.test.ts`)

- [ ] **Step 5: Commit**

```bash
git add src/lib/monitoring/issues.ts src/lib/monitoring/issues.test.ts
git commit -m "feat(monitoring): detectIssues agregador + ordenação por severidade"
```

---

### Task 5: `getProblemCompanies()` (query + achatamento)

**Files:**
- Create: `src/lib/monitoring/problem-companies.ts`

Nota: sem teste unitário (é I/O puro de Prisma, padrão do projeto não testa queries diretas). A lógica testável (detecção) já tem cobertura. Validar via build + smoke.

ATENÇÃO (do spec §3): `isBlocked`/`healthCategory` são de `Company`; `status`/`trialEndsAt`/`pastDueSince`/`billingSyncPending` são de `Subscription`. Achatar pegando a subscription acionável mais recente. Faturas OVERDUE agregadas por empresa.

- [ ] **Step 1: Ler os nomes exatos das relações** (não confiar de memória)

Run: `grep -nE "subscriptions|model Company|model Subscription|model Invoice" prisma/schema.prisma | head`
Confirmar: nome da relação Company→Subscription (provável `subscriptions`), e Subscription→Invoice (`invoices`).

- [ ] **Step 2: Implementar**

ATENÇÃO (correções da review do plano):
- **Overdue por EMPRESA, não por sub:** uma empresa pode ter várias subscriptions; faturas OVERDUE de QUALQUER uma contam. Buscar TODAS as subs (não `take:1`) só para somar overdue; o achatamento de status usa a sub acionável.
- **Sub "acionável" para status:** priorizar uma sub em status acionável (TRIAL/TRIAL_EXPIRED/PAST_DUE/SUSPENDED) — espelha o `findFirst({where:{status}})` dos blueprints, senão detecção e ação discordam. Fallback: a mais recente.

```ts
// src/lib/monitoring/problem-companies.ts
import { prisma } from "@/lib/prisma";
import type { ProblemCompany } from "./issues";
import type { SubscriptionStatus } from "@prisma/client";

const ACTIONABLE_SUB_STATUS: SubscriptionStatus[] = ["TRIAL", "TRIAL_EXPIRED", "PAST_DUE", "SUSPENDED"];
const TAKE_CAP = 200;

/**
 * Busca empresas em algum estado problemático e achata Company×Subscription×Invoice
 * em ProblemCompany. Best-effort: o caller trata exceção. Cross-tenant (super-admin).
 */
export async function getProblemCompanies(): Promise<ProblemCompany[]> {
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { isBlocked: true },
        { healthCategory: "CRITICAL" },
        { subscriptions: { some: { status: { in: ACTIONABLE_SUB_STATUS } } } },
        { subscriptions: { some: { pastDueSince: { not: null } } } },
        { subscriptions: { some: { billingSyncPending: true } } },
        { subscriptions: { some: { invoices: { some: { status: "OVERDUE" } } } } },
      ],
    },
    take: TAKE_CAP,
    select: {
      id: true, name: true, isBlocked: true, healthCategory: true,
      // TODAS as subscriptions: precisamos de overdue de qualquer uma (por empresa)
      // + escolher a "acionável" para o status. orderBy p/ fallback determinístico.
      subscriptions: {
        orderBy: { createdAt: "desc" },
        select: {
          status: true, trialEndsAt: true, pastDueSince: true, billingSyncPending: true,
          invoices: { where: { status: "OVERDUE" }, select: { total: true } },
        },
      },
    },
  });

  return companies.map((c): ProblemCompany => {
    const subs = c.subscriptions;
    // sub p/ STATUS: a primeira acionável (subs já vem mais-recente-primeiro);
    // fallback: a mais recente; se nenhuma: null.
    const actionableSub = subs.find((s) => ACTIONABLE_SUB_STATUS.includes(s.status)) ?? subs[0] ?? null;
    // sub p/ billingSyncPending: qualquer uma pendente (não só a acionável).
    const anyPendingSync = subs.some((s) => s.billingSyncPending);
    // overdue: AGREGADO de TODAS as subs da empresa.
    const allOverdue = subs.flatMap((s) => s.invoices);
    return {
      id: c.id,
      name: c.name,
      isBlocked: c.isBlocked,
      healthCategory: c.healthCategory,
      subscriptionStatus: actionableSub?.status ?? null,
      trialEndsAt: actionableSub?.trialEndsAt ?? null,
      pastDueSince: actionableSub?.pastDueSince ?? null,
      billingSyncPending: anyPendingSync,
      overdueInvoiceCount: allOverdue.length,
      overdueTotalCents: allOverdue.reduce((s, i) => s + i.total, 0),
    };
  });
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros. (Se a relação não for `subscriptions`/`invoices`, ajustar para o nome real visto no Step 1.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/monitoring/problem-companies.ts
git commit -m "feat(monitoring): getProblemCompanies (achata Company×Subscription×Invoice)"
```

---

### Task 6: Estender o endpoint `/api/admin/observability` com `issues`

**Files:**
- Modify: `src/app/api/admin/observability/route.ts`

- [ ] **Step 1: Adicionar issues ao payload (best-effort)**

Trocar o corpo do `try` por:

```ts
const [pulse, trends, clientHealth, problemCompanies] = await Promise.all([
  getSystemPulse(),
  getSystemTrends(),
  getClientHealthSnapshot(),
  getProblemCompanies().catch(() => []), // best-effort: não derruba o cockpit
]);

const issues = detectIssues({ pulse, trends, problemCompanies });

return NextResponse.json({ data: { pulse, trends, clientHealth, issues } });
```

Adicionar imports no topo:
```ts
import { getProblemCompanies } from "@/lib/monitoring/problem-companies";
import { detectIssues } from "@/lib/monitoring/issues";
```

- [ ] **Step 2: tsc + build**

Run: `npx tsc --noEmit && npm run build`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/observability/route.ts
git commit -m "feat(monitoring): endpoint observability inclui issues detectados"
```

---

### Task 7: `IssueCard` component

**Files:**
- Create: `src/app/admin/monitoramento/issue-card.tsx`

Renderiza um `Issue`. O botão "Resolver" depende do `action.kind`. Tipos definidos localmente (não importar de `@/lib/...` no client → evita prisma no bundle). Reusa `ActionModal` e `BlueprintDescriptor` de `./action-modal`.

- [ ] **Step 1: Implementar**

```tsx
// src/app/admin/monitoramento/issue-card.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, ChevronRight, Info, Wrench } from "lucide-react";
import { ActionModal, type BlueprintDescriptor } from "./action-modal";

export type IssueSeverity = "critical" | "warning" | "info";

export interface IssueAction {
  kind: "blueprint" | "link" | "info";
  blueprintId?: string;
  href?: string;
  label: string;
}

export interface Issue {
  id: string;
  severity: IssueSeverity;
  category: "system" | "client";
  title: string;
  explanation: string;
  companyId?: string;
  companyName?: string;
  action?: IssueAction;
}

const SEV: Record<IssueSeverity, { icon: React.ElementType; ring: string; iconCls: string; chip: string; label: string }> = {
  critical: { icon: AlertCircle, ring: "border-red-500/30 bg-red-500/5", iconCls: "text-red-400", chip: "bg-red-500/15 text-red-300", label: "Urgente" },
  warning: { icon: AlertTriangle, ring: "border-amber-500/30 bg-amber-500/5", iconCls: "text-amber-400", chip: "bg-amber-500/15 text-amber-300", label: "Atenção" },
  info: { icon: Info, ring: "border-blue-500/30 bg-blue-500/5", iconCls: "text-blue-400", chip: "bg-blue-500/15 text-blue-300", label: "Aviso" },
};

interface IssueCardProps {
  issue: Issue;
  // mapa de descritores p/ resolver action.blueprintId (fetch uma vez no cockpit-client)
  blueprints: Record<string, BlueprintDescriptor>;
  onResolved?: () => void;
}

export function IssueCard({ issue, blueprints, onResolved }: IssueCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const sev = SEV[issue.severity];
  const Icon = sev.icon;

  const bp = issue.action?.kind === "blueprint" && issue.action.blueprintId
    ? blueprints[issue.action.blueprintId]
    : undefined;
  // blueprint filtrado por role (ausente no mapa) → esconder o botão de resolver
  const blueprintMissing = issue.action?.kind === "blueprint" && !bp;

  return (
    <div className={`rounded-xl border p-4 ${sev.ring}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${sev.iconCls}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">{issue.title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sev.chip}`}>{sev.label}</span>
          </div>
          <p className="mt-1 text-sm text-gray-400">{issue.explanation}</p>

          {issue.action && (
            <div className="mt-3">
              {issue.action.kind === "link" && issue.action.href && (
                <Link href={issue.action.href} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700">
                  {issue.action.label} <ChevronRight className="h-4 w-4" />
                </Link>
              )}
              {issue.action.kind === "blueprint" && bp && issue.companyId && (
                <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
                  <Wrench className="h-4 w-4" /> {issue.action.label}
                </button>
              )}
              {blueprintMissing && (
                <span className="text-xs text-gray-500" title="Você não tem permissão para esta ação">Sem permissão para resolver</span>
              )}
              {issue.action.kind === "info" && (
                <span className="text-xs text-gray-500">{issue.action.label}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {modalOpen && bp && issue.companyId && (
        <ActionModal
          blueprint={bp}
          companyId={issue.companyId}
          companyName={issue.companyName ?? ""}
          onClose={() => setModalOpen(false)}
          onDone={() => { setModalOpen(false); onResolved?.(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/monitoramento/issue-card.tsx
git commit -m "feat(monitoring): IssueCard (resolver via blueprint/link/info)"
```

---

### Task 8: Cockpit com abas + cards didáticos + wiring

**Files:**
- Modify: `src/app/admin/monitoramento/cockpit-client.tsx`

Quatro mudanças: (a) tipo `Issue` no payload, (b) fetch dos descritores de blueprint uma vez, (c) abas Visão Geral | Resolução, (d) cards didáticos (frase de status + tooltip) com detalhes técnicos recolhíveis + resumo no topo.

- [ ] **Step 1: Adicionar `Issue` ao tipo `Payload`** e importar `IssueCard`/`BlueprintDescriptor`

```ts
import { IssueCard, type Issue } from "./issue-card";
import type { BlueprintDescriptor } from "./action-modal";
// no interface Payload: adicionar `issues: Issue[];`
```

- [ ] **Step 2: Fetch dos descritores (mesmo padrão de company-actions.tsx)**

Dentro de `CockpitClient`, adicionar:
```ts
const [blueprints, setBlueprints] = useState<Record<string, BlueprintDescriptor>>({});
useEffect(() => {
  let alive = true;
  fetch("/api/admin/actions", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { data: [] }))
    .then((json) => {
      if (!alive) return;
      const map: Record<string, BlueprintDescriptor> = {};
      for (const bp of json.data ?? []) map[bp.id] = bp;
      setBlueprints(map);
    })
    .catch(() => {});
  return () => { alive = false; };
}, []);
```

- [ ] **Step 3: Estado de aba + resumo no topo**

```ts
const [tab, setTab] = useState<"overview" | "resolve">("overview");
const issues = data.issues ?? [];
const criticalCount = issues.filter((i) => i.severity === "critical").length;
```

Logo abaixo do `StatusBanner`, um resumo + seletor de abas:
```tsx
<div className="flex items-center gap-2 border-b border-gray-800">
  <TabBtn active={tab === "overview"} onClick={() => setTab("overview")} label="Visão geral" />
  <TabBtn active={tab === "resolve"} onClick={() => setTab("resolve")} label="Resolução" badge={issues.length} critical={criticalCount > 0} />
</div>
```

E o `TabBtn` (componente pequeno no fim do arquivo):
```tsx
function TabBtn({ active, onClick, label, badge, critical }: { active: boolean; onClick: () => void; label: string; badge?: number; critical?: boolean }) {
  return (
    <button onClick={onClick} className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${active ? "text-white" : "text-gray-400 hover:text-gray-200"}`}>
      {label}
      {badge != null && badge > 0 && (
        <span className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${critical ? "bg-red-500/20 text-red-300" : "bg-gray-700 text-gray-300"}`}>{badge}</span>
      )}
      {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-indigo-500" />}
    </button>
  );
}
```

- [ ] **Step 4: Renderizar a aba ativa**

Substituir o bloco das 2 colunas por:
```tsx
{tab === "overview" ? (
  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <SystemColumn pulse={pulse} trends={trends} />
    <ClientColumn clientHealth={clientHealth} />
  </div>
) : (
  <ResolveTab issues={issues} blueprints={blueprints} onResolved={refresh} />
)}
```

E o `ResolveTab`:
```tsx
function ResolveTab({ issues, blueprints, onResolved }: { issues: Issue[]; blueprints: Record<string, BlueprintDescriptor>; onResolved: () => void }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-8 text-center">
        <p className="text-lg font-semibold text-green-300">Tudo certo! 🎉</p>
        <p className="mt-1 text-sm text-gray-400">Nenhum problema precisa da sua atenção agora.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {issues.map((i) => (
        <IssueCard key={i.id} issue={i} blueprints={blueprints} onResolved={onResolved} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Cards didáticos — frase de status + tooltip**

No `MetricCard`, adicionar props opcionais `statusText?: string` e `tip?: string`. Renderizar a frase (com a cor do tone) abaixo do valor e um ícone de ajuda com `title={tip}`. Manter o valor numérico, mas a frase é a leitura principal. Exemplo de chamada (Banco de dados):
```tsx
<MetricCard
  icon={Database} label="Banco de dados"
  value={pulse.db.latencyMs !== null ? `${pulse.db.latencyMs}ms` : "—"}
  tone={pulse.db.status === "ok" ? "good" : pulse.db.status === "degraded" ? "warn" : "bad"}
  statusText={pulse.db.status === "ok" ? "Respondendo rápido" : pulse.db.status === "degraded" ? "Está lento" : "Sem resposta"}
  tip="Tempo que o banco de dados leva para responder. Abaixo de 500ms é saudável."
/>
```
Aplicar `statusText`+`tip` em todos os cards de Sistema e Clientes (textos curtos em pt-BR — ver spec Parte 1). O `hint` técnico (número cru) move-se para dentro de um `<details>` "Ver detalhes técnicos" por coluna, OU permanece como subtexto pequeno — escolher o mais limpo; o importante é a frase clara ser a leitura principal.

- [ ] **Step 6: Verificar tipos + build**

Run: `npx tsc --noEmit && npm run build`
Expected: verde. `/admin/monitoramento` continua como rota dinâmica.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/monitoramento/cockpit-client.tsx
git commit -m "feat(monitoring): cockpit com abas (Visão Geral didática | Resolução) + cards em pt-BR"
```

---

### ✅ Checagem de fim de FASE

- [ ] `npx tsc --noEmit` → sem erros
- [ ] `npm run build` → verde
- [ ] `npm test` → tudo verde (incluindo os novos testes de `issues.test.ts`)
- [ ] Review: dispatch general-purpose (Opus) no diff da fase. Focar: detectores correspondem a blueprints reais (`extend_trial`/`reactivate` existem), best-effort no endpoint, sem prisma no bundle do client, textos didáticos calibrados (claros, não infantis).
- [ ] Smoke (após deploy): logar como admin, abrir `/admin/monitoramento`, ver aba Visão Geral didática + aba Resolução; se houver empresa em trial/suspensa, testar um "Resolver" (modal abre, auditoria grava).
- [ ] Atualizar MEMORY.md com o que foi entregue.
- [ ] Deploy: `vercel deploy --prod` (stash de não-relacionado antes; o build agora roda `prisma migrate deploy` automaticamente).

---

## Não-objetivos (lembrete)
Resolver infra automaticamente; UI editável de limiares; notificações push; ações novas de banco (reprocessar sync vira link p/ cliente); histórico de problemas resolvidos. (Ver spec §Não-objetivos.)
