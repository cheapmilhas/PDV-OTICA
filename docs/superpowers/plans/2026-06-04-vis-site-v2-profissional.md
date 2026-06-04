# Site Vis v2 Profissional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o site público da Vis (https://vis.app.br) profissional e honesto, com prova social verificável, páginas de SEO (funcionalidades, comparativo, blog) e polish visual — sem prometer features que o sistema não tem.

**Architecture:** Next.js 14 App Router. Tudo público vive em `src/app/(landing)/` (herda Header/Footer Vis). Seções da home em `src/components/home/*`, layout em `src/components/landing-layout/*`, conteúdo orientado a dados em `src/content/*.ts`, SEO em `src/components/seo/json-ld.tsx`. Tema claro Vis (azul #2E6BFF / ciano #22C3E6 / navy #0A1F44) via CSS vars `--lp-*`/`--brand-*` em `globals.css`. App/dashboard segue teal (fora de escopo).

**Tech Stack:** Next.js 14, TypeScript, Tailwind, framer-motion, Plus Jakarta Sans. Sem novas dependências (`.prose-vis` é CSS custom, não @tailwindcss/typography).

**Spec:** `docs/superpowers/specs/2026-06-04-vis-site-v2-profissional-design.md`

**Convenção de "teste" deste plano:** este trabalho é UI/conteúdo, não lógica de negócio — não há testes unitários. O gate de cada sprint é: `npx tsc --noEmit` limpo + `npm run build` verde + screenshot via Playwright no localhost confirmando o resultado visual + commit. Sempre `rm -rf .next` antes do `tsc`/commit final do sprint (o cache de tipos fica stale após mover/criar rotas e o husky pre-commit roda tsc).

---

## File Structure

**Sprint 1 — Fundação**
- Modify: `src/app/globals.css` (corrigir cores legadas L387-389; adicionar `.vis-card` em @layer components)
- Create: `src/components/home/section-heading.tsx`
- Modify: `src/components/home/security.tsx`, `features-bento.tsx`, `problems-solutions.tsx` (usar SectionHeading + .vis-card + focus-ring)

**Sprint 2 — Home**
- Modify: `src/app/(landing)/page.tsx` (remover LiveSalesTicker + Testimonials; inserir TrustProof)
- Create: `src/components/home/trust-proof.tsx`
- Modify: `src/content/pricing.ts`, `src/lib/plan-feature-catalog.ts` (comentário)
- Delete (cleanup): `src/components/home/live-sales-ticker.tsx`, `testimonials.tsx`, `src/content/testimonials.ts`

**Sprint 3 — Funcionalidades**
- Create: `src/content/features.ts`, `src/components/landing-layout/browser-frame.tsx`, `src/components/funcionalidades/feature-page.tsx`
- Create: `src/app/(landing)/funcionalidades/page.tsx` (hub), `funcionalidades/[slug]/page.tsx` + 5 entradas em features.ts

**Sprint 4 — Comparativo**
- Create: `src/app/(landing)/vis-vs-planilha/page.tsx`, `src/components/funcionalidades/comparison-table.tsx`

**Sprint 5 — Blog**
- Create: `src/content/blog.ts`, `src/app/(landing)/blog/page.tsx`, `blog/[slug]/page.tsx`
- Modify: `src/app/globals.css` (`.prose-vis`), `src/app/(landing)/privacidade/page.tsx` + `termos/page.tsx` (migrar prose→prose-vis)

**Sprint 6 — SEO técnico**
- Modify: `src/app/sitemap.ts`, `src/components/seo/json-ld.tsx` (add BlogPosting + Product builders), `public/llms.txt`, `src/lib/constants.ts` (NAV_LINKS, FOOTER_LINKS, /demo)

**Sprint 7 — QA + Deploy** (sem arquivos novos; polish + deploy)

---

## SPRINT 1 — Fundação

### Task 1.1: Corrigir cores legadas no globals.css

**Files:** Modify `src/app/globals.css:387-391`

- [ ] **Step 1: Grep de segurança** — confirmar quem usa as classes fora de components/home

Run: `cd "/Users/matheusreboucas/PDV OTICA" && grep -rln "bg-brand-primary/10\|bg-brand-accent/10\|bg-brand-primary/5" src/ | grep -v "components/home"`
Expected: lista de arquivos (pages/* órfãos, exit-intent-popup, contact). A mudança alinha todos à marca — desejável.

- [ ] **Step 2: Trocar os RGBs legados pelos da marca Vis**

Em `src/app/globals.css`, substituir:
```css
  .bg-brand-primary\/10 { background-color: rgba(46, 107, 255, 0.10); }
  .bg-brand-primary\/5  { background-color: rgba(46, 107, 255, 0.05); }
  .bg-brand-accent\/10  { background-color: rgba(34, 195, 230, 0.10); }
```
(success/warning permanecem — já corretos.)

- [ ] **Step 3: Verificar** — `grep -n "99, 102, 241\|14, 165, 233" src/app/globals.css` → Expected: sem resultados.

### Task 1.2: Criar `.vis-card` utility

**Files:** Modify `src/app/globals.css` (@layer components, perto das outras utilities de card)

- [ ] **Step 1: Adicionar a classe**
```css
  .vis-card {
    border-radius: 1rem;
    padding: 1.5rem; /* p-6 default; sobrescreva com utility p-5 quando preciso (utilities ganham do @layer components) */
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    transition: transform .3s, box-shadow .3s, border-color .3s;
  }
  .vis-card:hover {
    transform: translateY(-4px);
    border-color: var(--lp-border-hover);
    box-shadow: 0 8px 28px rgba(10, 31, 68, 0.10);
  }
```

- [ ] **Step 2: Build check** — `npx tsc --noEmit` (CSS não afeta tsc, mas garante baseline). Continua.

### Task 1.3: Criar `<SectionHeading>`

**Files:** Create `src/components/home/section-heading.tsx`

- [ ] **Step 1: Criar o componente**
```tsx
interface SectionHeadingProps {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  align?: "left" | "center";
  className?: string;
}

export function SectionHeading({ eyebrow, title, subtitle, align = "center", className }: SectionHeadingProps) {
  const isCenter = align === "center";
  return (
    <div className={`${isCenter ? "text-center mx-auto" : ""} mb-12 md:mb-16 ${className ?? ""}`}>
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "var(--brand-primary)" }}>
          {eyebrow}
        </p>
      )}
      <h2 className="font-heading font-extrabold tracking-tight" style={{ fontSize: "var(--text-h1)", lineHeight: 1.1, letterSpacing: "-0.025em", color: "var(--lp-foreground)" }}>
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-4 ${isCenter ? "max-w-xl mx-auto" : "max-w-xl"}`} style={{ color: "var(--lp-muted)", fontSize: "1rem", lineHeight: 1.65 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: tsc** — `npx tsc --noEmit` → Expected: No errors.

### Task 1.4: Refatorar Security para usar SectionHeading + .vis-card + cores Vis

**Files:** Modify `src/components/home/security.tsx`

- [ ] **Step 1:** Importar SectionHeading; substituir o bloco de header manual por `<SectionHeading eyebrow="Segurança & confiança" title={...} subtitle={...} />`. Trocar os cards para className `.vis-card` (já que usam bg-brand-*/10 que agora estão corrigidas, os ícones ficam azuis automaticamente).
- [ ] **Step 2: tsc + screenshot** — subir dev, screenshot da seção Security → ícones em azul/ciano Vis (não roxo).

### Task 1.5: Aplicar .vis-card e focus-ring em features-bento e problems-solutions

**Files:** Modify `src/components/home/features-bento.tsx`, `problems-solutions.tsx`

- [ ] **Step 1: Auditar hovers inline** — `grep -n "onMouseEnter\|onMouseLeave\|\.style\." src/components/home/features-bento.tsx src/components/home/problems-solutions.tsx`
- [ ] **Step 2:** Trocar os cards que usam hover via `onMouseEnter/.style` por className `vis-card` (remover os handlers JS). Para o accent por cor do bento, manter o realce via `box-shadow` inline no hover OU aceitar o hover padrão do .vis-card (decisão do executor; preferir simplicidade).
- [ ] **Step 3:** Adicionar `focus-ring` aos CTAs/links de ação das seções tocadas.
- [ ] **Step 4: tsc + build + screenshot** da home (problemas + funcionalidades) → cards consistentes, sem regressão.

### Task 1.6: Gate do Sprint 1

- [ ] `rm -rf .next && npx tsc --noEmit` → No errors
- [ ] `npm run build` → compiled successfully
- [ ] Screenshot full home: ícones Security azuis, cards consistentes
- [ ] Commit: `git add -A && git commit -m "refactor(landing): Sprint 1 — fundação (cores Vis, SectionHeading, vis-card, a11y)"`

---

## SPRINT 2 — Home repaginada

### Task 2.1: Criar `<TrustProof>` (prova social honesta)

**Files:** Create `src/components/home/trust-proof.tsx`

- [ ] **Step 1: Criar a seção** com 3 faixas (fundo var(--gradient-brand-wash)):
  - Faixa A: 4 stats (100% na nuvem · backup diário · leitura de receita por IA · 0 instalação) — pode reusar AnimatedCounter onde fizer sentido, ou números estáticos grandes.
  - Faixa B: 6 selos em `.vis-card p-5` (grid sm:grid-cols-2 lg:grid-cols-3 gap-5): LGPD por padrão · 100% na nuvem · **OCR de receita por IA** (destacado: borda var(--brand-accent) + micro-badge "Exclusivo") · Suporte humano no WhatsApp · Sem fidelidade · Sem cartão para testar. Ícones lucide.
  - Faixa C: flex centrada com 3 checks verdes: ✓ Sem cartão · ✓ Sem fidelidade · ✓ Cancele quando quiser.
  - Usar `<SectionHeading>` no topo (eyebrow "Por que confiar no Vis").
- [ ] **Step 2: tsc** → No errors.

### Task 2.2: Atualizar a home (remover ticker + depoimentos, inserir TrustProof)

**Files:** Modify `src/app/(landing)/page.tsx`

- [ ] **Step 1:** Remover imports/usos de `LiveSalesTicker` e `Testimonials`. Adicionar import dinâmico de `TrustProof` e inseri-lo entre `Security` e `HowItWorks`.
- [ ] **Step 2:** Conferir a ordem final: Hero → ProblemsSolutions → TargetAudience → FeaturesBento → StatsCounter → LabIntegration → Security → TrustProof → HowItWorks → RoiCalculator → PricingSection → FaqSection → FinalCta.
- [ ] **Step 3: tsc + screenshot** full home → sem ticker, sem depoimentos, TrustProof renderiza.

### Task 2.3: Corrigir features falsas no pricing

**Files:** Modify `src/content/pricing.ts`, `src/lib/plan-feature-catalog.ts`

- [ ] **Step 1:** Em `pricing.ts`, no tier `profissional` (features falsas estão lá, ~L57-62), remover dos `features[]`: "Emissão de NF-e e NFC-e" e "WhatsApp automático". Trocar "Integração com laboratórios" → "Gestão/controle de laboratórios". Ajustar as **três** ocorrências de "16 funcionalidades/features" (~L20, ~L52, ~L64) → "15". (Confirmar que cashback NÃO está em GATED_FEATURE_LABELS — já foi removido; FEATURES tem 15 keys.)
- [ ] **Step 2:** Em `plan-feature-catalog.ts`, corrigir o comentário "todas as 16 keys" (~L5) → "15 keys".
- [ ] **Step 3: tsc + screenshot** da seção de preços → sem NF-e/WhatsApp automático.

### Task 2.4: Polish (ritmo de fundo, loading states, mobile)

**Files:** Modify seções da home conforme necessário

- [ ] **Step 1:** Garantir ritmo de fundo alternado (nenhuma sequência de 3 seções com o mesmo fundo) ajustando o `background` das seções.
- [ ] **Step 2:** Adicionar `loading: () => <div className="section-padding" aria-hidden />` aos `dynamic()` da home (evita CLS).
- [ ] **Step 3:** Corrigir o bento no breakpoint md (spans só em lg) e reduzir padding mobile.
- [ ] **Step 4: build + screenshot mobile (390px) + desktop**.

### Task 2.5: Cleanup dos componentes removidos

**Files:** Delete `src/components/home/live-sales-ticker.tsx`, `testimonials.tsx`, `src/content/testimonials.ts`

- [ ] **Step 1:** Confirmar zero imports: `grep -rln "live-sales-ticker\|/testimonials\|Testimonials\|LiveSalesTicker" src/ | grep -v node_modules`
- [ ] **Step 2:** `git rm` os 3 arquivos.
- [ ] **Step 3: tsc** → No errors (sem referências quebradas).

### Task 2.6: Gate do Sprint 2

- [ ] `rm -rf .next && npx tsc --noEmit` + `npm run build` verdes
- [ ] Screenshot full home (sem ticker/depoimentos, com TrustProof), preços corrigidos
- [ ] Commit: `git commit -m "feat(landing): Sprint 2 — home honesta (prova social real, sem ticker/depoimentos falsos, pricing corrigido)"`

---

## SPRINT 3 — Páginas de Funcionalidades

### Task 3a.1: Criar conteúdo `features.ts`

**Files:** Create `src/content/features.ts`

- [ ] **Step 1:** Definir `interface FeaturePage { slug, name, eyebrow, title, subtitle, benefits: {icon,title,desc}[], subFeatures: {title,desc}[], faq: {q,a}[] }` e um `Record<string, FeaturePage>` com 5 entradas (pdv-para-otica, ordem-de-servico-otica, controle-de-estoque-otica, gestao-financeira-otica, leitura-de-receita-ia). Conteúdo 100% baseado em features reais (ver spec). Exportar `featureSlugs` e `getFeature(slug)`.
- [ ] **Step 2: tsc** → No errors.

### Task 3a.2: Extrair `<BrowserFrame>` reutilizável

**Files:** Create `src/components/landing-layout/browser-frame.tsx`; Modify `src/components/home/hero.tsx` (usar o componente)

- [ ] **Step 1:** Extrair a moldura de browser (chrome + dots + barra de URL) do hero.tsx para `<BrowserFrame url="vis.app.br/dashboard">{children}</BrowserFrame>`.
- [ ] **Step 2:** Refatorar hero.tsx para usar BrowserFrame (sem mudar o visual).
- [ ] **Step 3: tsc + screenshot hero** → idêntico ao anterior.

### Task 3a.3: Criar `<FeaturePage>` layout + hub `/funcionalidades`

**Files:** Create `src/components/funcionalidades/feature-page.tsx`, `src/app/(landing)/funcionalidades/page.tsx`

- [ ] **Step 1:** `<FeaturePage data={...} />`: hero split + tira de benefícios + mockup (BrowserFrame) + sub-recursos (bento .vis-card) + mini-FAQ (acordeão simples) + reuso de `<FinalCta>`.
- [ ] **Step 2:** Hub `funcionalidades/page.tsx`: hero curto + grid de módulos (cards Link → /funcionalidades/[slug]) + FinalCta. Metadata + canonical (ver spec/SEO).
- [ ] **Step 3:** Avaliar reaproveitar `src/components/pages/functionalities-page.tsx` (órfão v1) — adaptar ou substituir.
- [ ] **Step 4: tsc + build + screenshot hub**.

### Task 3b.1: Criar rota dinâmica das subpáginas

**Files:** Create `src/app/(landing)/funcionalidades/[slug]/page.tsx`

- [ ] **Step 1:** `generateStaticParams` a partir de `featureSlugs`; `generateMetadata` por slug (title/description/canonical do spec); renderizar `<FeaturePage data={getFeature(slug)} />`; `notFound()` se slug inválido.
- [ ] **Step 2: tsc + build** → 5 subpáginas geradas (ver no output do build).
- [ ] **Step 3: screenshot** de 2 subpáginas (pdv + leitura-de-receita-ia).

### Task 3.gate: Gate do Sprint 3

- [ ] `rm -rf .next && npx tsc --noEmit` + `npm run build` verdes (hub + 5 subpáginas estáticas)
- [ ] Navegação hub↔spoke OK, CTAs → /registro e wa.me
- [ ] Commit: `git commit -m "feat(landing): Sprint 3 — hub /funcionalidades + 5 subpáginas (conteúdo real, SEO)"`

---

## SPRINT 4 — Comparativo Vis vs Planilha

### Task 4.1: Criar tabela comparativa responsiva

**Files:** Create `src/components/funcionalidades/comparison-table.tsx`

- [ ] **Step 1:** Componente que recebe `rows: {feature, planilha: bool|string, vis: bool|string}[]`. Desktop = tabela (coluna Vis com fundo --brand-tint). Mobile = lista de mini-cards por recurso. Linhas do spec (backup, acesso por cargo, DRE, OS de lente, alerta estoque, multi-loja, celular, OCR, suporte humano).
- [ ] **Step 2: tsc** → No errors.

### Task 4.2: Criar página `/vis-vs-planilha`

**Files:** Create `src/app/(landing)/vis-vs-planilha/page.tsx`

- [ ] **Step 1:** Bloco 1 antes/depois (2 cards: "Com planilha" apagado / "Com o Vis" aceso com .shadow-glow). Bloco 2 = `<ComparisonTable>`. Bloco 3 = `<FinalCta>`. Metadata + canonical. Avaliar reaproveitar `migration-page.tsx` órfão.
- [ ] **Step 2: tsc + build + screenshot desktop + mobile (390px)** → tabela vira cards no mobile.

### Task 4.gate: Gate do Sprint 4

- [ ] tsc + build verdes
- [ ] Commit: `git commit -m "feat(landing): Sprint 4 — comparativo /vis-vs-planilha"`

---

## SPRINT 5 — Blog

### Task 5.1: `.prose-vis` no globals + migrar privacidade/termos

**Files:** Modify `src/app/globals.css`, `src/app/(landing)/privacidade/page.tsx`, `termos/page.tsx`

- [ ] **Step 1:** Adicionar `.prose-vis` em @layer components (p 17px/1.75, h2=text-h2 mt-12 mb-4, h3 text-xl, a azul underline, ul/li, blockquote borda azul, code bg surface-hover, img rounded my-8).
- [ ] **Step 2:** Trocar `prose prose-neutral` → `prose-vis` em privacidade e termos (hoje são no-op). Adicionar `id="lgpd"` à seção LGPD de privacidade (o footer já linka /privacidade#lgpd, hoje quebrado).
- [ ] **Step 3: screenshot /privacidade** → texto formatado, âncora #lgpd rola.

### Task 5.2: Conteúdo `blog.ts` (4 artigos)

**Files:** Create `src/content/blog.ts`

- [ ] **Step 1:** `interface Post { slug, title, description, keyword, date, author, readingMinutes, category, excerpt, cover?, body: ReactNode|string, related: string[], featureLinks: string[] }` + array dos 4 posts (outlines do spec/SEO). Corpo pode ser JSX estruturado (h2/h3/p) ou string com markdown simples renderizado. Exportar getPost, allPosts.
- [ ] **Step 2: tsc** → No errors.

### Task 5.3: Índice `/blog` + artigo `/blog/[slug]`

**Files:** Create `src/app/(landing)/blog/page.tsx`, `blog/[slug]/page.tsx`

- [ ] **Step 1:** Índice: header + post destaque + grid de cards (categoria, título, excerpt, data·tempo). Avaliar reaproveitar `blog-list-page.tsx` órfão. Metadata.
- [ ] **Step 2:** Artigo: `generateStaticParams` + `generateMetadata` (type article, publishedTime); coluna max-w-[680px] `.prose-vis`; meta-linha (autor/data/min); CTA fim (gradient-wash); 3 relacionados.
- [ ] **Step 3: tsc + build + screenshot índice + 1 artigo**.

### Task 5.gate: Gate do Sprint 5

- [ ] `rm -rf .next && npx tsc --noEmit` + `npm run build` verdes (4 artigos estáticos)
- [ ] Internal links artigo→feature funcionam
- [ ] Commit: `git commit -m "feat(landing): Sprint 5 — blog + 4 artigos + .prose-vis"`

---

## SPRINT 6 — SEO técnico + navegação

### Task 6.1: Atualizar sitemap

**Files:** Modify `src/app/sitemap.ts`

- [ ] **Step 1:** Adicionar as 12 URLs novas (hub, 5 subpáginas, comparativo, índice blog, 4 artigos) + /termos + /privacidade. (/, /precos, /contato, /registro já estão.)
- [ ] **Step 2: build** → `grep` no `.next/server/app/sitemap.xml.body` confirma as novas URLs.

### Task 6.2: JSON-LD — estender json-ld.tsx + aplicar

**Files:** Modify `src/components/seo/json-ld.tsx`; subpáginas/artigos/precos

- [ ] **Step 1:** Adicionar `buildBlogPostingJsonLd(post)` e `buildProductJsonLd(offers)` ao json-ld.tsx existente (reusar JsonLd e buildBreadcrumbJsonLd já presentes).
- [ ] **Step 2:** Inserir `<JsonLd>` com BreadcrumbList nas subpáginas de funcionalidade, comparativo e artigos; BlogPosting nos artigos; Product/AggregateOffer em /precos (sem aggregateRating). Renderizar breadcrumb visual HTML nas internas.
- [ ] **Step 3: build + verificar** JSON-LD no DOM (curl/grep ou Playwright) → FAQPage (já) + BreadcrumbList + BlogPosting + Product presentes.

### Task 6.3: Navegação + llms.txt

**Files:** Modify `src/lib/constants.ts`, `public/llms.txt`

- [ ] **Step 1:** NAV_LINKS: "Funcionalidades" → `/funcionalidades` (era /#funcionalidades) + adicionar "Blog" → `/blog`. Garantir que FeaturesBento mantém `id="funcionalidades"`.
- [ ] **Step 2:** FOOTER_LINKS: incluir as páginas novas; remover /demo morto (e qualquer uso de DEMO_URL) ou criar /demo (preferir remover).
- [ ] **Step 3:** llms.txt: adicionar páginas novas + seção "O que o Vis NÃO faz" (sem NF-e, WhatsApp manual, sem integração eletrônica com lab, sem app nativo/offline).
- [ ] **Step 4: tsc + build + screenshot header** (com Funcionalidades + Blog) e teste de âncora.

### Task 6.gate: Gate do Sprint 6

- [ ] tsc + build verdes; Rich Results Test mental (JSON-LD válido); sitemap completo; nav sem links quebrados
- [ ] Commit: `git commit -m "feat(landing): Sprint 6 — SEO técnico (sitemap, JSON-LD, breadcrumbs, llms.txt, nav)"`

---

## SPRINT 7 — QA final + Deploy

### Task 7.1: Polish + QA

- [ ] **Step 1:** Revisão visual (design-review): espaçamento, hierarquia, micro-interações, reduced-motion em todas as páginas novas.
- [ ] **Step 2:** QA browser de TODAS as rotas: /, /funcionalidades, 5 subpáginas, /vis-vs-planilha, /blog, 1 artigo, /precos, /contato, /login, /registro — HTTP 200, sem erro de console (exceto CSP report-only conhecido), CTAs corretos.
- [ ] **Step 3:** Lighthouse na home (LCP<2.5/INP<200/CLS<0.1); corrigir regressões óbvias.

### Task 7.2: Deploy

- [ ] **Step 1:** `rm -rf .next && npx tsc --noEmit` + `npm run build` finais verdes.
- [ ] **Step 2:** Commit final se houver polish; `vercel deploy --prod --yes` (CLI em /Users/matheusreboucas/.nvm/versions/node/v22.18.0/bin/vercel).
- [ ] **Step 3:** Smoke test prod: todas as rotas 200, JSON-LD presente, sitemap com novas URLs, screenshot home prod.
- [ ] **Step 4:** Entregar ao dono a LISTA DE PENDÊNCIAS de contatos: WHATSAPP_NUMBER real (constants.ts + contato/page.tsx hardcoded), email contato@vis.app.br, handles instagram/youtube, preços reais tiers 2/3 para Product JSON-LD.

### Task 7.gate: Conclusão

- [ ] Prod no ar em vis.app.br com todas as páginas; memória do projeto atualizada.

---

## Notas finais
- **Órfãos v1** (`src/components/pages/{functionalities,blog-list,migration,contact,pricing}-page.tsx`): avaliar reaproveitar nos Sprints 3/4/5. **Regra para não travar:** se o órfão exigir adaptação >50% (tema dark antigo, marca PDV Ótica, estrutura diferente), criar do zero seguindo o design system Vis — não bloquear o sprint nisso. Se não usados ao fim, remover no Sprint 7 (refactor-cleaner).
- **`notFound()`** nas rotas `[slug]` (Tasks 3b.1, 5.3): `import { notFound } from "next/navigation"`. Padrão Next 14 já usado no repo (recibo/[token], admin/clientes/[id]).
- **App/dashboard** segue teal — não tocar tokens shadcn `:root`.
- **Honestidade:** nenhum conteúdo deve mencionar NF-e ativa, WhatsApp automático, integração eletrônica com laboratório, app nativo ou offline.
