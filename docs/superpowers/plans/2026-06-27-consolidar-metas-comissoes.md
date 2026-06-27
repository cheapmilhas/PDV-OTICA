# Consolidar Metas/Comissões/Config numa página única — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colapsar os 3 itens de sidebar (Metas, Comissões, Config. Comissões) num único item "Metas" com 3 abas internas (Ranking · Comissões · Config), preservando 100% do acesso atual (permissões + plano) e sem quebrar links.

**Architecture:** `/dashboard/metas` continua server component: resolve `mode` (new/legacy) por ótica via kill-switch e a aba inicial via `?tab=`, passando ambos a um client `metas-tabs.tsx`. As 3 abas reusam componentes existentes (views de comissão) ou extraídos (Ranking, Config). As 2 rotas antigas viram `redirect()` 307. O gating de `goals` sai da rota e vira por-aba (Ranking).

**Tech Stack:** Next.js 16 App Router, React (client/server components), Radix Tabs (shadcn), vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-27-consolidar-metas-comissoes-design.md`

**Branch:** `feat/consolidar-metas-comissoes` (já criada; spec já commitada).

---

## File Structure

**Criar:**
- `src/app/(dashboard)/dashboard/metas/metas-tabs.tsx` — client; monta as 3 abas, gating por aba (loading-safe), sync aba↔URL.
- `src/app/(dashboard)/dashboard/metas/ranking-tab.tsx` — client; conteúdo de Ranking extraído do `metas-content.tsx`, envolto em `FeatureGate feature="goals"`.
- `src/app/(dashboard)/dashboard/metas/commission-config-tab.tsx` — client; conteúdo de config extraído de `configuracoes/comissoes/page.tsx` (sem o wrapper `ProtectedRoute`).
- Testes: `metas-tabs.test.tsx`, `redirects.test.ts` (ou por-rota), e ajuste no teste de catálogo.

**Modificar:**
- `src/app/(dashboard)/dashboard/metas/page.tsx` — lê `?tab=`, passa `{ mode, initialTab }`.
- `src/app/(dashboard)/dashboard/relatorios/comissoes/page.tsx` — vira `redirect(307)`.
- `src/app/(dashboard)/dashboard/configuracoes/comissoes/page.tsx` — vira `redirect(307)`.
- `src/lib/plan-feature-catalog.ts:163` — remove `/dashboard/metas` do pageMatchers de GOALS.
- `src/lib/__tests__/find-blocked-feature.test.ts:77` — remove a linha do page matcher.
- `src/components/layout/sidebar.tsx` — remove 2 itens, ajusta "Metas" (permissionAny, sem feature).
- `src/components/layout/mobile-nav.tsx` — ajusta item "Metas".

**Deletar (após extração):**
- `src/app/(dashboard)/dashboard/metas/metas-content.tsx` — conteúdo migra para ranking-tab.tsx + metas-tabs.tsx.
- `src/app/(dashboard)/dashboard/configuracoes/comissoes/commission-tiers-tab.tsx` — **move** para junto da nova config-tab (ou mantém e re-importa). Ver Task 4.

> **Ordem:** catálogo/teste primeiro (baixo risco) → extrações → página com abas → redirects → nav → verificação final. Cada Task termina com commit.

---

## Task 1: Tirar `/dashboard/metas` do gating de plano por-URL

**Files:**
- Modify: `src/lib/plan-feature-catalog.ts:160-166`
- Modify: `src/lib/__tests__/find-blocked-feature.test.ts:77`

- [ ] **Step 1: Ajustar o teste do catálogo (RED por mudança de expectativa)**

Em `find-blocked-feature.test.ts`, remover a linha:
```ts
    ["/dashboard/metas", FEATURES.GOALS],
