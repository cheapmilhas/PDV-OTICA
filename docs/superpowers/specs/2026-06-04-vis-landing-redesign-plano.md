# Plano de Modernização — Site/Landing "Vis"

**Data:** 2026-06-04
**Domínio:** https://vis.app.br (já ativo, HTTPS OK)
**Objetivo:** Redesenhar o site público (landing + /precos + /contato) saindo da marca/tema antigos ("PDV Ótica", dark, indigo) para a identidade **Vis** (claro, branco dominante, azul `#2E6BFF` + ciano `#22C3E6` + navy `#0A1F44`).
**Decisões do dono:** (1) Redesign completo no tema Vis claro, reconstruindo a arquitetura de componentes (1+3). (2) CTA duplo: "Começar grátis" + "Falar com consultor". (3) Consolidar tudo num único design system Vis, eliminando a duplicação `home/` vs `landing/`.

---

## Princípios (do time de design)

- **A gestão clara da sua ótica.** / Visão. Clareza. Confiança.
- Branco é a base; azul é ação; navy é texto; gradiente só em acentos; ciano é realce raro.
- Benefício antes de feature. Linguagem do dono de ótica (OS, lente, laboratório, caixa) — sem jargão de ERP.
- Mostrar o PRODUTO (screenshots reais), não ícones genéricos.
- Diferencial competitivo de mercado: **preço transparente + sem fidelidade + sem taxa de implantação** (todos os concorrentes BR escondem preço e exigem contrato de 12 meses).

## Estado atual do código (auditado)

