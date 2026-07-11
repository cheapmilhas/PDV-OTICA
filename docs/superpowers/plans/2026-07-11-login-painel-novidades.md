# Painel de Novidades no Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um painel estático de novidades ao lado do formulário de login dos lojistas (desktop), que some no mobile e esconde a novidade quando ela fica velha (>14 dias).

**Architecture:** Três peças novas — um arquivo de conteúdo tipado (`login-panel-content.ts`), um helper de datas puro (`relative-date.ts`), e um componente de apresentação (`login-side-panel.tsx`) — mais uma alteração puramente visual no container do `page.tsx`. A lógica next-auth não é tocada. O painel decide sozinho quando renderizar a novidade a partir da data.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind, shadcn/ui, vitest (+ jsdom/testing-library para o componente).

**Environment notes:** Branch `feat/login-painel-novidades` (a partir de `feat/login-redesign`). Sem migração, sem env vars. INVARIANTE: NÃO tocar em `signIn`/`signOut`/`handleSubmit`/`formData`/`handleClearSession` em `page.tsx` — só o JSX do container/layout. Comando de teste: `npm test` (= `vitest run`). Testes co-localizados (`.test.ts` ao lado do código). Spec: `docs/superpowers/specs/2026-07-11-login-painel-novidades-design.md`.

---

## File Structure

- Create: `src/lib/relative-date.ts` — helper puro `daysAgo` + `formatRelative`.
- Create: `src/lib/relative-date.test.ts` — testes do helper.
- Create: `src/app/(auth)/login/login-panel-content.ts` — conteúdo tipado (releases + tipos).
- Create: `src/app/(auth)/login/login-side-panel.tsx` — componente `<aside>` de apresentação.
- Create: `src/app/(auth)/login/login-side-panel.test.tsx` — testes do componente.
- Modify: `src/app/(auth)/login/page.tsx` — só o container/layout (2 colunas em `lg+`).

---

## Task 1: Helper de datas (`relative-date.ts`)

**Files:**
- Create: `src/lib/relative-date.ts`
- Test: `src/lib/relative-date.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { daysAgo, formatRelative } from "./relative-date";

// Ancora "hoje" para tornar o teste determinístico.
const HOJE = "2026-07-11";

describe("daysAgo", () => {
  it("retorna 0 para a mesma data", () => {
    expect(daysAgo("2026-07-11", HOJE)).toBe(0);
  });
  it("retorna 12 para 12 dias atrás", () => {
    expect(daysAgo("2026-06-29", HOJE)).toBe(12);
  });
  it("retorna null para data futura", () => {
    expect(daysAgo("2026-07-20", HOJE)).toBeNull();
  });
  it("retorna null para data inválida", () => {
    expect(daysAgo("não-é-data", HOJE)).toBeNull();
  });
});

describe("formatRelative", () => {
  it("dia 0 => 'hoje'", () => {
    expect(formatRelative("2026-07-11", HOJE)).toBe("hoje");
  });
  it("1 dia => 'há 1 dia' (singular)", () => {
    expect(formatRelative("2026-07-10", HOJE)).toBe("há 1 dia");
  });
  it("N dias => 'há N dias' (plural)", () => {
    expect(formatRelative("2026-06-29", HOJE)).toBe("há 12 dias");
  });
  it("data inválida/futura => string vazia", () => {
    expect(formatRelative("2026-07-20", HOJE)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/relative-date.test.ts`
Expected: FAIL — "does not provide an export named 'daysAgo'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/relative-date.ts
// Helper puro de datas para o painel de novidades do login.
// `today` é injetável para testes determinísticos; default = agora.

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Dias inteiros desde `date` até `today`. null se inválida ou futura. */
export function daysAgo(date: string, today: string = new Date().toISOString().slice(0, 10)): number | null {
  const then = Date.parse(`${date}T00:00:00`);
  const now = Date.parse(`${today}T00:00:00`);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  const diff = Math.floor((now - then) / MS_PER_DAY);
  return diff < 0 ? null : diff;
}

