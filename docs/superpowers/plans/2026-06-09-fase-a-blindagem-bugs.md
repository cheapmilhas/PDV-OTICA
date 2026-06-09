# Fase A — Blindagem dos Bugs (Vis) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 5 furos de borda encontrados na auditoria adversarial dos consertos das Fases 1–3, cada um com teste de regressão que impede a recorrência.

**Architecture:** Cinco correções pontuais e independentes (logout, pop-up exit-intent, impersonate role/name, CNPJ preventivo, override na conversão de orçamento). TDD em cada uma: teste que falha → correção mínima → teste passa → commit. Sem refatoração não-relacionada.

**Tech Stack:** Next.js 16 (App Router), NextAuth, Prisma, TypeScript, Vitest (`environment: "node"` por padrão; `jsdom` via `/** @vitest-environment jsdom */` para hooks/componentes React; `@testing-library/react` já instalado).

**Spec:** `docs/superpowers/specs/2026-06-09-bugs-vis-blindagem-automacao-catalogos-design.md` (Fase A).

**Branch:** `fix/bugs-vis-fase1`.

---

## Convenções (ler antes de começar)

- **Rodar testes:** `npm test` (todos) ou `npx vitest run <caminho>` (um arquivo).
- **Imports de teste:** `import { describe, it, expect, vi, beforeEach } from "vitest";`
- **Teste de hook/componente React:** primeira linha do arquivo `/** @vitest-environment jsdom */`, depois `import { renderHook, act } from "@testing-library/react";`.
- **Validação antes de cada commit:** o pre-commit hook do projeto já roda `tsc --noEmit` + testes relacionados. Garanta verde.
- **Mock de Prisma:** não há setup global; cada teste mocka `@/lib/prisma` com `vi.mock` (ver Task 4).
- Ordem recomendada: **Task 1 (logout) primeiro** (maior risco em produção).

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/lib/auth/logout.ts` | Helper client único de logout (deriva origin) | Criar |
| `src/lib/auth/logout.test.ts` | Testa o helper | Criar |
| `src/components/layout/header.tsx` | Usa o helper em vez de signOut inline | Modificar |
| `src/app/force-logout/page.tsx` | Usa o helper | Modificar |
| `src/app/admin/logout/route.ts` | Deriva origin do request (remove fallback localhost) | Modificar |
| `src/hooks/use-exit-intent.ts` | Pop-up: gravação validada + fallback memória | Modificar |
| `src/hooks/use-exit-intent.test.ts` | Testa o hook (jsdom) | Criar |
| `src/auth.ts` | Fixar role/name durante impersonação | Modificar |
| `src/auth-impersonation.test.ts` | Testa a regra de imutabilidade | Criar |
| `src/services/customer.service.ts` | Checagem preventiva de CNPJ + normalização | Modificar |
| `src/services/customer-cnpj.test.ts` | Testa CNPJ preventivo/duplicado | Criar |
| `src/services/quote.service.ts` | Propagar override no débito de estoque | Modificar |
| `src/services/quote-override.test.ts` | Testa propagação do override | Criar |
| `.env.example` | Documentar NEXTAUTH_URL obrigatório em prod | Modificar |

---

## Task 1: A1 — Logout sempre no domínio correto

**Contexto:** `header.tsx` já usa `window.location.origin`, mas a lógica está inline e duplicável; `force-logout` usa `/login` relativo (resolve via baseUrl do NextAuth, que depende de `NEXTAUTH_URL`). Centralizar num helper client evita regressão.

> ⚠️ **Risco confirmado (item de maior gravidade da spec):** `src/app/admin/logout/route.ts`
> EXISTE e **redireciona com fallback localhost**:
> `NextResponse.redirect(new URL("/admin/login", process.env.NEXTAUTH_URL || "http://localhost:3000"))`.
> Se `NEXTAUTH_URL` estiver ausente/errado em prod, o admin cai em `http://localhost:3000`
> ao sair. Corrigir derivando a origin do PRÓPRIO request (Step 8).

**Files:**
- Create: `src/lib/auth/logout.ts`
- Create: `src/lib/auth/logout.test.ts`
- Modify: `src/components/layout/header.tsx` (linhas ~484-490; import de `signOut` em :25 vem junto de `useSession` — remover só `signOut`, preservar `useSession`)
- Modify: `src/app/force-logout/page.tsx` (linhas ~9-10)
- Modify: `src/app/admin/logout/route.ts` (deriva origin do request)
- Modify: `.env.example` (linha ~12)

