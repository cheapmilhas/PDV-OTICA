# Assistente de Lentes — Widget Flutuante Global — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposicionar o Assistente de Lentes de um painel preso na Ordem de Serviço para um **widget flutuante global** (bolinha no canto → balão de chat) disponível em todo o dashboard da ótica, onde o vendedor digita a receita+armação, vê o motor (índice/espessura/peso) na hora, e pede à IA quais produtos cobrem o grau (cruzando com as tabelas de grade da base de conhecimento).

**Architecture:** Extrair o núcleo (inputs de receita/armação + motor + estados de IA) do `lens-advisor-panel.tsx` para um hook/componente reutilizável que **possui** os inputs de grau (hoje vêm por prop). Montar uma `LensAdvisorFab` (bolinha) + `LensAdvisorChat` (balão) uma vez no `(dashboard)/layout.tsx`. Ajustar o prompt de `lens-advisor.ts` para focar em grade/disponibilidade. Remover o painel das 2 telas de OS. Reusa motor, rota do vendedor (`/api/company/lens-advisor` via `adviseForCompany`), base de conhecimento, e os padrões de degradação/UI do pacote OURO.

**Tech Stack:** Next.js App Router · React (client components, useState/useMemo/useEffect) · TypeScript · Vitest · shadcn/ui (Button, Input, Label) · Tailwind · lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-18-assistente-lentes-widget-flutuante-design.md`

---

## Fatos verificados (seguir à risca)

- **rtk** quebra binários: `node node_modules/{vitest/vitest.mjs run,typescript/bin/tsc --noEmit}`. `git commit --no-verify`. Exit engolido → `rtk proxy`. Build: `TMPDIR=/Users/matheusreboucas/.cache/claude-tmp node node_modules/next/dist/bin/next build`.
- **Worktree:** `.worktrees/integra-lentes` (branch `feat/integra-lentes`). Sem migração, sem env nova.
- **Painel atual** (`src/components/ordens-servico/lens-advisor-panel.tsx`): recebe `od`/`oe` como **props** `EyeGrau` (`{esf,cil,eixo,add}` strings PT) + `initialFrame?`. Tem `toNum`, `toEyePower`, `hasGrau`, o memo `analyzeLens`, o `EyeReport`, os estados `aiText/aiLoading/aiError`, `handleExplainWithAi` (fetch p/ `/api/company/lens-advisor` com `{od,oe,frame}`), e o efeito que limpa a IA quando inputs mudam. **No widget, o componente passa a POSSUIR od/oe (o vendedor digita), não recebê-los por prop.**
- **Layout** (`src/app/(dashboard)/layout.tsx`): já monta `<MobileNav />` e `<KeyboardShortcuts />` como **irmãos FORA do `<main id="main-scroll" overflow-y-auto>`**, dentro de `<BranchProviderWrapper>`. A bolinha `fixed` vai NO MESMO lugar (irmã desses), p/ não rolar com o conteúdo. Já é gated por `auth()`→redirect `/login`; admin tem layout separado.
- **Rota do vendedor** (`/api/company/lens-advisor`): auth + `requirePermission("company.settings")` + rate-limit + `assertAiAllowed` + `adviseForCompany`. Recebe `{od,oe,frame}`, devolve `{ data: { analysis, advice, aiUnavailable } }`. **Intocada.**
- **Prompt** (`src/lib/ai/lens-advisor.ts`): `SYSTEM_PROMPT` + user prompt que já serializa `docs` (com nonce anti-injeção). A mudança de grade é só no texto do `SYSTEM_PROMPT`. O playground do super admin chama `explainLensRecommendation` direto → herda a mudança de graça.
- **Telas de OS:** `src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx:1216` e `.../[id]/editar/page.tsx:1126` renderizam `<LensAdvisorPanel od={prescriptionData.od} oe={prescriptionData.oe} />`. Remover essas 2 linhas (+ o import + o comentário `{/* Assistente de Lentes */}`).
- **Degradação (já existe):** sem chave/crédito/IA off → a rota devolve erro/`aiUnavailable` → o widget mostra nota discreta; o motor sempre aparece.
- **Componente UI shadcn:** `@/components/ui/button`, `@/components/ui/input`, `@/components/ui/label` existem e são usados no painel atual.

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/lens-widget-expiry.ts` | Criar | Função pura `isExpired(lastEditedAt, now, ttlMs)` p/ a regra de 10 min. Testável isolada. |
| `src/components/lens-advisor/use-lens-advisor.ts` | Criar | Hook que POSSUI os inputs de receita (od/oe `EyeGrau`) + armação + motor (`analyzeLens`) + estados de IA + `handleExplainWithAi` + limpar-IA-on-change + reset. Núcleo extraído do painel, sem JSX. |
| `src/components/lens-advisor/lens-advisor-form.tsx` | Criar | UI compartilhada: campos de receita OD/OE + armação + resultado do motor (EyeReport) + botão IA + bloco de sugestão/erro/skeleton. Consome o hook. Reusa os achados do pacote OURO (labels associados, IA subordinada, spinner). |
| `src/components/lens-advisor/lens-advisor-fab.tsx` | Criar | A bolinha (FAB) + o balão (`LensAdvisorChat` inline ou separado). Controla aberto/fechado + expiração 10min. Renderiza `lens-advisor-form`. |
| `src/app/(dashboard)/layout.tsx` | Modificar | Montar `<LensAdvisorFab />` como irmão de `<MobileNav/>`. |
| `src/lib/ai/lens-advisor.ts` | Modificar | Estender `SYSTEM_PROMPT` p/ cruzar grau × tabelas de grade (disponibilidade). |
| `src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx` | Modificar | Remover `<LensAdvisorPanel>` + import. |
| `src/app/(dashboard)/dashboard/ordens-servico/[id]/editar/page.tsx` | Modificar | Remover `<LensAdvisorPanel>` + import. |
| `src/components/ordens-servico/lens-advisor-panel.tsx` | Remover | Substituído pelo widget (após confirmar que nada mais o usa). |

