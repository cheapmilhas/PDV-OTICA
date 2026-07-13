# Alvos de Toque ≥44px no Mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que os controles de ícone tocáveis do Vis no celular tenham **altura** mínima de 44px (Apple HIG / WCAG 2.5.5), sem inchar o desktop que compartilha os mesmos componentes e sem estourar toolbars horizontais densas.

**Architecture:** Estratégia **híbrida, só no eixo vertical**. A revisão adversarial (Codex, 2 rodadas) mostrou que embutir `sm:h-9` no variant vaza pro desktop via tailwind-merge, e que `min-w-11` estoura toolbars horizontais densas (steppers do PDV, botões subir/descer) em telas estreitas. Solução: (1) variant `icon` do button.tsx ganha `min-h-11 sm:min-h-[auto]` — piso de 44px de ALTURA no mobile que o tailwind-merge NÃO anula (min-height e height são grupos separados), zerado no desktop; SEM `min-w` (largura fica intocada, nenhum overflow horizontal). (2) Fix cirúrgico de altura nos 3 controles de layout onipresente (sino, menu usuário, hamburger). (3) Override local no calendário (as células de dia usam `aspect-square`, que o `min-h-11` quebraria). Largura de 44px e botões `size="sm"` com texto ficam para fatias futuras, decididos com o render real no iPhone.

**Tech Stack:** Next.js 16.2.6, React, Tailwind CSS (mobile-first), class-variance-authority (cva), tailwind-merge 3.4.0, Vitest.

**Environment notes:**
- Tailwind mobile-first: classe base = mobile; `sm:` = viewport ≥640px. `min-h-11 sm:min-h-[auto]` = "piso de 44px de altura no celular, sem piso no desktop".
- Por que `sm:min-h-[auto]` e não `sm:min-h-0`: o default de `min-height` é `auto`, não `0`; em flex `0` difere de `auto`. `[auto]` restaura fielmente. (Confirmado com Codex.)
- Por que `min-h` e não `h-11`: tailwind-merge trata `min-h-*` e `h-*` como grupos SEPARADOS, então um consumidor com `className="h-6 w-6"` (ex.: steppers do PDV) NÃO anula o piso — o botão fica ≥44px de altura mesmo com override. (Verificado rodando o twMerge 3.4.0 real.)
- SEM `min-w`: decisão do dono. Largura de 44px estouraria grupos horizontais densos em 320px. Altura sempre cresce a linha sem overflow.
- NÃO trocar `default`, `sm`, `icon-sm`. Fora de escopo.
- Branch: `feat/mobile-touch-targets` (já criada). SEM worktree.
- Deploy manual, fora deste plano. `git add` com paths específicos, NUNCA `git add -A`.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/components/ui/button.tsx` | variant `icon` com piso de altura 44px no toque | Modify (linha 30) |
| `src/components/ui/button.test.tsx` | teste do piso + do merge com override | Create |
| `src/components/ui/calendar.tsx` | neutraliza o piso nos dias (aspect-square) | Modify (linha 204) |
| `src/components/layout/header.tsx` | sino + menu de usuário → 44px de altura no toque | Modify (318, 455) |
| `src/components/layout/mobile-sidebar.tsx` | hamburger → 44px | Modify (linha 15) |

---

## Task 1: Piso de altura de 44px no variant `icon`

**Files:**
- Modify: `src/components/ui/button.tsx:30`
- Test: `src/components/ui/button.test.tsx` (novo)

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/components/ui/button.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "./button";

describe("Button size=icon — piso de altura tocável no mobile", () => {
  it("variant icon inclui min-h-11 e o remove no desktop (sm:min-h-[auto])", () => {
    const { getByRole } = render(<Button size="icon" aria-label="x" />);
    const cls = getByRole("button").className;
    expect(cls).toContain("min-h-11");
    expect(cls).toContain("sm:min-h-[auto]");
  });

  it("NÃO adiciona min-w (largura fica livre pra não estourar toolbar)", () => {
    const cls = buttonVariants({ size: "icon" });
    expect(cls).not.toContain("min-w-11");
  });

  it("o piso de altura sobrevive a um override h-6 w-6 do consumidor", () => {
    // tailwind-merge: min-h-* e h-* são grupos separados → min-h-11 permanece
    const merged = cn(buttonVariants({ size: "icon" }), "h-6 w-6");
    expect(merged).toContain("min-h-11");
    expect(merged).toContain("h-6");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `./node_modules/.bin/vitest run src/components/ui/button.test.tsx`
Expected: FAIL — o `icon` atual é `h-9 w-9`, sem `min-h-11`.

- [ ] **Step 3: Editar o variant `icon`**

Em `src/components/ui/button.tsx:30`, trocar:

```
        icon: "h-9 w-9",