/** "hoje" | "há 1 dia" | "há N dias" | "" (inválida/futura). */
export function formatRelative(date: string, today?: string): string {
  const d = daysAgo(date, today);
  if (d === null) return "";
  if (d === 0) return "hoje";
  if (d === 1) return "há 1 dia";
  return `há ${d} dias`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/relative-date.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/relative-date.ts src/lib/relative-date.test.ts
git commit -m "feat(login-painel): helper relative-date (daysAgo/formatRelative)"
```

---

## Task 2: Conteúdo tipado (`login-panel-content.ts`)

**Files:**
- Create: `src/app/(auth)/login/login-panel-content.ts`

Sem teste próprio (é dado + tipos; o TypeScript valida a forma). Consumido nos testes da Task 3.

- [ ] **Step 1: Write the content file**

```ts
// src/app/(auth)/login/login-panel-content.ts
// Fonte de verdade do painel de novidades do login. O dono edita SÓ este arquivo
// e faz commit+deploy. Linguagem de balcão, não release notes técnicas.

export interface LoginRelease {
  /** ISO "YYYY-MM-DD". */
  date: string;
  /** Título curto, linguagem de balcão. */
  title: string;
  /** 2-3 bullets, TEXTO PURO (sem links). */
  items: string[];
}

export interface LoginPanelContent {
  /** Idealmente mais recente primeiro; o componente ordena defensivamente por date desc. */
  releases: LoginRelease[];
}

export const loginPanelContent: LoginPanelContent = {
  releases: [
    {
      date: "2026-07-10",
      title: "Estoque por filial mais claro",
      items: [
        "Agora você escolhe em qual filial o produto entra no cadastro.",
        "Transferências entre filiais ficaram mais fáceis de encontrar.",
      ],
    },
  ],
};
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erros relacionados a `login-panel-content.ts`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(auth)/login/login-panel-content.ts"
git commit -m "feat(login-painel): conteúdo tipado do painel de novidades"
```

---

## Task 3: Componente do painel (`login-side-panel.tsx`)

**Files:**
- Create: `src/app/(auth)/login/login-side-panel.tsx`
- Test: `src/app/(auth)/login/login-side-panel.test.tsx`

Regras (do spec): ordena `releases` por `date` desc; pega a mais recente; se idade ≤ `MAX_RELEASE_AGE_DAYS` (14) mostra o card de novidade, senão esconde (mostra só marca + suporte). Renderiza SÓ a mais recente. Rodapé de suporte só aparece quando `WHATSAPP_NUMBER` não é o placeholder. `<aside>` + `<h2>`. Some no mobile via `hidden lg:flex`.

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginSidePanel } from "./login-side-panel";
import type { LoginPanelContent } from "./login-panel-content";

const HOJE = "2026-07-11";
const fresh: LoginPanelContent = { releases: [{ date: "2026-07-01", title: "Novo X", items: ["a", "b"] }] }; // 10 dias
const borderIn: LoginPanelContent = { releases: [{ date: "2026-06-27", title: "Borda 14", items: ["a"] }] }; // 14 dias
const borderOut: LoginPanelContent = { releases: [{ date: "2026-06-26", title: "Borda 15", items: ["a"] }] }; // 15 dias
const unordered: LoginPanelContent = { releases: [
  { date: "2026-06-01", title: "Velha", items: ["x"] },
  { date: "2026-07-05", title: "Recente", items: ["y"] }, // 6 dias — deve vencer
] };

describe("LoginSidePanel", () => {
  it("mostra a novidade quando fresca (10 dias)", () => {
    render(<LoginSidePanel content={fresh} today={HOJE} />);
    expect(screen.getByText("Novo X")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Novidades" })).toBeTruthy();
  });
  it("FRONTEIRA: 14 dias ainda mostra", () => {
    render(<LoginSidePanel content={borderIn} today={HOJE} />);
    expect(screen.getByText("Borda 14")).toBeTruthy();
  });
  it("FRONTEIRA: 15 dias esconde a novidade", () => {
    render(<LoginSidePanel content={borderOut} today={HOJE} />);
    expect(screen.queryByText("Borda 15")).toBeNull();
  });
  it("sem releases: não quebra e não mostra novidade", () => {
    render(<LoginSidePanel content={{ releases: [] }} today={HOJE} />);
    expect(screen.queryByRole("heading", { name: "Novidades" })).toBeNull();
  });
  it("ordena defensivamente: usa a de date mais recente, não releases[0]", () => {
    render(<LoginSidePanel content={unordered} today={HOJE} />);
    expect(screen.getByText("Recente")).toBeTruthy();
    expect(screen.queryByText("Velha")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "src/app/(auth)/login/login-side-panel.test.tsx"`
Expected: FAIL — módulo `./login-side-panel` não existe.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/app/(auth)/login/login-side-panel.tsx
import Image from "next/image";
import { Sparkles, MessageCircle } from "lucide-react";
import { WHATSAPP_NUMBER, WHATSAPP_URL } from "@/lib/constants";
import { daysAgo, formatRelative } from "@/lib/relative-date";
import type { LoginPanelContent } from "./login-panel-content";

const MAX_RELEASE_AGE_DAYS = 14;
const SUPPORT_PLACEHOLDER = "5585999999999";

interface LoginSidePanelProps {
  content: LoginPanelContent;
  /** Injetável para testes; default = hoje. */
  today?: string;
}

export function LoginSidePanel({ content, today }: LoginSidePanelProps) {
  // Ordena defensivamente por date desc (não confia na ordem do array).
  const latest = [...content.releases]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];

  const age = latest ? daysAgo(latest.date, today) : null;
  const showRelease = latest != null && age !== null && age <= MAX_RELEASE_AGE_DAYS;
  const showSupport = WHATSAPP_NUMBER !== SUPPORT_PLACEHOLDER;

  return (
    <aside
      aria-label="Novidades e suporte"
      className="hidden lg:flex w-80 flex-col justify-center gap-6 rounded-2xl border border-slate-200/70 bg-white/60 p-8"
      style={{ borderColor: "var(--lp-border)" }}
    >
      <Image src="/vis-logo.png" alt="Vis" width={100} height={33} style={{ height: 33, width: "auto" }} />

      {showRelease && latest && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" aria-hidden="true" style={{ color: "var(--brand-primary)" }} />
            <h2 className="text-sm font-semibold text-slate-900">Novidades</h2>
            <span className="ml-auto text-xs text-muted-foreground">{formatRelative(latest.date, today)}</span>
          </div>
          <p className="text-sm font-medium text-slate-800">{latest.title}</p>
          <ul className="space-y-1.5">
            {latest.items.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span aria-hidden="true" style={{ color: "var(--brand-primary)" }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showSupport && (
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Precisa de ajuda? Falar no suporte
        </a>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "src/app/(auth)/login/login-side-panel.test.tsx"`
Expected: PASS (5 tests). NOTA: o teste do guard de suporte real depende de `WHATSAPP_NUMBER` ser o placeholder no momento (é) — então `showSupport` é `false` e o link não renderiza. Se quiser um teste explícito do guard, ver Step 5.

- [ ] **Step 5: Add support-guard test (ambos os ramos, à prova de troca de número)**

O guard depende de `WHATSAPP_NUMBER`. NÃO testar contra o valor real (quebra no dia em que o dono trocar o número — falso-vermelho não relacionado). Em vez disso, mockar `@/lib/constants` para cobrir os DOIS ramos independente do valor real. Criar um arquivo de teste separado (mock por-módulo é mais limpo isolado):

Criar `src/app/(auth)/login/login-side-panel.support.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LoginPanelContent } from "./login-panel-content";

const HOJE = "2026-07-11";
const fresh: LoginPanelContent = { releases: [{ date: "2026-07-01", title: "Novo X", items: ["a"] }] };

afterEach(() => vi.resetModules());

describe("LoginSidePanel — guard de suporte", () => {
  it("esconde o link quando WHATSAPP_NUMBER é o placeholder", async () => {
    vi.doMock("@/lib/constants", () => ({
      WHATSAPP_NUMBER: "5585999999999",
      WHATSAPP_URL: "https://wa.me/5585999999999",
    }));
    const { LoginSidePanel } = await import("./login-side-panel");
    render(<LoginSidePanel content={fresh} today={HOJE} />);
    expect(screen.queryByText(/Falar no suporte/)).toBeNull();
  });

  it("mostra o link quando WHATSAPP_NUMBER é um número real", async () => {
    vi.doMock("@/lib/constants", () => ({
      WHATSAPP_NUMBER: "5511988887777",
      WHATSAPP_URL: "https://wa.me/5511988887777",
    }));
    const { LoginSidePanel } = await import("./login-side-panel");
    render(<LoginSidePanel content={fresh} today={HOJE} />);
    expect(screen.getByText(/Falar no suporte/)).toBeTruthy();
  });
});
```

Run: `npm test -- "src/app/(auth)/login/login-side-panel.support.test.tsx"`
Expected: PASS (2 tests). Este arquivo é imune à troca do número real porque mocka a constante.

NOTA: por isso o teste principal (Task 3 Step 1) NÃO deve assertar sobre o link de suporte — o guard tem cobertura própria aqui.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/login/login-side-panel.tsx" "src/app/(auth)/login/login-side-panel.test.tsx" "src/app/(auth)/login/login-side-panel.support.test.tsx"
git commit -m "feat(login-painel): componente LoginSidePanel (aside a11y, some >14d, guard suporte)"
```

---

## Task 4: Integração visual no `page.tsx`

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

APENAS o container/layout. NÃO tocar em imports de auth, handlers, estado do form.

- [ ] **Step 1: Add imports**

No topo de `page.tsx`, junto aos imports existentes:

```tsx
import { LoginSidePanel } from "./login-side-panel";
import { loginPanelContent } from "./login-panel-content";
```

- [ ] **Step 2: Wrap the card in a 2-column container**

Localize o container externo atual (aprox. linha 96-104):

```tsx
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#EAF0FB] via-white to-[#E6FAFF] p-4">
      <div className="w-full max-w-md">
        <Card className="w-full border-slate-200/80 shadow-xl shadow-slate-900/[0.06]">
```

Substitua a abertura por (mantendo o `<Card>...</Card>` e tudo dentro INALTERADO):

```tsx
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#EAF0FB] via-white to-[#E6FAFF] p-4">
      <div className="flex w-full max-w-4xl items-center justify-center gap-8 lg:justify-between">
        <div className="w-full max-w-md">
          <Card className="w-full border-slate-200/80 shadow-xl shadow-slate-900/[0.06]">
```

E no fechamento do bloco (onde antes fechava `</div>` do `max-w-md`), adicione o painel como irmão do card. Localize o fechamento atual do wrapper e ajuste para:

```tsx
        </div>
        <LoginSidePanel content={loginPanelContent} />
      </div>
    </div>
```

NOTA para o implementador: o `max-w-md` continua envolvendo SÓ o card (mobile inalterado — o `LoginSidePanel` tem `hidden lg:flex`, então no mobile o flex container só contém o card centrado). Confira a contagem de `</div>` após a edição.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erros.

- [ ] **Step 4: Verify auth untouched**

Run: `git diff "src/app/(auth)/login/page.tsx" | grep -E "^[-+].*(signIn|signOut|handleSubmit|formData|handleClearSession)"`
Expected: NENHUMA linha (só o layout mudou; se aparecer algo, reverter essa parte).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/login/page.tsx"
git commit -m "feat(login-painel): integra painel de novidades no layout do login (2 colunas lg+)"
```

---

## Task 5: Full Verification (MANDATORY)

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erros.

- [ ] **Step 2: Suíte de testes completa**

Run: `npm test`
Expected: todos passam (incluindo os novos de `relative-date` e `login-side-panel`).

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: sucesso.

- [ ] **Step 4: Codex review do diff (dupla)**

A dupla Claude+Codex está ativa. Rodar review adversarial do diff completo:
`export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH"; codex exec --sandbox read-only "revise adversarialmente este diff — foco: a11y do aside, a integração não quebrou o layout mobile, o guard de suporte, e confirme que a lógica next-auth NÃO foi tocada. $(git diff feat/login-redesign..HEAD)" </dev/null`
Corrigir achados reais; rejeitar falso-positivo com justificativa.

- [ ] **Step 5: Commit final**

```bash
git add -A && git commit -m "chore(login-painel): verificação final (typecheck+testes+build+codex)" || echo "nada a commitar"
```