> **Ordem:** T1 expiry (pura) → T2 prompt de grade → T3 hook núcleo → T4 form compartilhado → T5 FAB+balão → T6 montar no layout → T7 remover da OS + deletar painel → T8 verificação.

---

## Task 1: regra de expiração de 10 min (função pura)

**Files:** `src/lib/lens-widget-expiry.ts` (+ `src/lib/lens-widget-expiry.test.ts`).

- [ ] **Step 1: Teste que falha.** Criar `lens-widget-expiry.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isExpired, LENS_WIDGET_TTL_MS } from "./lens-widget-expiry";

describe("isExpired", () => {
  it("LENS_WIDGET_TTL_MS = 10 min", () => {
    expect(LENS_WIDGET_TTL_MS).toBe(10 * 60 * 1000);
  });
  it("nunca editado (null) → não expira (false)", () => {
    expect(isExpired(null, 1_000_000)).toBe(false);
  });
  it("dentro do TTL → false", () => {
    expect(isExpired(1_000_000, 1_000_000 + 9 * 60_000)).toBe(false);
  });
  it("além do TTL → true", () => {
    expect(isExpired(1_000_000, 1_000_000 + 11 * 60_000)).toBe(true);
  });
  it("exatamente no limite (10min) → false (só > expira)", () => {
    expect(isExpired(1_000_000, 1_000_000 + 10 * 60_000)).toBe(false);
  });
});
```
- [ ] **Step 2: Run → FAIL.** `node node_modules/vitest/vitest.mjs run src/lib/lens-widget-expiry.test.ts`.
- [ ] **Step 3: Implementar** `src/lib/lens-widget-expiry.ts`:
```ts
/** TTL de inatividade do widget de lentes: limpa os dados após 10 min sem edição. */
export const LENS_WIDGET_TTL_MS = 10 * 60 * 1000;

/** true se passou mais que o TTL desde a última edição. null (nunca editado) → false. */
export function isExpired(lastEditedAt: number | null, now: number, ttlMs: number = LENS_WIDGET_TTL_MS): boolean {
  if (lastEditedAt == null) return false;
  return now - lastEditedAt > ttlMs;
}
```
- [ ] **Step 4: Run → PASS.** + `node node_modules/typescript/bin/tsc --noEmit` → 0.
- [ ] **Step 5: Commit** `feat(lens-widget): regra pura de expiração de 10 min`.

---

## Task 2: prompt da IA — cruzar grau × grade (disponibilidade)

**Files:** `src/lib/ai/lens-advisor.ts` (+ ajustar `src/lib/ai/lens-advisor.test.ts` se necessário).