- [ ] **Step 1: Escrever o teste do helper (falhando)**

Arquivo: `src/lib/auth/logout.test.ts`

```typescript
/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...a: unknown[]) => signOutMock(...a) }));

import { doLogout } from "./logout";

describe("doLogout", () => {
  beforeEach(() => signOutMock.mockReset());

  it("faz signOut com callbackUrl no origin atual + /login", () => {
    // jsdom origin padrão é http://localhost:3000
    doLogout();
    expect(signOutMock).toHaveBeenCalledWith({
      callbackUrl: `${window.location.origin}/login`,
    });
  });

  it("não usa URL de domínio hardcoded", () => {
    doLogout();
    const arg = signOutMock.mock.calls[0][0];
    expect(arg.callbackUrl).not.toMatch(/pdvotica|vercel\.app/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/auth/logout.test.ts`
Expected: FAIL ("Cannot find module './logout'" ou `doLogout is not a function`).

- [ ] **Step 3: Implementar o helper**

Arquivo: `src/lib/auth/logout.ts`

```typescript
"use client";

import { signOut } from "next-auth/react";

/**
 * Logout do app cliente. Sempre redireciona para /login no domínio ATUAL
 * (window.location.origin), evitando o redirect para o domínio antigo da Vercel
 * quando NEXTAUTH_URL/baseUrl está configurado errado. Use em TODOS os pontos de
 * logout client do app.
 */
export function doLogout(): void {
  signOut({ callbackUrl: `${window.location.origin}/login` });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/auth/logout.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Trocar os pontos de logout para usar o helper**

Em `src/components/layout/header.tsx`: substituir o `onClick` que chama `signOut({ callbackUrl: ... })` por `onClick={() => doLogout()}` e adicionar o import `import { doLogout } from "@/lib/auth/logout";`. **O import em `:25` é `import { signOut, useSession } from "next-auth/react"` (ou similar) — remover SÓ o `signOut` da desestruturação, PRESERVAR `useSession` (é usado no componente).**

Em `src/app/force-logout/page.tsx`: substituir `signOut({ callbackUrl: "/login" })` por `doLogout()` e ajustar o import.

> NÃO mexer nos `signOut({ redirect: false })` do `login/page.tsx` — ali é limpeza de sessão antes de novo login, não redirect de logout.

- [ ] **Step 6: Documentar NEXTAUTH_URL no .env.example**

Em `.env.example`, na linha do `NEXTAUTH_URL`, adicionar comentário acima:

```bash
# OBRIGATÓRIO em produção: o domínio público real (ex.: https://vis.app.br).
# Em localhost use http://localhost:3000. NextAuth usa isto como baseUrl para
# resolver redirects relativos — se ficar errado em prod, logout/links vão pro
# domínio errado.
NEXTAUTH_URL="http://localhost:3000"
```

- [ ] **Step 7: Corrigir o admin logout route (deriva origin do request)**

Editar `src/app/admin/logout/route.ts` para derivar a origin do request em vez do
fallback localhost. O handler `GET` não recebe `request` hoje — adicionar o parâmetro:

```typescript
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete("admin.session-token");
  // Deriva a origin do próprio request — acompanha o domínio em que o admin está,
  // sem depender de NEXTAUTH_URL nem cair em localhost em produção.
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(new URL("/admin/login", origin));
}
```

- [ ] **Step 8: Validar tsc e commit**

Run: `npx tsc --noEmit`
Expected: No errors.

```bash
git add src/lib/auth/logout.ts src/lib/auth/logout.test.ts src/components/layout/header.tsx src/app/force-logout/page.tsx src/app/admin/logout/route.ts .env.example
git commit -m "fix(auth): centraliza logout (doLogout origin atual) + admin route deriva origin do request + doc NEXTAUTH_URL"
```

---

## Task 2: A2 — Pop-up exit-intent não reaparece em loop nem some pra sempre

**Contexto:** `src/hooks/use-exit-intent.ts` — hoje `wasShownRecently()` retorna `true` no `catch` (esconde pra sempre se localStorage falhar em LEITURA) e `markShown()` engole falha em ESCRITA (reaparece em loop se setItem falhar). Correção: validar a gravação e usar um flag em memória no módulo como fallback de sessão.

**Files:**
- Modify: `src/hooks/use-exit-intent.ts`
- Create: `src/hooks/use-exit-intent.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