| Item | Estado | Ação |
|---|---|---|
| Fonte Plus Jakarta Sans | ✅ já configurada (`--font-body`) | manter; opcional add Inter p/ números |
| Tema landing `--lp-*` | ❌ dark (#111116) + indigo (#6366F1) | → claro Vis + azul #2E6BFF |
| Tokens shadcn `:root` | ❌ tema antigo | → tokens Vis (HSL) |
| `src/components/home/*` (14 comps) | marca "PDV Ótica", dark | reconstruir como Vis |
| `src/components/landing/*` (dup) | usado em /precos | consolidar |
| `src/components/landing-layout/*` | header/footer/etc | rebrand Vis |
| `SITE_URL`/`APP_URL` em constants.ts | ❌ pdv-otica.vercel.app | → vis.app.br |
| `robots.ts` / `sitemap.ts` | ❌ domínio errado | → vis.app.br + metadataBase |
| `layout.tsx` metadata + JSON-LD | ❌ "PDV Ótica", sem metadataBase | → Vis + canonical |
| FAQ `landing/faq.tsx` | ✅ 8 perguntas reais | exportar p/ FAQPage JSON-LD |
| og-image / favicon / llms.txt | ❌ faltam | criar |

## Estrutura final da landing (ordem das seções)

1. Announcement bar
2. Hero split (headline + 2 CTAs + mockup do produto)
3. Prova social imediata (faixa)
4. Problema → Solução (dores reais de ótica)
5. Para quem é (independente / rede / laboratório)
6. Funcionalidades (6-8 cards, foco em resultado)
7. Tour do produto (screenshots reais)
8. Diferencial: OS de lentes + laboratórios
9. Depoimentos (placeholders a validar)
10. Segurança & confiança (nuvem, backup, LGPD)
11. Preços (R$149,90/mês, transparente)
12. FAQ (8 perguntas + FAQPage JSON-LD)
13. CTA final
14. Footer Vis

---

# SPRINTS

> Regra fixa: ao fim de CADA sprint → rodar `tsc`, `next build`, code-review e checagem visual no browser. Não avança com erro/bug/falha.

## Sprint 0 — Fundação (Design System Vis) ⚙️
**Meta:** trocar a base visual sem ainda mexer no conteúdo das seções.
- Substituir tokens `:root` (shadcn HSL) pelos valores Vis (azul/ciano/navy, claro).
- Reescrever `--lp-*` e `--brand-*` em `globals.css` para o tema claro Vis.
- Atualizar `tailwind.config` (boxShadow navy-tingido + glow-brand, `--radius: 0.75rem`).
- Componente `<Logo Vis>` (símbolo gradiente + wordmark navy) — substituir logo antiga.
- Garantir landing montando em tema claro.
- **Teste:** build verde, home carrega clara sem quebra de layout, logo Vis aparece.

## Sprint 1 — Rebranding técnico + SEO base (P0) 🔧
**Meta:** parar de indexar marca/domínio errados (independe do visual).
- `constants.ts`: SITE_URL/APP_URL → `https://vis.app.br`.
- `robots.ts` + `sitemap.ts` → vis.app.br.
- `layout.tsx`: metadata Vis + `metadataBase` + canonical + title template.
- JSON-LD: Organization + SoftwareApplication (offer R$149,90) — componente `seo/json-ld.tsx`.
- og-image (`opengraph-image.tsx`) + favicon (`app/icon`) + `public/llms.txt`.
- Trocar todas as strings "PDV Ótica" → "Vis" no público.
- **Teste:** build verde, Rich Results Test valida JSON-LD, OG aparece no preview, sitemap/robots com domínio certo.

## Sprint 2 — Header, Footer, Hero + CTAs duplos 🎯
**Meta:** topo da página no padrão Vis (é o que decide em 3-5s).
- Header Vis (navbar branca translúcida, logo, links, botão "Entrar" ghost + "Começar grátis" primário).
- Hero split: headline "A gestão clara da sua ótica." + subheadline + CTA duplo (Começar grátis / Falar com consultor WhatsApp) + 4 bullets + painel de mockup.
- Announcement bar Vis.
- Footer Vis (4 colunas do copy).
- WhatsApp flutuante apontando p/ consultor real.
- **Teste:** build verde, CTAs levam a /registro e wa.me corretos, responsivo mobile, LCP do hero ok (hero server component).

## Sprint 3 — Seções de conteúdo (meio da página) 📄
**Meta:** o corpo que vende.
- Problema→Solução, Para quem é, Funcionalidades (cards), Como funciona, Diferencial OS/laboratório.
- Copy do agente aplicado; cards com ícone azul em quadrado accent.
- Animações framer-motion só `whileInView`, isoladas em comps client folha.
- **Teste:** build verde, seções responsivas, sem layout shift, animações respeitam reduced-motion.

## Sprint 4 — Prova, Preços, FAQ, CTA final 💳
**Meta:** fechar a conversão.
- Tour do produto (screenshots reais — pegar do app/print).
- Depoimentos (placeholders MARCADOS como a validar).
- Segurança & confiança.
- Preços Vis (R$149,90, "sem fidelidade/implantação").
- FAQ + FAQPage JSON-LD (reusa faq.tsx).
- CTA final + exit-intent rebrand.
- **Teste:** build verde, FAQPage valida, preços corretos, fluxo cadastro funciona.

## Sprint 5 — Consolidar /precos + /contato + limpeza 🧹
**Meta:** unificar e remover duplicação.
- /precos e /contato usando os componentes Vis consolidados.
- Remover `components/landing/*` e `home/*` órfãos (refactor-cleaner).
- metadata /precos e /contato.
- **Teste:** build verde, knip/ts-prune sem órfãos novos, todas rotas públicas no tema Vis.

## Sprint 6 — Performance + polish + QA final 🚀
**Meta:** Core Web Vitals + acabamento.
- next/image em tudo (hero priority, sizes), lazy-load seções abaixo da dobra.
- Reduzir pesos de fonte, diferir analytics.
- Polish visual (impeccable/design-review): espaçamento, hierarquia, micro-interações.
- **Teste final:** Lighthouse/Speed Insights (LCP<2.5s, INP<200ms, CLS<0.1), browser QA completo, code-review, deploy prod.

## Backlog pós-sprints (SEO crescimento)
- Páginas `/funcionalidades/*` (PDV, estoque, OS, financeiro, CRM) — maior ganho orgânico.
- `/blog` + artigos topo de funil.
- Comparativo "Vis vs planilha".

---

## Referências de copy/design/SEO
Os outputs completos dos 4 agentes (concorrentes, copy seção-a-seção, design system com tokens HSL exatos, SEO/JSON-LD) estão na conversa que gerou este plano. Copy e tokens prontos para colar.