- [ ] **Step 1: Ajustar/adicionar teste.** LER `lens-advisor.test.ts`. O teste atual asserta que o `system` contém `/NUNCA recalcule|contradiga/i`. Adicionar uma asserção de que o `system` agora também menciona disponibilidade/grade/produto (ex.: `expect(arg.system).toMatch(/grade|disponibilidade|cobre|dioptria/i)`). NÃO quebrar as asserções existentes (nonce, não-contradiz).
- [ ] **Step 2: Run → FAIL** (o system ainda não fala de grade).
- [ ] **Step 3: Implementar.** No `SYSTEM_PROMPT` de `lens-advisor.ts`, ACRESCENTAR (sem remover as regras existentes de não-contradizer/não-inventar-número/nonce) um parágrafo:
  > "Quando o material de referência contiver TABELAS DE GRADE de produtos (faixa de grau/dioptria que cada lente cobre), cruze o grau do cliente com essas tabelas e diga QUAIS produtos cobrem este grau (cabem na dioptria) e quais NÃO. NUNCA invente um produto que não esteja nas tabelas. Se não houver tabela de grade no material, diga que a ótica ainda não cadastrou as tabelas de grade e que a recomendação fica limitada ao índice/espessura."
  Manter o resto do prompt (explicar em linguagem de venda, não recalcular, faixas, nonce). max_tokens pode subir de 600 p/ 800 se precisar (a resposta agora lista produtos) — opcional.
- [ ] **Step 4: Run → PASS.** + `tsc` 0.
- [ ] **Step 5: Commit** `feat(lens-widget): prompt cruza grau × tabelas de grade (disponibilidade de produto)`.

---

## Task 3: hook núcleo `use-lens-advisor` (POSSUI os inputs)

**Files:** `src/components/lens-advisor/use-lens-advisor.ts` (+ `use-lens-advisor.test.ts`).

> Este é o coração da extração. Diferença-chave vs o painel atual: o painel RECEBE `od`/`oe` por prop; o hook os POSSUI como estado (o vendedor digita no widget). Reusar `toNum`/`toEyePower`/`hasGrau` (copiar do painel — são puras) ou movê-las p/ um util compartilhado `src/components/lens-advisor/eye-power.ts` (DRY; recomendado).

- [ ] **Step 1: Testes que falham.** Mockar `fetch` global (vi.fn). Casos:
  - estado inicial: od/oe vazios → `analysis` null, `anyGrau` false.
  - `setOdField("esf","-2")` → `anyGrau` true, `analysis.valid` true, `analysis.od.index.length>0` (motor real, NÃO mockar `analyzeLens`).
  - `explain()`: com fetch mockado devolvendo `{ data: { advice: "texto", aiUnavailable: false } }` → `aiText` vira "texto", `aiLoading` volta false; o body do fetch tem `od`/`oe` como EyePower + frame quando ambos numéricos.
  - degradação: fetch `!ok` OU `aiUnavailable:true` OU advice vazio → `aiError` setado, `aiText` null.
  - limpar IA on change: depois de ter `aiText`, mudar um campo de grau → `aiText` volta null.
  - `reset()`: zera od/oe/armação + aiText/aiError.
  > Para testar um hook, use `@testing-library/react`'s `renderHook` se já estiver no projeto (checar `package.json`); senão, extraia a lógica testável em funções puras + teste o fetch via uma função `buildBody(od,oe,frame)` exportada. Verificar o que o projeto já usa para testes de hook antes de escolher.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementar** `use-lens-advisor.ts`:
  - estado: `od`/`oe` (`EyeGrau`), `lensWidthMm`/`bridgeMm` (strings), `aiText`/`aiLoading`/`aiError`, `lastEditedAt` (number|null).
  - setters `setOdField(field, value)` / `setOeField` / `setLensWidthMm` / `setBridgeMm` que TAMBÉM atualizam `lastEditedAt = Date.now()`. (Date.now() em runtime do browser é ok — só evitar em scripts de workflow, não aqui.)
  - `analysis` memo igual ao painel (reusa `toEyePower`/`hasGrau`).
  - `explain()` = o `handleExplainWithAi` atual (mesmo fetch, mesma serialização, mesma degradação/copy).
  - efeito limpar IA on change `[od, oe, lensWidthMm, bridgeMm]`.
  - `reset()` zera tudo (inclusive `lastEditedAt=null`).
  - retorna `{ od, oe, lensWidthMm, bridgeMm, setOdField, setOeField, setLensWidthMm, setBridgeMm, analysis, anyGrau, odHasGrau, oeHasGrau, disclaimer, aiText, aiLoading, aiError, explain, reset, lastEditedAt }`.