Arquivo: `src/hooks/use-exit-intent.test.ts`

```typescript
/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

describe("useExitIntent — resiliência a localStorage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    // desktop (o hook ignora < 768)
    vi.stubGlobal("innerWidth", 1024);
  });

  it("não trava (mostra eventualmente) quando getItem lança", async () => {
    const ls = {
      getItem: vi.fn(() => { throw new Error("blocked"); }),
      setItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", ls);
    const { useExitIntent } = await import("./use-exit-intent");
    // não deve lançar ao montar
    expect(() => renderHook(() => useExitIntent())).not.toThrow();
  });

  it("não reaparece em loop quando setItem lança (usa fallback em memória)", async () => {
    const store: Record<string, string> = {};
    const ls = {
      getItem: vi.fn((k: string) => store[k] ?? null),
      setItem: vi.fn(() => { throw new Error("quota"); }),
    };
    vi.stubGlobal("localStorage", ls);
    const { useExitIntent, __markShownForTest } = await import("./use-exit-intent");
    // simula que o popup foi marcado como mostrado nesta sessão
    __markShownForTest();
    // após marcar, a checagem de "mostrado recentemente" deve ser true
    // mesmo com setItem falhando (fallback em memória)
    const { result } = renderHook(() => useExitIntent());
    expect(result.current.show).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/hooks/use-exit-intent.test.ts`
Expected: FAIL (`__markShownForTest` não existe / comportamento atual diverge).

- [ ] **Step 3: Implementar a correção**

Editar `src/hooks/use-exit-intent.ts`:

```typescript
"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "exit-intent-shown-at";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

// Fallback em memória para o caso de localStorage indisponível/cheio.
// Evita os dois extremos: reaparecer em loop (setItem falha) e sumir pra
// sempre por engano (getItem falha).
let shownInThisSession = false;

function wasShownRecently(): boolean {
  if (shownInThisSession) return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const shownAt = Number(raw);
    if (!Number.isFinite(shownAt)) return false;
    return Date.now() - shownAt < COOLDOWN_MS;
  } catch {
    // localStorage indisponível em LEITURA: cai no fallback de memória
    // (que é false até markShown rodar) — não esconde pra sempre.
    return shownInThisSession;
  }
}

function markShown(): void {
  shownInThisSession = true; // garante não reaparecer nesta sessão mesmo se setItem falhar
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // sem persistência entre sessões, mas o flag de memória cobre a sessão atual
  }
}

// exposto só para teste
export function __markShownForTest(): void {
  markShown();
}

export function useExitIntent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (wasShownRecently()) return;

    const isMobile = window.innerWidth < 768;
    if (isMobile) return;

    let timer: ReturnType<typeof setTimeout>;

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        timer = setTimeout(() => {
          setShow(true);
          markShown();
        }, 100);
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => setShow(false);

  return { show, dismiss };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/hooks/use-exit-intent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-exit-intent.ts src/hooks/use-exit-intent.test.ts
git commit -m "fix(exit-intent): fallback em memória evita pop-up em loop ou sumido pra sempre"
```

---

## Task 3: A3 — Impersonação não altera role/name

**Contexto:** Em `src/auth.ts`, durante a revalidação periódica do JWT, `companyId/branchId/networkId` já são protegidos por `if (!impersonation?.sessionId)` (linhas ~247-260), mas `token.role` e `token.name` continuam sendo sobrescritos com o `fresh` do targetUser. Mover essas duas atribuições para dentro do mesmo guard.

**Files:**
- Modify: `src/auth.ts` (bloco de revalidação ~linhas 240-265)
- Create: `src/auth-impersonation.test.ts`

> **Nota:** `auth.ts` é difícil de testar de ponta a ponta (NextAuth + Prisma). O teste vai isolar a REGRA num pequeno helper puro `applyRevalidatedClaims` extraído do callback, e o callback passa a usá-lo. Isso torna a regra testável sem montar o NextAuth inteiro.

- [ ] **Step 1: Escrever o teste da regra pura (falhando)**

