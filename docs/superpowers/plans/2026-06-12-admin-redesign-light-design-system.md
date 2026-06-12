# Admin Redesign (Tema Claro + Design System) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar a área `/admin` (super-admin do SaaS) de dark mode para tema claro Linear/Vercel, reusando os tokens e componentes que já existem, eliminando duplicação, corrigindo solturas (menu/mobile/hub), tornando o dashboard acionável e removendo código morto — sem quebrar nenhuma funcionalidade.

**Architecture:** A admin é dark apenas porque suas páginas hardcodam literais `bg-gray-950`/`text-gray-400`. O projeto já tem um `:root` claro com tokens semânticos (`--card`, `--foreground`, `--border`, `--primary` teal, `--success/--warning/--info`) e componentes shadcn (`Card`, `StatusBadge`, `Table`, `Sheet`). A migração troca literais por tokens, reusa esses componentes, e adiciona só 4 compositores admin (`KPICard`, `PageHeader`, `FilterBar`, `EmptyState`) + 1 helper (`adminStatusVariant`). Lógica/fetch/queries permanecem intocados em todas as páginas.

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript, Tailwind + CSS variables, shadcn/ui, Recharts (já instalado), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-12-admin-redesign-light-design-system-design.md`

**Comandos do projeto:**
- Testes: `npm test` (vitest run) · arquivo único: `npx vitest run <path>`
- Type check: `npx tsc --noEmit`
- Build: `npm run build`
- Branch de trabalho atual: `chore/import-psvision-armacoes-precos` — **criar branch dedicada** `feat/admin-redesign-light` antes de começar (ver Task 0).

---

## File Structure

**Criados:**
- `src/lib/admin-status.ts` — helper puro `adminStatusVariant(kind, status)` + labels (fonte única de verdade dos badges).
- `src/lib/admin-status.test.ts` — testes do helper.
- `src/components/admin/KPICard.tsx` — card de métrica (ícone + label + valor + tendência + sparkline opcional).
- `src/components/admin/KPICard.test.tsx`
- `src/components/admin/PageHeader.tsx` — título + subtítulo + slot de ações.
- `src/components/admin/PageHeader.test.tsx`
- `src/components/admin/FilterBar.tsx` — `FilterBar` + `FilterChip`.
- `src/components/admin/FilterBar.test.tsx`
- `src/components/admin/EmptyState.tsx` — ícone + mensagem + ação opcional.
- `src/components/admin/EmptyState.test.tsx`
- `src/components/admin/AdminStatusBadge.tsx` — wrapper fino: recebe `kind`+`status`, usa `adminStatusVariant` + `StatusBadge` existente.
- `src/components/admin/AdminSidebar.tsx` — sidebar responsiva (fixa ≥lg, `Sheet` drawer < lg). Extraída do layout.
- `src/components/admin/MrrChart.tsx` — gráfico Recharts (client) para o dashboard.
- `docs/superpowers/admin-smoke-checklist.md` — oráculo de regressão (24 rotas + asserções).

**Modificados (casca apenas, salvo onde indicado):**
- `src/app/admin/layout.tsx` — tokens claros + integra `AdminSidebar`.
- `src/app/admin/admin-nav.tsx` — tokens claros + add 2 itens de menu (Assinaturas, Segurança).
- `src/app/admin/configuracoes/page.tsx` — deixa de ser redirect → hub com cards.
- Todas as `page.tsx`/componentes sob `src/app/admin/**` — literais → tokens + uso dos componentes.
- `src/app/admin/page.tsx` (dashboard) — também ganha gráfico/sparklines/links (Fase 3).

**Removidos (Fase 4, só se confirmado órfão):**
- `src/app/api/admin/audit-logs/route.ts`, `src/app/api/admin/tags/route.ts`, `src/app/api/admin/tags/[id]/route.ts`, `src/app/api/admin/seed/route.ts`, `src/app/api/admin/cash/close-stale-shifts/route.ts` — **somente** após grep confirmar zero consumidor (UI/cron/webhook/test). `notifications/*` **permanece**.

---

## Convenção de mapeamento de literais → tokens

Usar consistentemente em TODAS as substituições de casca:

| Literal dark | Token claro |
|---|---|
| `bg-gray-950` | `bg-background` |
| `bg-gray-900` | `bg-card` |
| `bg-gray-800` (superfície) | `bg-muted` |
| `hover:bg-gray-800` | `hover:bg-muted` |
| `text-white` | `text-foreground` |
| `text-gray-300` | `text-foreground` |
| `text-gray-400` / `text-gray-500` | `text-muted-foreground` |
| `border-gray-800` / `border-gray-700` | `border-border` |
| `bg-indigo-600` / `hover:bg-indigo-700` | `bg-primary` / `hover:bg-primary/90` (teal Vis) |
| `text-indigo-300` / `text-indigo-400` (ativo) | `text-primary` |
| `bg-indigo-600/20` (item ativo) | `bg-primary/10` |
| badges `bg-green-900/50 text-green-400` etc. | `<AdminStatusBadge kind=... status=... />` |

---

## Fase 0 — Fundação (zero impacto visual)

### Task 0: Branch de trabalho

- [ ] **Step 1: Criar branch dedicada**

Run:
```bash
cd "/Users/matheusreboucas/PDV OTICA"
git checkout -b feat/admin-redesign-light
```
Expected: "Switched to a new branch 'feat/admin-redesign-light'"

> Nota: trabalhar em branch dedicada evita as colisões de sessão paralela registradas no histórico do projeto.

---

### Task 1: Helper `adminStatusVariant` (fonte única dos badges)

**Files:**
- Create: `src/lib/admin-status.ts`
- Test: `src/lib/admin-status.test.ts`

Contexto: hoje `STATUS_LABELS` e `STATUS_STYLES` estão duplicados literalmente em `src/app/admin/page.tsx` e `src/app/admin/clientes/page.tsx` (e variações em 4+ outras). O `StatusBadge` existente (`src/components/ui/status-badge.tsx`) aceita `variant: success|warning|info|danger|neutral|premium`. Este helper mapeia o status de domínio → variante + label.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/admin-status.test.ts
import { describe, it, expect } from "vitest";
import { adminStatusVariant, adminStatusLabel } from "./admin-status";

describe("adminStatusVariant", () => {
  it("mapeia status de subscription", () => {
    expect(adminStatusVariant("subscription", "ACTIVE")).toBe("success");
    expect(adminStatusVariant("subscription", "TRIAL")).toBe("info");
    expect(adminStatusVariant("subscription", "PAST_DUE")).toBe("danger");
    expect(adminStatusVariant("subscription", "SUSPENDED")).toBe("danger");
    expect(adminStatusVariant("subscription", "CANCELED")).toBe("neutral");
    expect(adminStatusVariant("subscription", "TRIAL_EXPIRED")).toBe("warning");
    expect(adminStatusVariant("subscription", "NO_SUBSCRIPTION")).toBe("neutral");
  });

  it("mapeia status de invoice", () => {
    expect(adminStatusVariant("invoice", "PAID")).toBe("success");
    expect(adminStatusVariant("invoice", "PENDING")).toBe("warning");
    expect(adminStatusVariant("invoice", "OVERDUE")).toBe("danger");
    expect(adminStatusVariant("invoice", "CANCELED")).toBe("neutral");
    expect(adminStatusVariant("invoice", "DRAFT")).toBe("neutral");
  });

  it("cai em neutral para status desconhecido", () => {
    expect(adminStatusVariant("subscription", "FOOBAR")).toBe("neutral");
  });

  it("retorna label legível", () => {
    expect(adminStatusLabel("subscription", "ACTIVE")).toBe("Ativo");
    expect(adminStatusLabel("invoice", "OVERDUE")).toBe("Vencida");
    expect(adminStatusLabel("subscription", "FOOBAR")).toBe("FOOBAR");
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx vitest run src/lib/admin-status.test.ts`
Expected: FAIL ("Cannot find module './admin-status'")

- [ ] **Step 3: Implementação mínima**

```ts
// src/lib/admin-status.ts
import type { StatusVariant } from "@/components/ui/status-badge";

export type StatusKind = "subscription" | "invoice" | "ticket" | "health";

const VARIANT_MAP: Record<StatusKind, Record<string, StatusVariant>> = {
  subscription: {
    ACTIVE: "success", TRIAL: "info", PAST_DUE: "danger",
    SUSPENDED: "danger", CANCELED: "neutral", TRIAL_EXPIRED: "warning",
    NO_SUBSCRIPTION: "neutral",
  },
  invoice: {
    PAID: "success", PENDING: "warning", OVERDUE: "danger",
    CANCELED: "neutral", DRAFT: "neutral",
  },
  ticket: {
    OPEN: "info", IN_PROGRESS: "warning", WAITING: "warning",
    RESOLVED: "success", CLOSED: "neutral",
  },
  health: {
    THRIVING: "success", HEALTHY: "success", AT_RISK: "warning", CRITICAL: "danger",
  },
};

const LABEL_MAP: Record<StatusKind, Record<string, string>> = {
  subscription: {
    ACTIVE: "Ativo", TRIAL: "Trial", PAST_DUE: "Inadimplente",
    SUSPENDED: "Suspenso", CANCELED: "Cancelado", TRIAL_EXPIRED: "Trial Expirado",
    NO_SUBSCRIPTION: "Sem assinatura",
  },
  invoice: {
    PAID: "Paga", PENDING: "Pendente", OVERDUE: "Vencida",
    CANCELED: "Cancelada", DRAFT: "Rascunho",
  },
  ticket: {
    OPEN: "Aberto", IN_PROGRESS: "Em andamento", WAITING: "Aguardando",
    RESOLVED: "Resolvido", CLOSED: "Fechado",
  },
  health: {
    THRIVING: "Excelente", HEALTHY: "Saudável", AT_RISK: "Em risco", CRITICAL: "Crítico",
  },
};

export function adminStatusVariant(kind: StatusKind, status: string): StatusVariant {
  return VARIANT_MAP[kind]?.[status] ?? "neutral";
}

export function adminStatusLabel(kind: StatusKind, status: string): string {
  return LABEL_MAP[kind]?.[status] ?? status;
}
```

> Verificar antes os valores reais dos enums em `prisma/schema.prisma` (subscription status, invoice status, ticket status, health category). Ajustar as chaves se divergirem. Os valores acima vêm das páginas atuais.

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `npx vitest run src/lib/admin-status.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-status.ts src/lib/admin-status.test.ts
git commit -m "feat(admin): helper adminStatusVariant como fonte única dos badges de status"
```

---

### Task 2: `AdminStatusBadge` (wrapper fino sobre StatusBadge)

**Files:**
- Create: `src/components/admin/AdminStatusBadge.tsx`
- Test: `src/components/admin/AdminStatusBadge.test.tsx`

- [ ] **Step 1: Teste que falha**

```tsx
// src/components/admin/AdminStatusBadge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminStatusBadge } from "./AdminStatusBadge";

describe("AdminStatusBadge", () => {
  it("renderiza o label do status", () => {
    render(<AdminStatusBadge kind="subscription" status="ACTIVE" />);
    expect(screen.getByText("Ativo")).toBeInTheDocument();
  });

  it("aceita label customizado via children", () => {
    render(<AdminStatusBadge kind="invoice" status="PAID">Quitada</AdminStatusBadge>);
    expect(screen.getByText("Quitada")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar — falha** · Run: `npx vitest run src/components/admin/AdminStatusBadge.test.tsx` · Expected: FAIL (módulo inexistente)

- [ ] **Step 3: Implementação**

```tsx
// src/components/admin/AdminStatusBadge.tsx
import { StatusBadge } from "@/components/ui/status-badge";
import { adminStatusVariant, adminStatusLabel, type StatusKind } from "@/lib/admin-status";

interface AdminStatusBadgeProps {
  kind: StatusKind;
  status: string;
  children?: React.ReactNode;
  className?: string;
}

export function AdminStatusBadge({ kind, status, children, className }: AdminStatusBadgeProps) {
  return (
    <StatusBadge variant={adminStatusVariant(kind, status)} className={className}>
      {children ?? adminStatusLabel(kind, status)}
    </StatusBadge>
  );
}
```

- [ ] **Step 4: Rodar — passa** · Run: `npx vitest run src/components/admin/AdminStatusBadge.test.tsx` · Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/components/admin/AdminStatusBadge.tsx src/components/admin/AdminStatusBadge.test.tsx
git commit -m "feat(admin): AdminStatusBadge reusando StatusBadge existente"
```

---

### Task 3: `PageHeader`

**Files:**
- Create: `src/components/admin/PageHeader.tsx`
- Test: `src/components/admin/PageHeader.test.tsx`

- [ ] **Step 1: Teste que falha**

```tsx
// src/components/admin/PageHeader.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renderiza título e subtítulo", () => {
    render(<PageHeader title="Clientes" subtitle="12 empresas" />);
    expect(screen.getByRole("heading", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.getByText("12 empresas")).toBeInTheDocument();
  });

  it("renderiza ações no slot", () => {
    render(<PageHeader title="X" actions={<button>Novo</button>} />);
    expect(screen.getByRole("button", { name: "Novo" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar — falha** · Run: `npx vitest run src/components/admin/PageHeader.test.tsx` · Expected: FAIL

- [ ] **Step 3: Implementação**

```tsx
// src/components/admin/PageHeader.tsx
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Rodar — passa** · Run: `npx vitest run src/components/admin/PageHeader.test.tsx` · Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/components/admin/PageHeader.tsx src/components/admin/PageHeader.test.tsx
git commit -m "feat(admin): PageHeader padronizado"
```

---

### Task 4: `EmptyState`

**Files:**
- Create: `src/components/admin/EmptyState.tsx`
- Test: `src/components/admin/EmptyState.test.tsx`

- [ ] **Step 1: Teste que falha**

```tsx
// src/components/admin/EmptyState.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renderiza mensagem", () => {
    render(<EmptyState icon={Inbox} message="Nenhum cliente" />);
    expect(screen.getByText("Nenhum cliente")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar — falha** · Run: `npx vitest run src/components/admin/EmptyState.test.tsx` · Expected: FAIL

- [ ] **Step 3: Implementação**

```tsx
// src/components/admin/EmptyState.tsx
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 4: Rodar — passa** · Run: `npx vitest run src/components/admin/EmptyState.test.tsx` · Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/components/admin/EmptyState.tsx src/components/admin/EmptyState.test.tsx
git commit -m "feat(admin): EmptyState para listas vazias"
```

---

### Task 5: `FilterBar` + `FilterChip`

**Files:**
- Create: `src/components/admin/FilterBar.tsx`
- Test: `src/components/admin/FilterBar.test.tsx`

Contexto: filtros hoje são `<Link>` com classes ad-hoc (ex.: assinaturas, saúde, faturas, inadimplência). `FilterChip` padroniza o visual de "pílula" ativa/inativa; é um link (não muda a lógica de filtragem por query param que as páginas já usam).

- [ ] **Step 1: Teste que falha**

```tsx
// src/components/admin/FilterBar.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterBar, FilterChip } from "./FilterBar";

describe("FilterBar / FilterChip", () => {
  it("renderiza chips e marca o ativo", () => {
    render(
      <FilterBar>
        <FilterChip href="?s=ACTIVE" active>Ativos</FilterChip>
        <FilterChip href="?s=TRIAL">Trial</FilterChip>
      </FilterBar>
    );
    const ativo = screen.getByRole("link", { name: "Ativos" });
    expect(ativo).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Trial" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar — falha** · Run: `npx vitest run src/components/admin/FilterBar.test.tsx` · Expected: FAIL

- [ ] **Step 3: Implementação**

```tsx
// src/components/admin/FilterBar.tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 mb-4">{children}</div>;
}

interface FilterChipProps {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}

export function FilterChip({ href, active, children }: FilterChipProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-transparent"
          : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
```

- [ ] **Step 4: Rodar — passa** · Run: `npx vitest run src/components/admin/FilterBar.test.tsx` · Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/components/admin/FilterBar.tsx src/components/admin/FilterBar.test.tsx
git commit -m "feat(admin): FilterBar + FilterChip consistentes"
```

---

### Task 6: `KPICard`

**Files:**
- Create: `src/components/admin/KPICard.tsx`
- Test: `src/components/admin/KPICard.test.tsx`

Contexto: substitui os blocos de métrica do dashboard e do financeiro. Usa `Card` existente. Sparkline opcional (Recharts) fica num subcomponente client carregado só quando há dados — mas o KPICard em si pode ser server-safe se não receber sparkline. Para simplicidade e evitar `"use client"` desnecessário no grid de KPIs, o sparkline é uma prop `React.ReactNode` (a página decide passar `<MrrChart compact/>` ou nada).

- [ ] **Step 1: Teste que falha**

```tsx
// src/components/admin/KPICard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Building2 } from "lucide-react";
import { KPICard } from "./KPICard";

describe("KPICard", () => {
  it("renderiza label, valor e ícone", () => {
    render(<KPICard icon={Building2} label="Total de Empresas" value="12" />);
    expect(screen.getByText("Total de Empresas")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renderiza tendência positiva e negativa", () => {
    const { rerender } = render(<KPICard icon={Building2} label="MRR" value="R$ 274" trend={{ direction: "up", label: "+5%" }} />);
    expect(screen.getByText("+5%")).toBeInTheDocument();
    rerender(<KPICard icon={Building2} label="MRR" value="R$ 274" trend={{ direction: "down", label: "-100%" }} />);
    expect(screen.getByText("-100%")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar — falha** · Run: `npx vitest run src/components/admin/KPICard.test.tsx` · Expected: FAIL

- [ ] **Step 3: Implementação**

```tsx
// src/components/admin/KPICard.tsx
import type { LucideIcon } from "lucide-react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: { direction: "up" | "down"; label: string };
  sparkline?: React.ReactNode;
}

export function KPICard({ icon: Icon, label, value, trend, sparkline }: KPICardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground/60" />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold text-foreground tracking-tight">{value}</p>
        {sparkline && <div className="h-8 w-20">{sparkline}</div>}
      </div>
      {trend && (
        <div className={cn(
          "mt-2 inline-flex items-center gap-1 text-xs font-medium",
          trend.direction === "up" ? "text-emerald-600" : "text-rose-600"
        )}>
          {trend.direction === "up" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {trend.label}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Rodar — passa** · Run: `npx vitest run src/components/admin/KPICard.test.tsx` · Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/components/admin/KPICard.tsx src/components/admin/KPICard.test.tsx
git commit -m "feat(admin): KPICard sobre Card existente"
```

---

### Task 7: Checklist de smoke (oráculo de regressão)

**Files:**
- Create: `docs/superpowers/admin-smoke-checklist.md`

- [ ] **Step 1: Escrever o checklist**

Criar o documento enumerando as 24 rotas. Para cada uma, listar: dados que devem carregar, filtros a aplicar + resultado esperado, botões/modais que devem abrir. Modelo por linha:

```markdown
# Admin Smoke Checklist (oráculo de regressão)

Rodar ao fim de cada lote, nas rotas afetadas. Marcar ✅ só se o comportamento for IDÊNTICO ao anterior.

## /admin (dashboard)
- [ ] 5 KPIs carregam números (Empresas, Assinaturas Ativas, MRR, Trial, Recebido)
- [ ] Alerta "cliente em estado crítico" aparece se houver; link leva a /admin/saude
- [ ] "Ações Pendentes" (faturas a vencer) renderiza; link funciona
- [ ] Tabela "Empresas Recentes" lista até 10 com badge de status
- [ ] Botão "Recalcular saúde" dispara sem erro

## /admin/clientes
- [ ] Tabela lista empresas com colunas (nome, CNPJ, plano, MRR, status, saúde, onboarding, tags, usuários)
- [ ] Cada filtro (status/health/onboarding/segment/tag) altera a lista
- [ ] 5 quick-filters aplicam preset
- [ ] Link de cada empresa abre /admin/clientes/[id]

## /admin/clientes/[id]
- [ ] Abas carregam (assinatura, faturas, usuários, filiais, atividade, onboarding, tags)
- [ ] Ações (bloquear/excluir/resync/impersonate) abrem modal/confirmam
... (repetir para as 24 rotas: novo, interessados, usuarios, saude, tickets x3, financeiro x4, relatorios, assinaturas, configuracoes x7)
```

Preencher TODAS as 24 rotas com base no inventário da spec (§3.2). Não resumir — cada rota precisa de asserções concretas.

- [ ] **Step 2: Commit**
```bash
git add docs/superpowers/admin-smoke-checklist.md
git commit -m "docs(admin): checklist de smoke como oráculo de regressão"
```

---

### Task 8: Portão da Fase 0

- [ ] **Step 1: tsc** · Run: `npx tsc --noEmit` · Expected: sem erros
- [ ] **Step 2: testes novos** · Run: `npx vitest run src/lib/admin-status.test.ts src/components/admin/` · Expected: todos PASS
- [ ] **Step 3: suite completa** · Run: `npm test` · Expected: verde (sem regressão; ~750+)
- [ ] **Step 4: build** · Run: `npm run build` · Expected: build verde
- [ ] **Step 5: confirmar isolamento** · `git diff --stat main -- src/app/ src/components/` deve mostrar apenas arquivos novos em `src/components/admin/` e `src/lib/admin-status*` — NENHUMA página existente modificada ainda.

> ⚠️ Checkpoint humano: pausar para o dono revisar os componentes (pode rodar `npm run dev` e ver os testes/Storybook se houver). App/dashboard/landing intocados.

---

## Fase 1a — Casca: layout claro + navegação

### Task 9: Migrar `admin-nav.tsx` para tokens + adicionar itens de menu

**Files:**
- Modify: `src/app/admin/admin-nav.tsx`

- [ ] **Step 1: Adicionar os 2 itens órfãos ao menu**

Em `menuItems`: na seção "Financeiro" ou nova, adicionar `{ href: "/admin/assinaturas", icon: CreditCard, label: "Assinaturas", exact: false }`. Na seção "Configurações", adicionar `{ href: "/admin/configuracoes/seguranca", icon: ShieldCheck, label: "Segurança", exact: false }`. Importar `CreditCard`, `ShieldCheck` de lucide-react.

- [ ] **Step 2: Substituir literais dark por tokens**

Aplicar a tabela de mapeamento. As classes de item ativo/inativo passam a:
```tsx
active
  ? "bg-primary/10 text-primary font-medium"
  : "text-muted-foreground hover:text-foreground hover:bg-muted"
```
E o `text-gray-500 uppercase` do título de seção → `text-muted-foreground`. O dot indicador `bg-indigo-400` → `bg-primary`.

- [ ] **Step 3: tsc + build** · Run: `npx tsc --noEmit && npm run build` · Expected: verde

- [ ] **Step 4: Smoke** · `npm run dev`, abrir `/admin`, confirmar: menu claro, item ativo destacado em teal, links Assinaturas e Segurança aparecem e navegam.

- [ ] **Step 5: Commit**
```bash
git add src/app/admin/admin-nav.tsx
git commit -m "feat(admin): nav em tema claro + itens Assinaturas e Segurança"
```

---

### Task 10: Migrar `layout.tsx` para tokens

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Substituir literais**

`bg-gray-950` → `bg-background`; aside `bg-gray-900 border-gray-800` → `bg-card border-border`; logo box `bg-indigo-600` → `bg-primary`; textos `text-white`/`text-gray-500` → `text-foreground`/`text-muted-foreground`; top bar `border-gray-800 bg-gray-950` → `border-border bg-background`.

- [ ] **Step 2: tsc + build** · Run: `npx tsc --noEmit && npm run build` · Expected: verde
- [ ] **Step 3: Smoke** · Abrir `/admin`: fundo claro, sidebar branca, sino e breadcrumb legíveis.
- [ ] **Step 4: Commit**
```bash
git add src/app/admin/layout.tsx
git commit -m "feat(admin): layout em tema claro"
```

---

### Task 11: `/configuracoes` vira hub (deixa de ser redirect)

**Files:**
- Modify: `src/app/admin/configuracoes/page.tsx`

- [ ] **Step 1: Substituir o redirect por um grid de cards**

Trocar o `redirect(...)` por um Server Component que renderiza `PageHeader` + grid de `Card` linkando para as 6 subseções (Planos, Equipe, Logs, Sincronização, Emails, Segurança), cada card com ícone + título + descrição curta. Usar `Link` envolvendo `Card`.

```tsx
import Link from "next/link";
import { Package, UserCog, ScrollText, RefreshCw, Mail, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/PageHeader";

const SECTIONS = [
  { href: "/admin/configuracoes/planos", icon: Package, title: "Planos", desc: "Gerenciar planos comercializáveis" },
  { href: "/admin/configuracoes/equipe", icon: UserCog, title: "Equipe", desc: "Administradores e permissões" },
  { href: "/admin/configuracoes/logs", icon: ScrollText, title: "Logs", desc: "Auditoria de ações" },
  { href: "/admin/configuracoes/sincronizacao", icon: RefreshCw, title: "Sincronização", desc: "Auto-sync de configurações" },
  { href: "/admin/configuracoes/emails", icon: Mail, title: "Emails", desc: "Emails transacionais do SaaS" },
  { href: "/admin/configuracoes/seguranca", icon: ShieldCheck, title: "Segurança", desc: "MFA da sua conta admin" },
];

export default function ConfiguracoesHubPage() {
  return (
    <div className="p-6">
      <PageHeader title="Configurações" subtitle="Gerencie planos, equipe e integrações" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="p-5 hover:bg-muted transition-colors h-full">
              <s.icon className="h-5 w-5 text-primary" />
              <p className="mt-3 font-medium text-foreground">{s.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: tsc + build** · Run: `npx tsc --noEmit && npm run build` · Expected: verde
- [ ] **Step 3: Smoke** · Abrir `/admin/configuracoes`: grid de 6 cards; cada um navega para a subseção. (Verificar que o item de menu "Config" `exact: true` ainda aponta para cá.)
- [ ] **Step 4: Commit**
```bash
git add src/app/admin/configuracoes/page.tsx
git commit -m "feat(admin): hub de configurações com cards (substitui redirect)"
```

---

### Task 12: Portão da Fase 1a

- [ ] tsc + build + `npm test` verdes.
- [ ] Smoke: navegar `/admin`, `/admin/configuracoes`, e cada link de menu — todas as rotas acessíveis, visual claro, nenhuma rota 404/quebrada.
- [ ] ⚠️ Checkpoint humano para aprovar a casca antes da Fase 1b.

---

## Fase 1b — Sidebar mobile (checkpoint isolado)

### Task 13: Extrair `AdminSidebar` responsiva com `Sheet`

**Files:**
- Create: `src/components/admin/AdminSidebar.tsx`
- Modify: `src/app/admin/layout.tsx`

Contexto: hoje a sidebar é fixa `w-60` no layout (quebra < 768px). Extrair o conteúdo (logo + `AdminNav` + logout) num componente reutilizado em dois lugares: fixa em `lg:flex`, e dentro de um `Sheet` (drawer) acionado por botão hambúrguer em telas pequenas.

- [ ] **Step 1: Criar `AdminSidebar`** (client component) com o conteúdo da sidebar, mais um botão `Menu` (lucide) que em `< lg` abre `Sheet` com o mesmo conteúdo. A versão fixa: `hidden lg:flex`. O `Sheet` trigger: `lg:hidden`.

> Usar os exports reais de `src/components/ui/sheet.tsx` (`Sheet`, `SheetTrigger`, `SheetContent`). Conferir antes de codar.

- [ ] **Step 2: Atualizar `layout.tsx`** para usar `<AdminSidebar />` no lugar do `<aside>` fixo; garantir que o botão hambúrguer fique na top bar em mobile.

- [ ] **Step 3: tsc + build** · Run: `npx tsc --noEmit && npm run build` · Expected: verde

- [ ] **Step 4: Smoke responsivo** · `npm run dev`: em desktop (≥1024px) sidebar fixa visível; redimensionar < 768px → sidebar some, hambúrguer aparece, abre drawer, navega, fecha. Nenhuma rota fica inacessível.

- [ ] **Step 5: Commit**
```bash
git add src/components/admin/AdminSidebar.tsx src/app/admin/layout.tsx
git commit -m "feat(admin): sidebar responsiva com drawer mobile (Sheet)"
```

---

### Task 14: Portão da Fase 1b
- [ ] tsc + build + `npm test` verdes.
- [ ] Smoke mobile + desktop conforme checklist.
- [ ] ⚠️ Checkpoint humano.

---

## Fase 2 — Migração de páginas (lotes)

> **Regra de cada página:** trocar SOMENTE a casca (literais → tokens, divs → componentes). NÃO tocar em `requireAdmin()`, queries Prisma, fetch, cálculos, handlers. Onde houver `STATUS_STYLES`/`STATUS_LABELS` local, REMOVER e usar `<AdminStatusBadge>`. Validar cada página contra o checklist de smoke (Task 7).

### Task 15: Lote A — Dashboard, Clientes (lista), Assinaturas, Usuários

**Files (modify):**
- `src/app/admin/page.tsx`
- `src/app/admin/clientes/page.tsx` (+ extrair filtros/tabela em subcomponentes — ver nota)
- `src/app/admin/assinaturas/page.tsx`
- `src/app/admin/usuarios/page.tsx`

- [ ] **Step 1 (por página): substituir literais por tokens** conforme tabela.
- [ ] **Step 2 (por página): substituir blocos de KPI por `<KPICard>`**, badges por `<AdminStatusBadge>`, títulos por `<PageHeader>`, filtros por `<FilterBar>/<FilterChip>`, vazios por `<EmptyState>`, tabelas por `Table`/`responsive-table`.
- [ ] **Step 3: remover `STATUS_STYLES`/`STATUS_LABELS` locais** do dashboard e clientes (agora vêm do helper).
- [ ] **Step 4: clientes/page.tsx (394 linhas)** — extrair a barra de filtros em `clientes/ClientesFilters.tsx` e a tabela em `clientes/ClientesTable.tsx` (mesma lógica, só recorte). Manter o fetch no Server Component da page.
- [ ] **Step 5: tsc + build** · Run: `npx tsc --noEmit && npm run build` · Expected: verde
- [ ] **Step 6: testes** · Run: `npm test` · Expected: verde
- [ ] **Step 7: Smoke (checklist Lote A)** — confirmar dados/filtros/links idênticos nas 4 rotas.
- [ ] **Step 8: Commit**
```bash
git add src/app/admin/page.tsx src/app/admin/clientes/ src/app/admin/assinaturas/page.tsx src/app/admin/usuarios/page.tsx
git commit -m "feat(admin): lote A migrado para tema claro + componentes (dashboard, clientes, assinaturas, usuarios)"
```

---

### Task 16: Lote B — Financeiro (visão/faturas/inadimplência), Saúde

**Files (modify):**
- `src/app/admin/financeiro/page.tsx`
- `src/app/admin/financeiro/faturas/page.tsx`
- `src/app/admin/financeiro/faturas/[id]/page.tsx`
- `src/app/admin/financeiro/faturas/nova/page.tsx`
- `src/app/admin/financeiro/inadimplencia/page.tsx`
- `src/app/admin/saude/page.tsx`

- [ ] Mesmos steps do Lote A (literais→tokens, KPICard, AdminStatusBadge, FilterBar, EmptyState, Table). Faturas usa `kind="invoice"`; saúde usa `kind="health"`.
- [ ] tsc + build + `npm test` verdes.
- [ ] Smoke (checklist Lote B).
- [ ] **Commit:** `feat(admin): lote B migrado (financeiro + saúde)`

---

### Task 17: Lote C — Suporte/Tickets, Relatórios, Interessados

**Files (modify):**
- `src/app/admin/suporte/tickets/page.tsx`, `tickets/[id]/page.tsx`, `tickets/novo/page.tsx`
- `src/app/admin/relatorios/page.tsx`
- `src/app/admin/interessados/page.tsx`

- [ ] Mesmos steps. Tickets usa `kind="ticket"`.
- [ ] tsc + build + `npm test` verdes.
- [ ] Smoke (checklist Lote C).
- [ ] **Commit:** `feat(admin): lote C migrado (tickets, relatórios, interessados)`

---

### Task 18: Lote D — Configurações (subpáginas) + `clientes/[id]`

**Files (modify):**
- `src/app/admin/configuracoes/planos/page.tsx` (+ `planos-client.tsx`)
- `src/app/admin/configuracoes/equipe/page.tsx` (+ `equipe-client.tsx`)
- `src/app/admin/configuracoes/logs/page.tsx`
- `src/app/admin/configuracoes/sincronizacao/page.tsx` (+ client)
- `src/app/admin/configuracoes/emails/page.tsx` (+ client)
- `src/app/admin/configuracoes/seguranca/page.tsx`
- `src/app/admin/clientes/[id]/page.tsx` (594 linhas — quebrar) + componentes `company-*.tsx`
- `src/app/admin/clientes/novo/` (form)

- [ ] Mesmos steps de casca nas subpáginas de config + clientes/novo.
- [ ] **`clientes/[id]/page.tsx` (maior risco):** migrar casca E confirmar que cada aba (`company-tabs`, `company-users`, `company-branches`, `company-notes`, `company-data-form`, `company-network`, `company-timeline`, `company-onboarding`, `company-tags`, `company-actions`) carrega os mesmos dados. A page já delega para esses componentes — migrar cada um para tokens individualmente, commitando em sub-passos se necessário. NÃO alterar a lógica de cada aba.
- [ ] tsc + build + `npm test` verdes.
- [ ] Smoke detalhado do `clientes/[id]` (todas as abas + ações) + subpáginas de config.
- [ ] **Commit:** `feat(admin): lote D migrado (configurações + detalhe de cliente)`

---

### Task 19: Varredura final de literais dark

- [ ] **Step 1: grep por literais remanescentes**

Run:
```bash
grep -rnE 'bg-gray-(950|900|800|700)|text-gray-(300|400|500)|border-gray-(800|700)|bg-indigo-|text-indigo-' src/app/admin src/components/admin
```
Expected: vazio (ou só ocorrências justificadas e revisadas). Corrigir o que sobrar.

- [ ] **Step 2: tsc + build + test** verdes.
- [ ] **Step 3: Commit** (se houve correções): `chore(admin): varredura final de literais dark`

---

### Task 20: Portão da Fase 2
- [ ] tsc + build + `npm test` verdes.
- [ ] Checklist de smoke COMPLETO (24 rotas) revisado.
- [ ] Passe Playwright/`browse` leve nas rotas principais (header renderiza, 1 ação por rota sem erro de console).
- [ ] ⚠️ Checkpoint humano — aprovar visual completo antes da Fase 3.

---

## Fase 3 — Dashboard acionável

### Task 21: `MrrChart` (Recharts)

**Files:**
- Create: `src/components/admin/MrrChart.tsx`
- Test: `src/components/admin/MrrChart.test.tsx`

Contexto: `recharts@3` já instalado. Componente client que recebe `data: { month: string; mrr: number }[]` e renderiza um `AreaChart`/`LineChart` responsivo. Versão `compact` (sem eixos) serve de sparkline no `KPICard`.

- [ ] **Step 1: Teste que falha** (render com dados mock, assert que renderiza container sem crashar — testar Recharts em jsdom exige `ResponsiveContainer` com width/height fixos no teste).

```tsx
// src/components/admin/MrrChart.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MrrChart } from "./MrrChart";

describe("MrrChart", () => {
  it("renderiza sem crashar com dados", () => {
    const { container } = render(
      <MrrChart data={[{ month: "Jan", mrr: 100 }, { month: "Fev", mrr: 200 }]} />
    );
    expect(container.querySelector(".recharts-responsive-container") || container.firstChild).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar — falha** · Run: `npx vitest run src/components/admin/MrrChart.test.tsx`
- [ ] **Step 3: Implementar** o componente (`"use client"`, `ResponsiveContainer` + `AreaChart`, cor `hsl(var(--primary))`, prop `compact` que esconde eixos/grid).
- [ ] **Step 4: Rodar — passa**
- [ ] **Step 5: Commit:** `feat(admin): MrrChart (Recharts) para o dashboard`

---

### Task 22: Série histórica de MRR + tornar dashboard acionável

**Files:**
- Modify: `src/app/admin/page.tsx`
- Possivelmente: `src/lib/admin-metrics.ts` (adicionar função que computa MRR por mês dos últimos N meses)

- [ ] **Step 1:** adicionar em `admin-metrics.ts` uma função pura `computeMrrSeries(subscriptions, months)` + teste unitário (TDD: teste primeiro, falha, implementa, passa).
- [ ] **Step 2:** no dashboard, buscar a série e renderizar `<MrrChart>` num `Card`; opcionalmente passar `compact` sparkline ao `KPICard` de MRR.
- [ ] **Step 3:** tornar os blocos "Ações Pendentes" e o alerta de "cliente crítico" **links** (`Link`) para `/admin/financeiro/faturas?status=...` e `/admin/saude`. Confirmar que os destinos aceitam esses query params (senão, linkar para a rota base).
- [ ] **Step 4:** tsc + build + `npm test` verdes.
- [ ] **Step 5:** Smoke — gráfico aparece com dados reais, números do KPI batem com os atuais, links navegam ao destino certo.
- [ ] **Step 6: Commit:** `feat(admin): dashboard acionável (gráfico MRR + ações clicáveis)`

---

### Task 23: Portão da Fase 3
- [ ] tsc + build + `npm test` verdes.
- [ ] Smoke do dashboard: valores idênticos aos anteriores, gráfico correto, links corretos.
- [ ] ⚠️ Checkpoint humano.

---

## Fase 4 — Limpeza de código morto (por último, com rede)

### Task 24: Confirmar órfãos antes de remover

- [ ] **Step 1: grep amplo de consumidores** para cada candidata:

Run (repetir por rota):
```bash
grep -rn "admin/audit-logs" src/ --include=*.ts --include=*.tsx | grep -v "api/admin/audit-logs/route.ts"
grep -rn "admin/tags" src/ --include=*.ts --include=*.tsx | grep -v "api/admin/tags/"
grep -rn "admin/seed" src/ --include=*.ts --include=*.tsx | grep -v "api/admin/seed/route.ts"
grep -rn "close-stale-shifts" src/ vercel.json | grep -v "route.ts"
```
Expected: cada um vazio = órfão confirmado. **Qualquer hit (UI, cron, webhook, teste) = NÃO remover.** Verificar também `vercel.json`/crons.

- [ ] **Step 2: confirmar `notifications/*` é usada** (deve ter hit na NotificationBell) → **não** remover.

- [ ] **Step 3: remover só o confirmadamente órfão.**

```bash
# exemplo — só os que o grep confirmou vazios:
git rm src/app/api/admin/audit-logs/route.ts
git rm -r src/app/api/admin/tags
# etc.
```

- [ ] **Step 4: tsc + build + `npm test`** · Expected: verde (nada quebrou — confirma que eram mortos).
- [ ] **Step 5: Commit:** `chore(admin): remover rotas API órfãs confirmadas (preserva notifications)`

---

### Task 25: Portão final + entrega

- [ ] tsc limpo, build verde, `npm test` verde, checklist de smoke completo ✅.
- [ ] `grep` de literais dark (Task 19) vazio.
- [ ] ⚠️ Checkpoint humano final — aprovar para deploy.
- [ ] Deploy só após aprovação manual do dono (`vercel deploy --prod` — deploy é manual neste projeto; push não deploya).
- [ ] Atualizar MEMORY do projeto com o resultado (arquivo + linha no índice).

---

## Notas de segurança (recapitulação)
- Cada Task de página é **só casca**: lógica/fetch/queries intocados.
- Portão por fase: tsc + build + suite ~750 + checklist de smoke + Playwright leve + review.
- Limpeza de código morto isolada no fim, condicionada a grep confirmando zero consumidor; `notifications/*` preservada.
- Branch dedicada; deploy manual só com aprovação.
