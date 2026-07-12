# Design System de Toque — Overhaul Mobile/iPad (PDV Ótica)

> Fonte única para as Fases 1–3. Destilado do `ui-ux-pro-max` + do painel adversarial.
> Reusa o design system existente do app (HSL vars, shadcn). NÃO introduz cores/fontes novas.

## Breakpoints (já em `tailwind.config.js` e `use-media-query.ts`)
- `< md` (768) → **phone**: layout empilhado / abas.
- `tab` (768–1023) → **iPad portrait**: estação de trabalho lado-a-lado.
- `≥ lg` (1024) → **desktop / iPad landscape**: layout atual preservado.

Regra de ouro: **não regredir o desktop.** Todo padrão mobile entra por `max-`/prefixo baixo; o layout `lg` fica idêntico ao de hoje.

## Alvos de toque (CRÍTICO — o "sized accessibly" do dono)
- Mínimo **44×44px** em elemento operado pelo dedo. Usar `size="touch"` / `size="icon-touch"` do Button (já criados na Fase 0) ou `min-h-11 min-w-11`.
- **Gap ≥ 8px** (`gap-2`) entre alvos adjacentes. Nada de `gap-0/gap-1` em clusters tapáveis.
- `touch-action: manipulation` em zonas de tap intensivo (remove delay de 300ms).
- `inputMode` correto em todo input numérico (`decimal` p/ valores, `numeric` p/ inteiros como eixo).
- Inputs: `font-size ≥ 16px` no mobile já garantido por globals.css (anti-zoom iOS). Altura de input tapável = `h-11` (44px), subindo de `h-6/h-7/h-8`.

## Barra de ação fixa (PDV, telas de fechamento)
- `fixed`/`sticky bottom-0`, largura total, respeitando `.pb-safe` (safe-area do iPhone).
- Escala de z-index do app: **10 / 20 / 30 / 50**. Barra de ação do PDV = `z-20` (acima do conteúdo, abaixo de dialogs/sheets que são `z-50`). Bottom-nav global existente = manter sua camada; a barra do PDV substitui/oculta a bottom-nav enquanto no PDV para não empilhar duas barras.
- Conteúdo scrollável reserva padding-bottom = altura da barra, senão o último item fica atrás dela.

## Padrão PDV responsivo (Fase 1)
- **Phone (`< md`)**: abas **Produtos ⇄ Carrinho** (shadcn `Tabs`). Aba Carrinho com **badge de contagem** (`totalItens`). Barra fixa no rodapé: `Total R$ X` + botão `Finalizar (F4)` full-width `size="touch"`. Some o "rolar catálogo inteiro pra achar o carrinho".
- **iPad (`tab`)**: **lado-a-lado** — `grid tab:grid-cols-[1fr_minmax(340px,380px)]`. Coluna do carrinho com scroll próprio e `sticky`. Vira o caixa do balcão.
- **Desktop (`lg`)**: grid 2:1 atual, intocado.
- **Altura**: no mobile trocar o container de altura fixa por flex com `100dvh` + safe-area (cresce sem clipar a barra do iOS); **manter altura fixa no `lg`** (o scroll interno das colunas depende disso — regressão comprovada no painel).

## Padrão modal de fechamento tapável (Fase 2)
- Radix Dialog já vira full-screen no phone (globals.css). O que muda é o **interior**:
  - Grids `grid-cols-2`/`grid-cols-3` → `grid-cols-1 tab:grid-cols-2` (empilha no phone).
  - Método de pagamento: alvos ≥44px, ícone ≥20px (`h-5 w-5`, subindo de `h-3 w-3`), label ≥`text-sm` (subindo de `text-[9px]`).
  - Inputs valor/parcelas/cartão: `h-11`, label `text-sm`.
- Swipe-to-dismiss (opcional): reusar shadcn **`Sheet`** (`side="bottom"`). **NUNCA `vaul`** (colide com `transform:none !important` do globals + duplica o Sheet).
- Preservar o layout 2-col no `tab`/`lg`.

## Padrão "cartão por olho" — grade de receita (Fase 3)
- **Phone**: cartões empilhados **OD** depois **OE**. Cada campo (esf/cil/eixo/dnp/altura/adição) em linha rótulo→input, input `h-11` tapável, `inputMode` numérico.
  - **Digitação livre** em **eixo (0–180 inteiro), DNP e altura (mm)** — exatidão; erro aqui = lente errada. **Sem stepper** nesses.
  - Stepper −/+ (`icon-touch`) **apenas** em esf/cil/adição (¼ diop), opcional.
- **iPad/desktop**: manter a **tabela** (correspondência visual com a receita em papel), com células de toque maiores.

## Anti-slop / qualidade (checklist por tela)
- Ícones SVG (Lucide) — nunca emoji como ícone de UI.
- `cursor-pointer` + hover em tudo clicável; transições 150–200ms.
- Contraste ≥4.5:1 nos dois temas; foco visível para teclado.
- `prefers-reduced-motion` respeitado.
- **Nenhuma barra horizontal no body** (guard `overflow-x:clip` já ativo) — validar a 375/768/834/1024.
- `aria-label` em botões só-ícone (lixeira, +/−).