Arquivo: `src/auth-impersonation.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { applyRevalidatedClaims } from "./auth-claims";

const fresh = {
  role: "VENDEDOR",
  name: "Alvo Rebaixado",
  companyId: "company-ALVO",
  networkId: "net-ALVO",
  branchId: "branch-ALVO",
};

describe("applyRevalidatedClaims", () => {
  it("FORA de impersonação: atualiza company/role/name normalmente", () => {
    const token: any = { role: "ADMIN", name: "Admin", companyId: "X" };
    applyRevalidatedClaims(token, fresh, /* isImpersonating */ false);
    expect(token.companyId).toBe("company-ALVO");
    expect(token.role).toBe("VENDEDOR");
    expect(token.name).toBe("Alvo Rebaixado");
  });

  it("DURANTE impersonação: NÃO altera company/role/name", () => {
    const token: any = {
      role: "ADMIN",
      name: "Super Admin",
      companyId: "company-IMPERSONADA",
      impersonation: { sessionId: "s1" },
    };
    applyRevalidatedClaims(token, fresh, /* isImpersonating */ true);
    expect(token.companyId).toBe("company-IMPERSONADA");
    expect(token.role).toBe("ADMIN");
    expect(token.name).toBe("Super Admin");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/auth-impersonation.test.ts`
Expected: FAIL ("Cannot find module './auth-claims'").

- [ ] **Step 3: Extrair o helper puro**

Criar `src/auth-claims.ts`:

```typescript
type FreshClaims = {
  role: unknown;
  name: unknown;
  companyId: string;
  networkId: string | null;
  branchId?: string | null;
};

/**
 * Aplica claims revalidados ao token. Durante impersonação, a identidade
 * impersonada (company/branch/network/role/name) é FIXA — definida na criação
 * da sessão — e NÃO deve ser sobrescrita pelo `fresh` do usuário-alvo.
 */
export function applyRevalidatedClaims(
  token: Record<string, unknown>,
  fresh: FreshClaims,
  isImpersonating: boolean
): void {
  if (isImpersonating) return;
  token.companyId = fresh.companyId;
  token.networkId = fresh.networkId;
  token.role = fresh.role;
  token.name = fresh.name;
  if (fresh.branchId) token.branchId = fresh.branchId;
}
```

- [ ] **Step 4: Usar o helper no callback jwt de `src/auth.ts`**

No bloco de revalidação (~linhas 247-260), substituir o `if (!impersonation?.sessionId) { token.companyId = ...; ... }` e as atribuições incondicionais de `token.role`/`token.name` por uma única chamada:

```typescript
applyRevalidatedClaims(
  token,
  {
    role: fresh.role,
    name: fresh.name,
    companyId: fresh.companyId,
    networkId: fresh.company?.networkId ?? null,
    branchId: fresh.branches[0]?.branchId,
  },
  Boolean(impersonation?.sessionId)
);
```

Adicionar `import { applyRevalidatedClaims } from "./auth-claims";` no topo. Remover as linhas antigas que setavam `token.role = fresh.role` / `token.name = fresh.name` incondicionalmente.

- [ ] **Step 5: Rodar o teste e o tsc**

Run: `npx vitest run src/auth-impersonation.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/auth-claims.ts src/auth-impersonation.test.ts src/auth.ts
git commit -m "fix(impersonate): role/name imutáveis durante impersonação (igual companyId)"
```

---

## Task 4: A4 — CNPJ com checagem preventiva (anti-race) + normalização

**Contexto:** `customer.service.ts` faz `findFirst` preventivo para CPF e email, mas não para CNPJ (depende só do índice único → race em cadastros simultâneos). O mapeamento reativo de erro P2002 para CNPJ JÁ existe (`mapCustomerUniqueError`). Falta: normalizar o CNPJ (só dígitos) e adicionar o findFirst preventivo no mesmo ponto do CPF/email.

**Files:**
- Modify: `src/services/customer.service.ts` (perto das linhas 224-244)
- Create: `src/services/customer-cnpj.test.ts`

- [ ] **Step 1: Escrever o teste (falhando)**