```

por:

```
        icon: "h-9 w-9 min-h-11 sm:min-h-[auto]",
```

(NÃO adicionar `min-w`. NÃO tocar outros variants.)

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `./node_modules/.bin/vitest run src/components/ui/button.test.tsx`
Expected: PASS nos três testes.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/button.test.tsx
git commit -m "feat(mobile): variant icon do Button com piso de 44px de altura no toque"
```

---

## Task 2: Neutralizar o piso nas células do calendário

**Files:**
- Modify: `src/components/ui/calendar.tsx:204`

Os dias usam `<Button size="icon">` (linha 189) com `aspect-square h-auto w-full min-w-[--cell-size]` (linha 204). Com o Task 1, `min-h-11` forçaria a célula a ≥44px de altura no mobile, quebrando o `aspect-square` (que espera altura = largura = --cell-size, 32px) e inflando/desalinhando o grid. Neutralizar.

- [ ] **Step 1: Adicionar `min-h-0` à classe do dia**

Em `src/components/ui/calendar.tsx:204`, dentro da string de classes do `cn(...)`, acrescentar `min-h-0` (mesmo grupo que `min-h-11`; como vem depois na composição via `className`, o twMerge remove o `min-h-11` herdado). Localizar o trecho `... aspect-square h-auto w-full min-w-[--cell-size] ...` e inserir `min-h-0`:

De:
```
"...flex aspect-square h-auto w-full min-w-[--cell-size] flex-col gap-1 font-normal leading-none..."
```
Para:
```
"...flex aspect-square h-auto w-full min-h-0 min-w-[--cell-size] flex-col gap-1 font-normal leading-none..."
```

- [ ] **Step 2: Confirmar via merge que o piso foi neutralizado**

Adicionar ao `src/components/ui/button.test.tsx` (ou um teste rápido inline) — na prática, verificar no Step 3 visual. Comando de sanidade:

Run: `grep -n "min-h-0" src/components/ui/calendar.tsx`
Expected: encontra a classe adicionada na linha ~204.

- [ ] **Step 3: Verificação visual do grid (mobile)**

Abrir uma tela com date-picker (ex.: filtro de data em `relatorios`) no viewport mobile e confirmar 7 colunas compactas, células ~32px, sem desalinhamento. Se o subagente não abrir navegador: marcar "PENDENTE verificação visual do dono" e seguir.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/calendar.tsx
git commit -m "fix(mobile): células do calendário ignoram o piso de altura do icon (aspect-square)"
```

---

## Task 3: Controles onipresentes do header → 44px de altura no toque

**Files:**
- Modify: `src/components/layout/header.tsx:318` (sino)
- Modify: `src/components/layout/header.tsx:455` (menu de usuário)

Ambos têm classe de altura explícita (`h-8`) que sobrescreve o variant, então o Task 1 não os cobre — fix direto. O header tem 60px fixos (`h-[60px]`, linha 260), então 44px não corta.

- [ ] **Step 1: Sino de notificações**

Em `src/components/layout/header.tsx:318`, trocar:

```
            <Button variant="ghost" size="icon" className="relative h-8 w-8">
```

por:

```
            <Button variant="ghost" size="icon" className="relative h-11 w-11 sm:h-8 sm:w-8">
