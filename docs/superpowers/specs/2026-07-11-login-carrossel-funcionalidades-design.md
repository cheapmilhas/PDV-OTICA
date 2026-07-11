# Carrossel de funcionalidades no painel de login — Design

**Data:** 2026-07-11
**Branch:** `fix/login-panel-logo` (contém o fix do logo; carrossel entra no mesmo deploy)
**Origem:** plan mode (aprovado) → brainstorming

## Contexto

O painel lateral do login (`src/app/(auth)/login/login-side-panel.tsx`, `<aside hidden lg:flex>`) hoje mostra um bloco estático de "novidades". O dono quer que ele **mostre as funcionalidades do sistema rotativamente** — para lembrar o dono da ótica (que já é cliente) do valor do Vis, inclusive features que ele talvez nem saiba que existem. Decidido com o dono: **mockups do produto em CSS, não fotos de pessoas**; **carrossel rotativo**.

## Decisão de arquitetura (com análise da dupla Codex)

Carrossel **client-side, CSS puro, conteúdo estático em TS**. O Codex confirmou que isso NÃO reabre o incidente de Function Invocations (aquilo era polling/fetch ao servidor; trocar slide no DOM não toca o servidor). Ressalvas do Codex incorporadas: CSS puro em vez de framer-motion (evita peso no bundle da rota mais batida); auto-rotação deve pausar no hover/foco e respeitar `prefers-reduced-motion`; intervalo 7-8s; não roubar foco do formulário.

## Conteúdo

**5 features de `src/content/features.ts`** (já escritas em linguagem de balcão, cada uma com `name`, `icon` lucide, `subtitle`, `mockupCaption`): PDV, Ordens de serviço (OS de lente), Controle de estoque, Gestão financeira, Leitura de receita por IA. Ordem: **Leitura de receita por IA primeiro** (maior "uau"), depois OS, Financeiro, Estoque, PDV.

**+ Novidade quando houver:** se `loginPanelContent.releases` tem uma release fresca (≤14 dias, regra atual), ela entra como slide adicional NO INÍCIO do carrossel. Reaproveita o `daysAgo`/`MAX_RELEASE_AGE_DAYS` existentes. Funil/WhatsApp fora de escopo v1 (não está em `features.ts`).

## Componentes

### 1. `login-panel-content.ts` (estender)
Adicionar um tipo discriminado e a lista de slides derivada:
```ts
type PanelSlide =
  | { kind: "feature"; slug: string; name: string; icon: string; caption: string; blurb: string }
  | { kind: "release"; date: string; title: string; items: string[] };
```
Uma função `buildSlides(today?)` que: monta os slides de feature a partir de `features.ts` (na ordem definida), e prepende o slide de release SE houver release fresca. `loginPanelContent.releases` permanece como está (fonte da novidade).

### 2. `login-feature-carousel.tsx` (novo, `"use client"`)
`"use client"` só pelo estado do índice + timer.
- `useState(activeIndex)`; `useEffect` com `setInterval(7500ms)` avançando o índice (wrap-around).
- Transição por **CSS** (`opacity` + leve `translateX`, ~200ms) — sem framer-motion.
- **Pausa**: `onMouseEnter`/`onFocusCapture` no container zera o timer; `onMouseLeave`/`onBlurCapture` retoma. Pausa também quando `document.hidden` (listener `visibilitychange`).
- **reduced-motion**: `matchMedia("(prefers-reduced-motion: reduce)")` → sem auto-avanço, sem translateX (troca instantânea), dots continuam funcionais.
- **A11y**: container com `role="group"` + `aria-roledescription="carrossel"` + `aria-label`; `aria-live="off"` durante auto-rotação; dots são `<button>` com `aria-label` ("Ir para slide N") e `aria-current`; navegável por teclado (setas ou tab nos dots).
- Cada slide: mini-mockup em CSS usando `BrowserFrame` (`src/components/landing-layout/browser-frame.tsx`) com ícone lucide grande + `caption`; abaixo, `name` + `blurb`. Slide de release: mostra "Novidades" + título + bullets + selo de recência (como hoje).
- Máx. 6 slides.

### 3. `login-side-panel.tsx` (integrar)
Substitui o bloco de novidade atual por `<LoginFeatureCarousel slides={buildSlides(today)} />`. Mantém o logo (VisLogo, já corrigido), o `hidden lg:flex` (some no mobile) e o guard de suporte WhatsApp. O `<aside>` continua sendo o landmark.

## Invariante de segurança
Puramente visual. NÃO toca `signIn`/`signOut`/`handleSubmit`/`formData` em `page.tsx`. **Zero fetch** no carrossel (garante nenhuma Function Invocation). Verificar por grep no diff.

## Reaproveitamento
- `src/content/features.ts` — conteúdo das features (não reescrever).
- `src/components/landing-layout/browser-frame.tsx` — moldura de mockup.
- `src/components/landing-layout/vis-logo.tsx` — logo (já em uso pós-fix).
- `featureIcons` de `features.ts` — resolve string→componente lucide.
- Tokens `--brand-*`/`--lp-*` de `globals.css`.
- `daysAgo`/`formatRelative` de `relative-date.ts` — recência da novidade.

## Erros / casos-limite
- Sem release fresca → carrossel só com as 5 features. Não quebra.
- `matchMedia` indisponível (SSR/jsdom) → tratar como "sem reduced-motion" com guard (`typeof window`).
- Timer limpo no unmount (evitar leak).
- Ícone lucide não encontrado em `featureIcons` → fallback para um ícone padrão.
- Carrossel independente do login — se quebrar, o form continua funcionando.

## Testes (vitest + jsdom, padrão do projeto; `.toBeTruthy()`/`.toBeNull()`, sem jest-dom)
- `buildSlides`: 5 slides de feature na ordem certa; +1 no início quando há release fresca; só 5 quando release velha/ausente.
- Rotação: `vi.useFakeTimers()` → após 7500ms o índice avança; wrap-around no fim.
- Pausa: `mouseenter`/foco para o avanço; `mouseleave` retoma.
- reduced-motion: `matchMedia` mockado como `matches:true` → sem auto-avanço; dots presentes.
- Dots: clique navega ao slide certo; `aria-current` no ativo.
- Zero fetch: nenhum `fetch`/`XMLHttpRequest` chamado (spy).
- `document.hidden` → pausa.

## Fora de escopo
- Funil/WhatsApp como feature (v2, precisa texto novo).
- Screenshots reais PNG do produto (mockup CSS basta).
- Fotos de pessoas (decidido: não).
- CMS/banco (estático basta).