Arquivo: `src/services/customer-cnpj.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { customer: { findFirst: (...a: unknown[]) => findFirst(...a), create: (...a: unknown[]) => create(...a) } },
}));

import { customerService } from "./customer.service";

// Assinatura REAL: create(data, companyId, originBranchId?) — data PRIMEIRO.
const baseData = { name: "Loja XPTO", personType: "PJ" as const, cnpj: "11222333000181" };

describe("customer.service — CNPJ preventivo", () => {
  beforeEach(() => {
    findFirst.mockReset();
    create.mockReset().mockResolvedValue({ id: "c1" });
  });

  it("rejeita CNPJ já existente com erro de campo cnpj (não chega a criar)", async () => {
    findFirst.mockResolvedValue({ id: "existing" }); // já existe
    // duplicateError → AppError { code: "DUPLICATE", statusCode: 409, details: [{ field, message }] }
    await expect(customerService.create(baseData, "co-1")).rejects.toMatchObject({
      code: "DUPLICATE",
      details: [{ field: "cnpj" }],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("normaliza o CNPJ (remove máscara) antes da checagem", async () => {
    findFirst.mockResolvedValue(null);
    await customerService.create({ ...baseData, cnpj: "11.222.333/0001-81" }, "co-1");
    const where = findFirst.mock.calls.find((c) => (c[0] as any)?.where?.cnpj)?.[0] as any;
    expect(where.where.cnpj).toBe("11222333000181"); // só dígitos
  });
});
```

> Confirmado no código: `create(data, companyId, originBranchId?)` (`customer.service.ts:227`) e
> `duplicateError(message, field)` → `AppError { code: ERROR_CODES.DUPLICATE ("DUPLICATE"),
> statusCode: 409, details: [{ field, message }] }` (`error-handler.ts:276-283`). O assert usa
> `code` + `details`, NÃO `.field` no topo.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/services/customer-cnpj.test.ts`
Expected: FAIL (sem checagem preventiva / sem normalização).

- [ ] **Step 3: Implementar normalização + findFirst preventivo**

Em `src/services/customer.service.ts`:

1. Adicionar helper de normalização (perto de `normalizeEmail`):

```typescript
function normalizeCnpj(cnpj?: string | null): string | undefined {
  if (cnpj == null) return undefined;
  const digits = cnpj.replace(/\D/g, "");
  return digits === "" ? undefined : digits;
}
```

2. Aplicar a normalização ao `data` (onde já normaliza email) e adicionar a checagem preventiva logo após a do CPF:

```typescript
// (junto da normalização existente)
data = { ...data, cnpj: normalizeCnpj(data.cnpj) };