```

(O badge `absolute` permanece ancorado ao novo box. Aqui uso `h-11 w-11` direto — é um ícone solitário no header, sem toolbar densa, então a largura de 44px é segura e desejável.)

- [ ] **Step 2: Menu de usuário**

Em `src/components/layout/header.tsx:455`, trocar:

```
            <Button variant="ghost" size="sm" className="gap-2 h-8 px-2">
```

por:

```
            <Button variant="ghost" size="sm" className="gap-2 h-11 px-2 sm:h-8">
```

(Só altura — a largura já é confortável com avatar + padding. No mobile só o avatar aparece.)

- [ ] **Step 3: Typecheck do arquivo**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep header || echo "sem erros em header.tsx"`
Expected: "sem erros em header.tsx".

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/header.tsx
git commit -m "feat(mobile): sino e menu de usuário do header com alvo de 44px no toque"
```

---

## Task 4: Hamburger → 44px

**Files:**
- Modify: `src/components/layout/mobile-sidebar.tsx:15`

O hamburger é `md:hidden` (só existe abaixo de 768px), e some só em `md`. Se herdasse o `icon` padrão via Task 1, ganharia só o piso de altura; a largura ficaria em 36px. Como é ícone solitário sem toolbar, dar 44px cheio via `icon-touch` (variant existente = `h-11 w-11` fixo).

- [ ] **Step 1: Trocar para `icon-touch`**

Em `src/components/layout/mobile-sidebar.tsx:15`, trocar:

```
        <Button variant="ghost" size="icon" className="md:hidden">
```

por:

```
        <Button variant="ghost" size="icon-touch" className="md:hidden">
```

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep mobile-sidebar || echo "sem erros"`
Expected: "sem erros".

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/mobile-sidebar.tsx
git commit -m "feat(mobile): hamburger usa icon-touch (44px)"
```

---

## Task 5: Verificação completa (OBRIGATÓRIA)

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 2: Suíte de testes completa**

Run: `./node_modules/.bin/vitest run`
Expected: todos passam (incluindo `button.test.tsx`).

- [ ] **Step 3: Build de produção**

Run: `./node_modules/.bin/next build`
Expected: sucesso (se aparecer erro pré-existente de rota de API, confirmar que NÃO é dos arquivos tocados aqui).

- [ ] **Step 4: Confirmar raio de blast**

Run: `git diff main --stat`
Expected: apenas `button.tsx`, `button.test.tsx`, `calendar.tsx`, `header.tsx`, `mobile-sidebar.tsx`. NENHUM arquivo de tela (`app/.../page.tsx`) alterado.

- [ ] **Step 5: Resumo dos itens que precisam verificação visual**

Anotar: sino, menu de usuário, hamburger e grid do calendário precisam de conferência no iPhone (dono valida). Os ~30 arquivos de ícone-nu herdam o piso de altura de 44px automaticamente pelo Task 1, sem mudança de largura.

---

## Fora de escopo (fatias futuras — registrar, NÃO fazer)

- **Largura de 44px** em ações de ícone: adiada. Grupos horizontais densos (steppers do PDV `pdv/page.tsx:1471`, subir/descer `gerenciar-colunas-dialog.tsx:143`, ranking `ranking-tab.tsx:292`, orçamentos, transferências) estourariam em 320px. Reavaliar caso-a-caso com o render real no iPhone.
- **Botões `size="sm"` COM TEXTO** (91 arquivos): 32px de altura, largura confortável. Prioridade menor.
- **Falso-positivo** do "× limpar busca" do global-search: NÃO existe (ícones decorativos não-clicáveis). Nada a fazer.
- **`sm:` = 640px, não "touch"**: tablets/foldables ≥640px voltam ao tamanho compacto. Aceito nesta fatia (o alvo é retrato estreito). Se virar requisito real de "qualquer dispositivo touch", trocar o critério de breakpoint para detecção de ponteiro (`@media (pointer: coarse)`) numa fatia futura.
```
