# Design — Site Vis Profissional (v2)

**Data:** 2026-06-04
**Domínio:** https://vis.app.br
**Contexto:** O site Vis (landing) já foi rebrandeado (tema claro azul/ciano/navy, logo oficial). Esta é a fase v2: deixá-lo profissional, honesto e otimizado para SEO, com páginas de conteúdo novas. Baseado em auditoria de código (funcionalidades reais + estado da landing) e consultoria de 2 agentes de design (UI/UX + SEO de conteúdo).

## Princípios

1. **Honestidade radical** — o site só promete o que o sistema faz. Remover do site: emissão de NF-e (desligada no código), "WhatsApp automático" (é manual via wa.me), "integração eletrônica com laboratórios" (é só cadastro/vínculo). Não prometer app nativo nem modo offline. Destacar o que é real e raro: **OCR de receita por IA** (lê foto da receita e extrai grau/eixo/DNP — diferencial técnico verdadeiro, via Anthropic).
2. **Prova por verificabilidade, não depoimento falso** — remover os 5 depoimentos fictícios (ainda dizem "PDV Ótica"); substituir por seção de confiança baseada em fatos checáveis.
3. **Reaproveitar o design system Vis** e aplicá-lo consistentemente nas páginas novas.
4. **SEO hub-and-spoke** — home → /funcionalidades → subpáginas por módulo + /blog + comparativo, interligados.

## Funcionalidades REAIS (base de conteúdo — não inventar)