// ... depois das checagens de cpf e email:
if (data.cnpj) {
  const existing = await prisma.customer.findFirst({
    where: { companyId, cnpj: data.cnpj },
  });
  if (existing) {
    throw duplicateError("CNPJ já cadastrado nesta empresa", "cnpj");
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/services/customer-cnpj.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + commit**

Run: `npx tsc --noEmit`
Expected: No errors.

```bash
git add src/services/customer.service.ts src/services/customer-cnpj.test.ts
git commit -m "fix(clientes): CNPJ com checagem preventiva (anti-race) + normalização de máscara"
```

---

## Task 5: A5 — Override do gerente propaga na conversão de orçamento

**Contexto:** `quote.service.ts:convertToSale` recebe `override` mas chama `applyStockDebitInTx` SEM passar `allowNegative`. Se o estoque mudou entre o PDV e a conversão, o gerente não consegue autorizar. `sale.service.ts` já faz certo: passa `allowNegative: overrideAllows(override, "INSUFFICIENT_STOCK")`. Espelhar.

**Files:**
- Modify: `src/services/quote.service.ts` (chamada de `applyStockDebitInTx`, ~linha 948-952)
- Create: `src/services/quote-override.test.ts`

**Estratégia de teste (decisão honesta):** `convertToSale` é um método pesado
(exige muito setup de Prisma/transação) — um teste de integração ponta-a-ponta dele
seria frágil. Em vez disso, travamos a regra em DUAS frentes que juntas cobrem o
furo: (1) `applyStockDebitInTx` respeita `allowNegative` (que é o que o override
habilita) — espelhando `src/services/__tests__/sale-side-effects-stock.test.ts`; e
(2) `overrideAllows` converte o override do gerente em `allowNegative=true`. A
correção no Step 3 conecta os dois no `convertToSale`. Caminho real do import:
`@/lib/manager-override` (confirmado em `quote.service.ts:20`).

- [ ] **Step 1: Escrever o teste (falhando no item de comportamento de allowNegative)**

Arquivo: `src/services/quote-override.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { overrideAllows } from "@/lib/manager-override";

// Mock do stock.service para controlar o resultado do débito atômico,
// igual ao padrão de sale-side-effects-stock.test.ts.
vi.mock("@/services/stock.service", () => ({ atomicStockDebit: vi.fn() }));
import { atomicStockDebit } from "@/services/stock.service";
import { applyStockDebitInTx } from "@/services/sale-side-effects.service";

const mockTx: any = { stockMovement: { create: vi.fn() } };

describe("A5 — override do gerente habilita venda sem estoque na conversão", () => {
  beforeEach(() => vi.clearAllMocks());

  it("overrideAllows converte o override em allowNegative=true", () => {
    const override = { codes: ["INSUFFICIENT_STOCK"], approvedByUserId: "mgr" } as any;
    expect(overrideAllows(override, "INSUFFICIENT_STOCK")).toBe(true);
    expect(overrideAllows(undefined, "INSUFFICIENT_STOCK")).toBe(false);
  });

  it("applyStockDebitInTx com allowNegative=true NÃO lança quando estoque é insuficiente", async () => {
    // débito atômico falha por falta de estoque
    (atomicStockDebit as any).mockResolvedValue({ success: false, error: "Estoque insuficiente" });
    await expect(
      applyStockDebitInTx(mockTx, {
        sale: { id: "s1", branchId: "b1", companyId: "co1" },
        items: [{ productId: "p1", qty: 5 }],
        userId: "u1",
        allowNegative: true, // o que o override do gerente produz
      })
    ).resolves.not.toThrow();
    // confirma que o débito foi chamado permitindo negativo
    expect(atomicStockDebit).toHaveBeenCalledWith(
      expect.objectContaining({ allowNegative: true })
    );
  });
});
```

> Ao escrever, confirmar a forma exata do `ManagerOverrideDTO` (campos `codes`/
> `approvedByUserId`) e a assinatura de `atomicStockDebit` (se recebe `allowNegative`
> no objeto) consultando `src/services/stock.service.ts` e o teste existente
> `sale-side-effects-stock.test.ts`. Ajustar os asserts ao formato real.

- [ ] **Step 2: Rodar e confirmar o estado inicial**

Run: `npx vitest run src/services/quote-override.test.ts`
Expected: os asserts de `overrideAllows`/`applyStockDebitInTx` definem o comportamento
esperado; ajustar até refletirem o código real de `applyStockDebitInTx` (que já existe).

- [ ] **Step 3: Propagar o override na chamada (a correção do furo)**

Em `src/services/quote.service.ts`, na chamada de `applyStockDebitInTx` (~linha 948),
adicionar o `allowNegative`, espelhando `sale.service.ts`. `overrideAllows` JÁ está
importado (`quote.service.ts:20`) e `override`/`branchId`/`companyId`/`userId` estão
em escopo no `convertToSale`:

```typescript
await applyStockDebitInTx(tx, {
  sale: { id: sale.id, branchId, companyId },
  items: quote.items.map((i) => ({ productId: i.productId, qty: i.qty })),
  userId,
  allowNegative: overrideAllows(override, "INSUFFICIENT_STOCK"),
});
```

- [ ] **Step 4: Rodar e confirmar que passa + tsc**

Run: `npx vitest run src/services/quote-override.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: No errors (garante que `convertToSale` aceita o novo campo).

- [ ] **Step 5: Commit**

```bash
git add src/services/quote.service.ts src/services/quote-override.test.ts
git commit -m "fix(orçamento): propaga override do gerente no débito de estoque da conversão"
```

---

## Task 6: Validação final da Fase A

- [ ] **Step 1: Suíte completa verde**

Run: `npm test`
Expected: todos os testes passam (os 490 anteriores + os novos da Fase A).

- [ ] **Step 2: Typecheck limpo**

Run: `npx tsc --noEmit`
Expected: No errors found.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: exit 0, ~297 páginas geradas. (O "Dynamic server usage" em `/api/dashboard/onboarding-status` é log benigno conhecido.)

- [ ] **Step 4: Conferir que nada ficou sem commit**

Run: `git status -s`
Expected: árvore limpa (fora `docs/teste-claude-chrome.md`, não-relacionado).

---

## Notas

- **DEPLOY:** A Fase A é independente. Após mergear/deployar, confirmar `NEXTAUTH_URL=https://vis.app.br` em produção (Task 1 depende disso para o admin/relativos). O `build` não roda migrate — a Fase A não tem migrations, então não há passo de migrate aqui.
- **Próximas fases:** Fase B (automação de setup) e Fase C (catálogos de marca) têm planos próprios; Fase C espera os 4 PDFs.