- [ ] **Step 4: Run → PASS.** + `tsc` 0.
- [ ] **Step 5: Commit** `feat(lens-widget): hook use-lens-advisor (núcleo com inputs próprios de receita)`.

---

## Task 4: form compartilhado `lens-advisor-form`

**Files:** `src/components/lens-advisor/lens-advisor-form.tsx` (sem teste de unidade — UI; tsc + uso no FAB cobrem).

- [ ] **Step 1:** Criar o componente client que consome `useLensAdvisor()` e renderiza:
  - **Campos de receita OD/OE:** esférico, cilíndrico, eixo, adição (8 inputs). LABELS ASSOCIADOS (`htmlFor`/`id` com prefixo `od-`/`oe-`, ou `useId()` — aplicar o aprendizado do pacote OURO/A1). Decimais com vírgula, `inputMode="decimal"`.
  - **Armação:** largura da lente + ponte (2 inputs, opcionais).
  - **Resultado do motor:** reusar a renderização `EyeReport` (mover p/ um componente compartilhado `eye-report.tsx` ou inline) + disclaimer + alertas amber (bloco FALHA com "Não consigo recomendar…" e bloco "Atenção", como no painel/pacote OURO).
  - **Botão "Pedir sugestão da IA"** + bloco de sugestão (subordinado, "Sugestão da IA · apoio à venda", legenda) + skeleton no loading + erro amber+ícone — COPIAR o padrão exato do painel atual (linhas 293-339), que já tem os achados do pacote OURO.
  - **Botão "Nova consulta / limpar"** discreto que chama `reset()`.
- [ ] **Step 2: Typecheck** `tsc --noEmit` → 0.
- [ ] **Step 3: Commit** `feat(lens-widget): form compartilhado (receita + motor + IA + limpar)`.

---

## Task 5: FAB + balão `lens-advisor-fab`

**Files:** `src/components/lens-advisor/lens-advisor-fab.tsx`.

- [ ] **Step 1:** Criar o componente client:
  - **Bolinha:** `<button>` real, `fixed bottom-4 right-4 z-40` (abaixo de modais que usam z-50), circular (`h-14 w-14 rounded-full`), acento `bg-primary text-primary-foreground shadow-lg`, ícone lucide `Glasses` (`h-6 w-6`), `aria-label="Assistente de Lentes"`, `aria-expanded`, `focus-visible:ring`, hover com transição de cor (não scale). Alvo ≥44px (14×4=56px ✓). `cursor-pointer`.
  - **Estado:** `open` (boolean). O hook `useLensAdvisor()` vive AQUI (no FAB), p/ o estado da receita persistir enquanto o FAB estiver montado (= durante a navegação client-side, pois mora no layout).
  - **Expiração 10 min:** ao ABRIR (`open` vira true), checar `isExpired(lastEditedAt, Date.now())` → se expirou, chamar `reset()` antes de mostrar. (Assim, reabrir após 10min zera; reabrir antes mantém.)
  - **Balão:** quando `open`, renderizar um card `fixed bottom-20 right-4 z-40 w-[360px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-xl border bg-background shadow-xl` (acima da bolinha). Header com título + botão X (`aria-label="Fechar"`). Corpo = `<LensAdvisorForm/>`. Transição via `transform`/`opacity` (respeitar `prefers-reduced-motion`). Fechar no X, `Esc` (keydown listener), e clique fora (overlay transparente OU detectar click-outside — preferir um listener simples no document enquanto aberto).
  - Mobile: o `max-w-[calc(100vw-2rem)]` já encaixa; em telas pequenas o balão fica quase full-width — aceitável (o spec não pediu full-screen).
- [ ] **Step 2: Typecheck** → 0.
- [ ] **Step 3: Commit** `feat(lens-widget): bolinha (FAB) + balão de chat com expiração de 10 min`.

---

## Task 6: montar a bolinha no layout do dashboard