PDV/vendas com desconto + cashback + fechamento de caixa; Ordens de Serviço de lentes (máquina de estados DRAFT→…→DELIVERED, garantia/retrabalho/erro-médico com numeração #1234-G1); Estoque (armações/lentes, multi-filial, ajustes, transferências[pago], lotes FIFO[pago], código de barras); Financeiro (contas a pagar/receber, DRE, fluxo de caixa, conciliação bancária CSV, recebíveis de cartão); Cashback (base, todos os planos); CRM/pós-venda com segmentação automática; Lembretes; Campanhas; Metas/comissões[pago]; Relatórios; **OCR de receita por IA (ATIVO, diferencial)**; multi-loja/multi-CNPJ; permissões por 5 cargos (Admin, Gerente, Vendedor, Caixa, Gerente de Estoque). Disparo de WhatsApp = manual via wa.me. Asaas = cobrança da assinatura DO SaaS (não pagamento do cliente final).

**NÃO prometer:** NF-e/NFC-e (stub desligado, sem UI/webhook), WhatsApp automático/disparo em massa (Evolution API é no-op), integração eletrônica com laboratório, app mobile nativo, modo offline, pagamento do cliente final/maquininha, e-mail transacional (sem provedor integrado).

## Decisões do dono

- Remover tudo que não é real (não usar "em breve").
- Remover seção de depoimentos (substituir por prova social honesta).
- Escopo SEO completo: funcionalidades + blog (4 artigos) + comparativo.
- Contatos ficam placeholder MARCADO; entregar lista do que trocar no fim.
- Polish do existente + aplicar design system nas páginas novas (não redesign do zero).
- **Remover a seção "PDV ao vivo" (live-sales-ticker)** — única seção dark + dados simulados.
- Execução por sprints, testando e mostrando no localhost a cada um.

---

## Sprint 1 — Fundação (correções de base)

**Bug de cor real:** `.bg-brand-primary/10` e similares em `globals.css` (linhas ~387-389) apontam para roxo/ciano legados (#6366F1/#0EA5E9). `security.tsx` usa essas classes → ícones fora da marca. Corrigir tokens para azul/ciano Vis (#2E6BFF/#22C3E6). **Antes de aplicar: grep `bg-brand-primary/10`/`bg-brand-accent/10` FORA de components/home** — se o dashboard usar as mesmas classes, a cor muda junto (risco baixo, dashboard é teal, mas verificar).

**Padronização:**
- **CRIAR** `<SectionHeading>` em `src/components/home/section-heading.tsx` (NÃO existe hoje): eyebrow (text-xs font-bold uppercase tracking-[0.15em] text-brand-primary) + h2 (font-heading font-extrabold var(--text-h1) leading-[1.1]) + subtítulo (mt-4 max-w-xl text-muted). Wrapper text-center mb-12 md:mb-16. Depois de criar, refatorar as seções existentes para usá-lo.
- `.vis-card` em `@layer components`: rounded-2xl p-6, background var(--lp-surface), border var(--lp-border); hover translateY(-4px) + border-hover + box-shadow 0 8px 28px rgba(10,31,68,0.10). Para accent por cor, usar var --card-accent. **Auditar com grep `onMouseEnter`/`.style.transform`/`.style.background` em `src/components/home/*` e migrar para `.vis-card`** (live-sales-ticker e testimonials serão removidos; focar nos demais: features-bento, problems-solutions).
- Padronizar gap de grid (gap-5, lg:gap-6) e mb de header (mb-12 md:mb-16).

**Acessibilidade:** aplicar `.focus-ring` (já existe em globals) a todos os CTAs/links de ação; restringir `--lp-subtle` a labels decorativos (usar `--lp-muted` em texto corrido).

**Teste:** tsc + build + screenshot home; ícones Security em azul Vis; sem regressão visual.

## Sprint 2 — Home repaginada

- Remover do fluxo: `LiveSalesTicker` (PDV ao vivo) e `Testimonials`. Marcar componentes para limpeza.
- Nova seção `src/components/home/trust-proof.tsx` (prova social honesta), entre Security e HowItWorks, fundo var(--gradient-brand-wash):
  - Faixa A — números do produto (count-up): 100% na nuvem · backup diário · leitura de receita por IA · 0 instalação.
  - Faixa B — 6 selos (.vis-card p-5): LGPD por padrão · 100% na nuvem · **OCR de receita por IA** (destacado com --brand-accent + micro-badge "Exclusivo") · Suporte humano no WhatsApp · Sem fidelidade · Sem cartão para testar.
  - Faixa C — garantias em linha: ✓ Sem cartão · ✓ Sem fidelidade · ✓ Cancele quando quiser.
- Polish: ritmo de fundo alternado (nunca 3 seções seguidas iguais); títulos de card 16px font-semibold; loading states nas seções dynamic() (altura reservada, evita CLS); correção do bento no breakpoint md; padding mobile reduzido.
- Corrigir `src/content/pricing.ts`: remover features falsas (NF-e/NFC-e, WhatsApp automático); "integração com laboratórios" → "gestão/controle de laboratórios"; alinhar contagem de features (15, cashback é base). Corrigir também o comentário "16 features/keys" em `src/lib/plan-feature-catalog.ts` para 15 (evitar contradição espalhada).
- Ordem final da home: Hero → ProblemsSolutions → TargetAudience → FeaturesBento → StatsCounter → LabIntegration → Security → TrustProof(nova) → HowItWorks → RoiCalculator → PricingSection → FaqSection → FinalCta.

**Teste:** tsc + build + screenshot full home; sem depoimentos, sem PDV ao vivo; prova social renderiza.

## Sprint 3 — Páginas de Funcionalidades (sprint maior; redação de conteúdo é o gargalo)

**3a — fundação:**
- `src/content/features.ts`: Record<slug, FeaturePage> com conteúdo real de cada módulo.
- Componentes reutilizáveis: `<BrowserFrame>` (extrair do hero, hoje inline), layout-padrão da feature.
- Hub `/funcionalidades` (em (landing)): hero curto + grid de módulos (cards → Link) + reuso de FinalCta. Metadata + canonical.

**3b — as 5 subpáginas:** `/funcionalidades/{pdv-para-otica, ordem-de-servico-otica, controle-de-estoque-otica, gestao-financeira-otica, leitura-de-receita-ia}`. Cada uma: hero da feature (split) + tira de benefícios + mockup grande + sub-recursos (bento) + mini-FAQ + FinalCta. Metadata + canonical por página.

**Teste (ao fim de 3a e de 3b):** tsc + build + screenshot hub + 1 subpágina; navegação hub↔spoke; CTAs corretos.

## Sprint 4 — Comparativo Vis vs Planilha

- `/vis-vs-planilha` (em (landing)): Bloco 1 antes/depois (2 cards: "Com planilha" apagado / "Com o Vis" aceso), Bloco 2 tabela comparativa (Recurso | Planilha | Vis; em mobile vira lista de cards), Bloco 3 FinalCta. Metadata + canonical.

**Teste:** tsc + build + screenshot desktop + mobile; tabela responsiva.

## Sprint 5 — Blog

- `src/content/blog.ts`: 4 artigos (título, slug, kw, data, autor, capa, conteúdo em MDX/estrutura, links internos).
- `/blog` (índice): header + post em destaque + grid de cards.
- `/blog/[slug]`: coluna de leitura max-w-[680px], `.prose-vis` (p 17px/1.75, h2/h3, blockquote, code), meta-linha (autor/data/tempo de leitura), CTA no fim, artigos relacionados.
- **DECISÃO `.prose-vis`:** implementar como classe CSS custom em `@layer components` no `globals.css` — NÃO usar `@tailwindcss/typography` (não está instalado; `tailwind.config.js` tem `plugins: []`). Bônus: `privacidade/page.tsx` e `termos` hoje usam `prose prose-neutral` que são no-ops (bug latente) — migrar para `.prose-vis` aqui.
- 4 artigos: como-gerir-uma-otica · controle-de-os-de-lentes · como-aumentar-vendas-otica · gestao-financeira-otica-guia. Cada um linka para as features relevantes.

**Teste:** tsc + build + screenshot índice + 1 artigo; legibilidade; internal links funcionam.

## Sprint 6 — SEO técnico + navegação

- `sitemap.ts`: +12 páginas novas (hub + 5 subpáginas + comparativo + índice blog + 4 artigos) +/termos +/privacidade. (/, /precos, /contato, /registro já estão lá.)
- JSON-LD: **estender o componente existente `src/components/seo/json-ld.tsx`** (já tem buildFaqJsonLd, buildBreadcrumbJsonLd, organization/software) — NÃO criar abordagem nova. Adicionar `BlogPosting` builder. Usar BreadcrumbList (subpáginas/artigos/comparativo), BlogPosting (artigos), `Product`/`AggregateOffer` em /precos (sem aggregateRating). Breadcrumb visual HTML.
- `public/llms.txt`: +páginas novas + seção do que o Vis NÃO faz.
- Nav: header "Funcionalidades" → /funcionalidades (página real, era /#funcionalidades) + "Blog"; footer reescrito com links reais; remover/ajustar /demo morto. Nota: manter o id="funcionalidades" no FeaturesBento (ou ajustar quem dependa da âncora) para não quebrar links internos existentes.

**Teste:** tsc + build; Rich Results valida JSON-LD; sitemap com todas as URLs; nav sem links quebrados.

## Sprint 7 — QA final + Deploy

- Polish final (impeccable/design-review): espaçamento, hierarquia, micro-interações, reduced-motion.
- Lighthouse (LCP<2.5/INP<200/CLS<0.1), QA browser de todas as rotas.
- Deploy prod via `vercel deploy --prod --yes`; smoke test; confirmar vis.app.br.
- Entregar ao dono a lista de contatos placeholder a trocar (WHATSAPP_NUMBER, email, redes).

---

## Pendências do dono (entregar no fim)
WHATSAPP_NUMBER real (constants.ts + contato hardcoded), email contato@vis.app.br, handles sociais (instagram/youtube), preços reais dos tiers 2/3 para o Product JSON-LD. App/dashboard segue teal (fora de escopo).

## Componentes órfãos a avaliar (do plano v1)
Existem componentes não importados que cobrem áreas deste plano — o executor deve decidir reaproveitar ou substituir (não duplicar): `src/components/pages/functionalities-page.tsx` (Sprint 3), `src/components/pages/blog-list-page.tsx` (Sprint 5), `src/components/pages/migration-page.tsx` (Sprint 4/comparativo). Também usam `bg-brand-primary/10` → a correção de cor do Sprint 1 os alinha à marca (desejável).

## Referências
Outputs completos dos 4 agentes (funcionalidades reais, auditoria landing, UI/UX, SEO de conteúdo) na conversa que gerou este spec. Plano v1 anterior: docs/superpowers/specs/2026-06-04-vis-landing-redesign-plano.md.