```
Manter `["/api/goals", FEATURES.GOALS]`. Adicionar um caso garantindo que a página NÃO é mais bloqueada por plano:
```ts
    // Consolidação Metas: a PÁGINA não é mais gateada por plano (gating vira por-aba).
    // /api/goals continua gateado.
  ])("bloqueia %s → %s", (path, expectedKey) => {
    expect(findBlockedFeature(path, ALL_FALSE)).toBe(expectedKey);
  });

  it("NÃO bloqueia /dashboard/metas por plano (gating de goals é por-aba agora)", () => {
    expect(findBlockedFeature("/dashboard/metas", ALL_FALSE)).toBeNull();
  });
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `rtk proxy npx vitest run src/lib/__tests__/find-blocked-feature.test.ts`
Expected: FAIL — `/dashboard/metas` ainda casa GOALS (ainda está no pageMatchers).

- [ ] **Step 3: Remover o page matcher do catálogo**

Em `plan-feature-catalog.ts`, no bloco `[FEATURES.GOALS]`:
```ts
  [FEATURES.GOALS]: {
    label: "Metas",
    description: "Metas de venda e comissão por vendedor/loja.",
    pageMatchers: [],
    apiMatchers: ["/api/goals"],
    sidebarKey: "metas",
  },
```
(`pageMatchers: []` — antes era `["/dashboard/metas"]`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `rtk proxy npx vitest run src/lib/__tests__/find-blocked-feature.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-feature-catalog.ts src/lib/__tests__/find-blocked-feature.test.ts
git commit -m "refactor(metas): tira /dashboard/metas do gating de plano por-URL (vira por-aba)"
```

---

## Task 2: Extrair a aba Config (conteúdo, sem wrapper)

**Files:**
- Create: `src/app/(dashboard)/dashboard/metas/commission-config-tab.tsx`
- Reference: `src/app/(dashboard)/dashboard/configuracoes/comissoes/page.tsx` (fonte do conteúdo)
- Reference: `src/app/(dashboard)/dashboard/configuracoes/comissoes/commission-tiers-tab.tsx`

- [ ] **Step 1: Criar o componente de aba Config**

Copiar a função `CommissionConfigPageContent` de `configuracoes/comissoes/page.tsx` para o novo arquivo, exportando como `CommissionConfigTab`. **NÃO** copiar o wrapper `export default ... ProtectedRoute`. Manter os imports usados (`useState/useEffect`, Card, Input, Label, Button, useToast, ícones, Tabs, `CommissionTiersTab`). Ajustar o import de `CommissionTiersTab` para o caminho relativo correto:
```tsx
"use client";
// ...imports iguais aos da página atual...
import { CommissionTiersTab } from "../configuracoes/comissoes/commission-tiers-tab";

export function CommissionConfigTab() {
  // corpo idêntico ao CommissionConfigPageContent atual
}
```
> Nota: mantemos `commission-tiers-tab.tsx` no lugar atual e só re-importamos — evita mover arquivo e quebrar histórico. O `<h1>` "Configuração de Comissões" interno pode ficar (vira título da aba) ou ser rebaixado para `<h2>`; manter por ora.

- [ ] **Step 2: Verificar tipos**

Run: `rtk proxy npx tsc --noEmit`
Expected: PASS (sem erros novos).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/metas/commission-config-tab.tsx
git commit -m "refactor(metas): extrai CommissionConfigTab (conteúdo de config, sem wrapper)"
```

---

## Task 3: Extrair a aba Ranking (com FeatureGate goals)

**Files:**
- Create: `src/app/(dashboard)/dashboard/metas/ranking-tab.tsx`
- Reference: `src/app/(dashboard)/dashboard/metas/metas-content.tsx` (fonte; `GoalsPageContent` recebe `showCommission`)

- [ ] **Step 1: Criar `ranking-tab.tsx`**

Mover a função `GoalsPageContent` (e o helper `RankingCard`, `MONTHS`) de `metas-content.tsx` para `ranking-tab.tsx`, exportando como `RankingTab`, recebendo a prop `mode: "new" | "legacy"` (derivar `showCommission = mode === "legacy"` internamente). Envolver o retorno em `FeatureGate feature="goals"`:
```tsx
"use client";
import { FeatureGate } from "@/components/plan/feature-gate";
// ...demais imports que GoalsPageContent usa...

export function RankingTab({ mode }: { mode: "new" | "legacy" }) {
  const showCommission = mode === "legacy";
  return (
    <FeatureGate feature="goals" featureName="Metas">
      {/* corpo do antigo GoalsPageContent, usando showCommission */}
    </FeatureGate>
  );
}
```
> A lógica `showCommission` (esconde card/aba/Fechar Mês de comissão em modo new) já existe — preservar. Em legacy continua mostrando a comissão dentro do Ranking, como hoje.

- [ ] **Step 2: Verificar tipos**

Run: `rtk proxy npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/metas/ranking-tab.tsx
git commit -m "refactor(metas): extrai RankingTab (envolto em FeatureGate goals)"
```

---

## Task 4: Criar `metas-tabs.tsx` (3 abas, gating por aba, sync URL)

**Files:**
- Create: `src/app/(dashboard)/dashboard/metas/metas-tabs.tsx`
- Reference: `src/hooks/use-permission.ts` (singular: `hasPermission`, `hasAnyPermission`, `isLoading`)
- Reference: `commission-new-view.tsx` / `commission-legacy-view.tsx` (aba Comissões)

- [ ] **Step 1: Escrever o componente**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermission } from "@/hooks/use-permission";
import { CommissionNewView } from "../relatorios/comissoes/commission-new-view";
import { CommissionLegacyView } from "../relatorios/comissoes/commission-legacy-view";
import { RankingTab } from "./ranking-tab";
import { CommissionConfigTab } from "./commission-config-tab";

type TabKey = "ranking" | "comissoes" | "config";

const TAB_PERMISSION: Record<TabKey, string> = {
  ranking: "goals.view",
  comissoes: "reports.sales",
  config: "settings.edit",
};

export function MetasTabs({
  mode,
  initialTab,
}: {
  mode: "new" | "legacy";
  initialTab: TabKey;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission, hasAnyPermission, isLoading } = usePermission();

  // Loading-safe (H3): só decide abas depois de carregar as permissões.
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const allowed = (Object.keys(TAB_PERMISSION) as TabKey[]).filter((t) =>
    hasPermission(TAB_PERMISSION[t]),
  );

  // 0 permissões → guard nega (mesma UI do ProtectedRoute).
  if (allowed.length === 0) {
    return <ProtectedRoute permission={Object.values(TAB_PERMISSION)} requireAny>{null}</ProtectedRoute>;
  }

  // aba inicial válida e permitida; senão a primeira permitida.
  const active: TabKey = allowed.includes(initialTab) ? initialTab : allowed[0];

  const goTo = (t: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", t);
    router.replace(`/dashboard/metas?${params.toString()}`);
  };

  // 1 aba só → sem barra de abas.
  const showBar = allowed.length > 1;

  return (
    <Tabs value={active} onValueChange={goTo} className="space-y-6">
      {showBar && (
        <TabsList>
          {allowed.includes("ranking") && <TabsTrigger value="ranking">Ranking</TabsTrigger>}
          {allowed.includes("comissoes") && <TabsTrigger value="comissoes">Comissões</TabsTrigger>}
          {allowed.includes("config") && <TabsTrigger value="config">Configurações</TabsTrigger>}
        </TabsList>
      )}

      {allowed.includes("ranking") && (
        <TabsContent value="ranking"><RankingTab mode={mode} /></TabsContent>
      )}
      {allowed.includes("comissoes") && (
        <TabsContent value="comissoes">
          {mode === "new" ? <CommissionNewView /> : <CommissionLegacyView />}
        </TabsContent>
      )}
      {allowed.includes("config") && (
        <TabsContent value="config"><CommissionConfigTab /></TabsContent>
      )}
    </Tabs>
  );
}
```
> Permissão por aba preservada; aba Comissões escolhe a view pelo `mode`; gating de `goals` mora no `RankingTab` (FeatureGate). ADMIN: o `usePermission` já trata ADMIN como tendo tudo (mesma base do ProtectedRoute) — confirmar no hook; se não, usar `isAdmin`.

- [ ] **Step 2: Verificar tipos**

Run: `rtk proxy npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/metas/metas-tabs.tsx
git commit -m "feat(metas): metas-tabs com 3 abas, gating por aba (loading-safe) e sync ?tab="
```

---

## Task 5: Religar a `page.tsx` ao novo `metas-tabs` e remover `metas-content`

**Files:**
- Modify: `src/app/(dashboard)/dashboard/metas/page.tsx`
- Delete: `src/app/(dashboard)/dashboard/metas/metas-content.tsx`

- [ ] **Step 1: Reescrever `page.tsx`**

```tsx
import { isNewCommissionEngine } from "@/lib/commission-flag";
import { getCompanyId } from "@/lib/auth-helpers";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { MetasTabs } from "./metas-tabs";

type TabKey = "ranking" | "comissoes" | "config";
const VALID: TabKey[] = ["ranking", "comissoes", "config"];

/**
 * Página única de Metas — 3 abas (Ranking · Comissões · Config).
 * Server: resolve o modo new/legacy por ótica (kill-switch) e a aba inicial (?tab=);
 * o gating de goals é por-aba (RankingTab). Guard de página = qualquer uma das 3
 * permissões (quem tem só Comissões ou só Config também entra).
 */
export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const companyId = await getCompanyId();
  const mode = isNewCommissionEngine(companyId) ? "new" : "legacy";
  const { tab } = await searchParams;
  const initialTab: TabKey = VALID.includes(tab as TabKey) ? (tab as TabKey) : "ranking";

  return (
    <ProtectedRoute
      permission={["goals.view", "reports.sales", "settings.edit"]}
      requireAny
    >
      <MetasTabs mode={mode} initialTab={initialTab} />
    </ProtectedRoute>
  );
}
```
> Next 16: `searchParams` é `Promise` → `await`. Guard `requireAny` corrige o C1.

- [ ] **Step 2: Deletar `metas-content.tsx`**

```bash
git rm src/app/\(dashboard\)/dashboard/metas/metas-content.tsx
```
Conferir que nada mais o importa:
Run: `grep -rn "metas-content" src` → Expected: nenhum resultado.

- [ ] **Step 3: Verificar tipos + build parcial**

Run: `rtk proxy npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/metas/page.tsx
git commit -m "feat(metas): page.tsx monta as abas (guard requireAny das 3 permissões) e remove metas-content"
```

---

## Task 6: Redirects 307 das rotas antigas

**Files:**
- Modify: `src/app/(dashboard)/dashboard/relatorios/comissoes/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/configuracoes/comissoes/page.tsx`

- [ ] **Step 1: Reescrever `relatorios/comissoes/page.tsx`**

```tsx
import { redirect } from "next/navigation";

// Consolidado em /dashboard/metas?tab=comissoes. 307 (redirect, não permanentRedirect).
export default function RelatorioComissoesRedirect() {
  redirect("/dashboard/metas?tab=comissoes");
}
```

- [ ] **Step 2: Reescrever `configuracoes/comissoes/page.tsx`**

```tsx
import { redirect } from "next/navigation";

// Consolidado em /dashboard/metas?tab=config.
export default function ConfigComissoesRedirect() {
  redirect("/dashboard/metas?tab=config");
}
```
> Mantém `commission-tiers-tab.tsx` no diretório (a config-tab o re-importa). Não deletar.

- [ ] **Step 3: Verificar tipos**

Run: `rtk proxy npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/relatorios/comissoes/page.tsx src/app/\(dashboard\)/dashboard/configuracoes/comissoes/page.tsx
git commit -m "feat(metas): redirects 307 das rotas antigas para /dashboard/metas?tab="
```

---

## Task 7: Sidebar — 1 item "Metas" com permissionAny

**Files:**
- Modify: `src/components/layout/sidebar.tsx` (interface `MenuItem` ~48-57; itens ~192-213; filtro ~434)

- [ ] **Step 1: Estender `MenuItem` e o filtro**

Na interface `MenuItem`, adicionar:
```ts
  /** Mostra o item se tiver QUALQUER uma destas permissões (alternativa ao permission único). */
  permissionAny?: string[];
```
No filtro `visibleItems`, ajustar `permissionOk`:
```ts
const permissionOk =
  isAdmin ||
  (!item.permission && !item.permissionAny) ||
  (item.permission ? hasPermission(item.permission) : false) ||
  (item.permissionAny ? item.permissionAny.some((p) => hasPermission(p)) : false);
```

- [ ] **Step 2: Remover os itens "Comissões" e "Config. Comissões"; ajustar "Metas"**

Remover os blocos `name: "Comissões"` (href `/dashboard/relatorios/comissoes`) e `name: "Config. Comissões"`. Trocar o item "Metas" por:
```ts
{
  name: "Metas",
  href: "/dashboard/metas",
  icon: Target,
  permissionAny: ["goals.view", "reports.sales", "settings.edit"],
},
```
(sem `permission` único, sem `feature: "goals"`.)

- [ ] **Step 3: Verificar tipos**

Run: `rtk proxy npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat(metas): sidebar com item único Metas (permissionAny das 3 permissões)"
```

---

## Task 8: Mobile-nav — mesmo ajuste

**Files:**
- Modify: `src/components/layout/mobile-nav.tsx` (item "Metas" ~60; tipo + filtro)

- [ ] **Step 1: Suportar `permissionAny` e ajustar o item**

Adicionar `permissionAny?: string[]` ao tipo dos itens e ao filtro (mesma lógica do Task 7). Trocar o item Metas:
```ts
{ icon: Target, label: "Metas", href: "/dashboard/metas", permissionAny: ["goals.view", "reports.sales", "settings.edit"] },
```
(remover `permission` e `feature`). Não há itens Comissões/Config no mobile-nav (já é só "Metas") — só ajustar este.

- [ ] **Step 2: Verificar tipos**

Run: `rtk proxy npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/mobile-nav.tsx
git commit -m "feat(metas): mobile-nav item Metas com permissionAny"
```

---

## Task 9: Rebaixar a sub-barra de abas da Comissões legacy (H1)

**Files:**
- Modify: `src/app/(dashboard)/dashboard/relatorios/comissoes/commission-legacy-view.tsx:271-274`

- [ ] **Step 1: Reduzir o peso visual da `TabsList` interna**

Na `CommissionLegacyView`, a `TabsList` interna ("Atual"/"Preview regra nova") empilha com a barra externa quando dentro da aba Comissões. Aplicar variante menor para não competir (ex.: classe menor / `h-8` / texto menor):
```tsx
<TabsList className="h-8 text-xs bg-muted/50">
  <TabsTrigger value="atual" className="text-xs">Atual</TabsTrigger>
  <TabsTrigger value="preview" className="text-xs">Preview regra nova</TabsTrigger>
</TabsList>
```
> Não remover a aba Preview (read-only, útil). Só rebaixar visualmente. Config mantém suas sub-abas como estão.

- [ ] **Step 2: Verificar tipos**

Run: `rtk proxy npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/relatorios/comissoes/commission-legacy-view.tsx
git commit -m "style(metas): rebaixa sub-barra de abas da Comissões legacy (evita abas empilhadas)"
```

---

## Task 10: Testes — gating por permissão/plano e abas

**Files:**
- Create: `src/app/(dashboard)/dashboard/metas/__tests__/metas-tabs.test.tsx`
- Reference: `src/components/plan/__tests__/feature-gate.test.tsx` (padrão de mock de permissões/feature)

- [ ] **Step 1: Escrever os testes (RED)**

Mockar `usePermission` e renderizar `MetasTabs`. Casos:
1. **C1 — só `reports.sales`** (sem goals.view): a aba "Comissões" aparece; "Ranking" e "Config" não. (Renderiza a view de comissão conforme `mode`.)
2. **só `settings.edit`**: aparece "Configurações"; demais não.
3. **só `goals.view`**: aparece "Ranking"; sem barra de abas (1 aba só).
4. **as 3 permissões**: 3 abas; aba inicial = `initialTab`; `initialTab` inválido → "ranking".
5. **0 permissões**: não renderiza abas (cai no guard).
6. **`isLoading=true`**: mostra spinner, não "nenhuma aba".
7. **modo**: `mode="new"` → aba Comissões usa `CommissionNewView`; `mode="legacy"` → `CommissionLegacyView` (mockar as duas views com texto sentinela).

Mockar `next/navigation` (`useRouter`, `useSearchParams`) e as views/`RankingTab`/`CommissionConfigTab` com stubs simples para isolar a lógica de abas.

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk proxy npx vitest run src/app/\(dashboard\)/dashboard/metas/__tests__/metas-tabs.test.tsx`
Expected: FAIL inicialmente (ajustar mocks até bater na lógica real; depois GREEN).

- [ ] **Step 3: Ajustar até passar**

Run: idem.
Expected: PASS (7 casos).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/metas/__tests__/metas-tabs.test.tsx
git commit -m "test(metas): cobre gating por aba, loading-safe, aba inicial e modo new/legacy"
```

---

## Task 11: Rede de segurança — RankingTab está sob FeatureGate goals

**Files:**
- Create/extend: teste que garante o FeatureGate na aba Ranking.

- [ ] **Step 1: Teste (RED→GREEN)**

Opção simples e robusta: teste de fonte (lê o arquivo `ranking-tab.tsx` e assevera que contém `FeatureGate` com `feature="goals"`), OU teste de render mockando `FeatureGate` para registrar a `feature` recebida e assert `"goals"`. Preferir o de render:
```tsx
// mock FeatureGate capturando props.feature; renderizar <RankingTab mode="new"/>;
// expect(capturedFeature).toBe("goals")
```

- [ ] **Step 2: Rodar**

Run: `rtk proxy npx vitest run` (o arquivo novo)
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(metas): garante RankingTab envolto em FeatureGate goals (rede de segurança)"
```

---

## Task 12: Verificação final (tsc + suíte + build) e limpeza

**Files:** nenhum novo.

- [ ] **Step 1: Grep de referências órfãs**

Run: `grep -rn "metas-content\|/dashboard/relatorios/comissoes\|/dashboard/configuracoes/comissoes" src | grep -v "redirect\|\.test\."`
Expected: só os arquivos de redirect e (talvez) nenhum link interno. Investigar qualquer outra ocorrência.

- [ ] **Step 2: tsc limpo**

Run: `rtk proxy npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Suíte completa verde**

Run: `rtk proxy npx vitest run`
Expected: PASS (todos os arquivos; sem regressões).

- [ ] **Step 4: Build de produção**

Run: `rm -rf .next && rtk proxy npx next build`
Expected: exit 0; `/dashboard/metas` como `ƒ` (dynamic); rotas antigas viram redirect. (Ignorar o log conhecido `onboarding-status`.)

- [ ] **Step 5: Commit (se houver ajuste) e fim**

```bash
git add -A
git commit -m "chore(metas): verificação final — tsc/suite/build verdes" || echo "nada a commitar"
```

---

## Notas de execução

- **rtk:** usar `rtk proxy` para tsc/vitest/build (o hook rtk distorce a saída).
- **`.next` stale entre branches:** se tsc reclamar de tipos antigos, `rm -rf .next`.
- **Sem migração, sem env, sem deploy** neste plano — é reorganização de UI. Deploy é passo separado (revisão do dono primeiro).
- **Convivência com o kill-switch por ótica em prod:** o plano só consome `mode`; não toca nas envs nem na lógica de `commission-flag.ts`.
- **Smoke autenticado do dono** (pós-merge, antes/depois do deploy): Atacadão (new) → aba Comissões limpa, Metas "Ranking" sem comissão; outra ótica (legacy) → tudo como hoje; usuário só com `reports.sales` → vê Comissões.