**Files:** `src/app/(dashboard)/layout.tsx`.

- [ ] **Step 1:** Importar `LensAdvisorFab` e montá-lo como IRMÃO de `<MobileNav />` (dentro de `<BranchProviderWrapper>`, FORA do `<main>`), logo após `<MobileNav />`:
```tsx
import { LensAdvisorFab } from "@/components/lens-advisor/lens-advisor-fab";
// ...
        <MobileNav />
        <LensAdvisorFab />
        <KeyboardShortcuts />
```
  (O FAB é client; o layout é server — importar um client component num server component é ok no App Router.)
- [ ] **Step 2: Typecheck** → 0. Build rápido NÃO necessário aqui (Task 8 faz o build completo).
- [ ] **Step 3: Commit** `feat(lens-widget): monta a bolinha no layout do dashboard da ótica`.

---

## Task 7: remover o painel da OS + deletar o componente antigo

**Files:** `nova/page.tsx`, `[id]/editar/page.tsx`, deletar `lens-advisor-panel.tsx`.

- [ ] **Step 1:** Em `nova/page.tsx`: remover o import `LensAdvisorPanel` (linha ~20), e o bloco `{/* Assistente de Lentes */}` + `<LensAdvisorPanel od={...} oe={...} />` (linha ~1215-1216).
- [ ] **Step 2:** Em `[id]/editar/page.tsx`: mesma remoção (import + `<LensAdvisorPanel>` ~linha 1126).
- [ ] **Step 3:** `grep -rn "LensAdvisorPanel\|lens-advisor-panel" src/` → confirmar que NÃO há mais nenhum uso (nem em testes). Se um teste referenciar, atualizar/remover.
- [ ] **Step 4:** Deletar `src/components/ordens-servico/lens-advisor-panel.tsx`.
- [ ] **Step 5: Typecheck** → 0 (confirma que nada quebrou com a remoção).
- [ ] **Step 6: Commit** `refactor(lens-widget): remove painel da OS (migrou p/ a bolinha global)`.

---

## Task 8: Verificação final

- [ ] **Step 1:** Suíte completa: `node node_modules/vitest/vitest.mjs run` → tudo verde (inclui expiry + hook + prompt).
- [ ] **Step 2:** Typecheck → 0.
- [ ] **Step 3:** Migração: NENHUMA nova (`git status` em prisma/ limpo).
- [ ] **Step 4:** Build: `TMPDIR=... next build` → "✓ Compiled successfully". Confirmar que `lens-advisor-panel` não aparece mais e que o layout compila com o FAB.
- [ ] **Step 5: Resumo + critério de saída.** Confirmar: a bolinha aparece em todo o dashboard da ótica (não no admin/login); o motor roda grátis no balão; o botão IA passa por `assertAiAllowed`+crédito e degrada gracioso; a IA cruza grau × grade quando há tabelas; a receita expira após 10 min; a OS não tem mais o painel. **PARAR antes do deploy.** Deploy: só código (sem migração), conferir drift + `migrate status` antes, gate do dono.

---

## Segurança / cuidados
- **Sem migração, sem env nova.** Reusa rota/motor/base de conhecimento/medição existentes.
- **Degradação graciosa preservada** (3 pontos) — o motor sempre aparece; IA off/sem crédito → nota discreta.
- **IA nunca inventa produto** — o prompt instrui a só citar produtos que estão nas tabelas; sem tabela → diz que falta cadastrar.
- **A bolinha NÃO vaza pro admin** (layout separado) nem aparece deslogado (gate `auth()` do layout).
- **z-index:** FAB/balão em `z-40`, abaixo de modais (`z-50`) p/ não cobrir diálogos.
- **Acessibilidade:** bolinha é `<button>` real com `aria-label`; balão fecha no Esc; labels de receita associados; foco visível.

## Notas de deploy
- Só código. Conferir `git merge-base --is-ancestor origin/main HEAD` + `migrate status` antes (lição recorrente).
- A base de conhecimento precisa das tabelas de grade cadastradas (dono) p/ a parte de disponibilidade ter dados — sem elas, a IA explica índice/espessura e avisa que falta cadastrar a grade.

## Fora de escopo (do spec)
- Campos estruturados de grade no produto; chat de ida-e-volta; puxar receita de OS/orçamento; preço/estoque real.
