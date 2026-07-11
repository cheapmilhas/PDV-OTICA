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

**Mapeamento `FeaturePage` (features.ts) → slide de feature** (explícito — `FeaturePage` tem `name`/`icon`/`subtitle`/`mockupCaption?`/`slug`, NÃO tem `caption`/`blurb`):
- `slug ← slug`
- `name ← name`
- `icon ← icon`
- `caption ← mockupCaption` (é opcional; **fallback para `name` se ausente**)
- `blurb ← subtitle`

## Componentes

### 1. `login-panel-content.ts` (estender)
Adicionar um tipo discriminado e a lista de slides derivada:
```ts
type PanelSlide =
  | { kind: "feature"; slug: string; name: string; icon: string; caption: string; blurb: string; screenshot?: string }
  | { kind: "release"; date: string; title: string; items: string[] };
```
Uma função `buildSlides(today?)` que: monta os slides de feature a partir de `features.ts` (na ordem definida), e prepende o slide de release SE houver release fresca. `loginPanelContent.releases` permanece como está (fonte da novidade).

**Screenshots reais (fornecidos pelo dono):** cada feature pode ter um `screenshot` — caminho para um PNG **real da tela do sistema**, capturado pelo dono no dogfood de produção (dados reais/populados, sem PII visível). Os arquivos vão em `public/features/<slug>.png`. Um mapa `featureScreenshots: Record<slug, string>` em `login-panel-content.ts` associa slug→caminho; `buildSlides` preenche `screenshot` quando o arquivo estiver mapeado. **Fallback:** enquanto um slug não tiver screenshot, o slide usa o mockup CSS (BrowserFrame + ícone). Assim a feature funciona já, e cada print que o dono enviar substitui um mockup por tela real — incremental, sem bloquear.

### 2. `login-feature-carousel.tsx` (novo, `"use client"`)
`"use client"` só pelo estado do índice + timer.
- `useState(activeIndex)`; `useEffect` com `setInterval(7500ms)` avançando o índice (wrap-around).
- Transição por **CSS** (`opacity` + leve `translateX`, ~200ms) — sem framer-motion.
- **Pausa**: `onMouseEnter`/`onFocusCapture` no container zera o timer; `onMouseLeave`/`onBlurCapture` retoma. Pausa também quando `document.hidden` (listener `visibilitychange`).
- **reduced-motion**: `matchMedia("(prefers-reduced-motion: reduce)")` → sem auto-avanço, sem translateX (troca instantânea), dots continuam funcionais.
- **A11y**: container com `role="group"` + `aria-roledescription="carrossel"` + `aria-label`. `aria-live="off"` **sempre** (auto-rotação nunca anuncia; navegação manual muda o slide visível, suficiente para o contexto de login — decisão explícita, não alterna para polite). Dots são `<button>` com `aria-label` ("Ir para novidade N" / "Ir para funcionalidade: {name}") e `aria-current="true"` no ativo. **Foco visível**: dots com `:focus-visible` usando anel `--brand-primary` (WCAG 2.4.7 — o fundo do painel é claro, o foco default não seria visível).
- **Teclado**: `ArrowRight`/`ArrowLeft` no container avançam/retrocedem o slide **e pausam o auto-avanço** (o usuário assumiu controle); Tab alcança os dots, Enter/Space ativa. Sem Cima/Baixo (evita conflito com scroll).
- Cada slide de feature: se `screenshot` existe → renderiza o PNG real dentro do `BrowserFrame` (via `next/image`, `width`/`height` explícitos + `style={{width:"auto"}}`, padrão do projeto); senão → fallback mockup CSS (`BrowserFrame` + ícone lucide grande + `caption`). Abaixo do frame: `name` + `blurb`. Slide de release: "Novidades" + título + bullets + selo de recência (como hoje).
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
- **≤1 slide** (invariante: as 5 features são fixas, então o mínimo real é 5 — mas `buildSlides` deve degradar): com 1 slide, **sem auto-avanço e sem dots** (nada a rotacionar); com 0 slides, o carrossel não renderiza (o painel fica só com logo + suporte).
- `mockupCaption` ausente numa feature → `caption` usa `name` (fallback já no mapeamento).
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
- Teclado: `ArrowRight`/`ArrowLeft` no container mudam o slide e pausam o auto-avanço.
- `buildSlides` com 1 slide → sem dots e sem auto-avanço; com 0 → carrossel não renderiza.
- Fallback: feature sem `mockupCaption` → caption = `name`.
- Slide com `screenshot` → renderiza `<img>`/next-image do PNG; slide sem → renderiza o mockup CSS (BrowserFrame + ícone). Ambos os caminhos testados.
- Zero fetch: nenhum `fetch`/`XMLHttpRequest` chamado (spy).
- `document.hidden` → pausa.

## Dependência do dono (fora do código)
Screenshots reais das telas do Vis, capturados no dogfood de produção (dados populados, **sem PII visível** — recortar/escolher telas seguras, pois a imagem fica pública na tela de login). Formato: PNG, proporção de tela de navegador. Salvar em `public/features/<slug>.png` (slugs: `leitura-de-receita-ia`, `ordem-de-servico-otica`, `gestao-financeira-otica`, `controle-de-estoque-otica`, `pdv-para-otica`). O carrossel funciona SEM eles (fallback mockup CSS); cada print enviado melhora um slide. Não bloqueante para a v1.

## Fora de escopo
- Funil/WhatsApp como feature (v2, precisa texto novo).
- Fotos de pessoas (decidido: não).
- CMS/banco (estático basta).
- Popular seed fake para gerar screenshots (decidido: dono captura no dogfood real).
