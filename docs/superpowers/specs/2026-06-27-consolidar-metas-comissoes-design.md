# Consolidar Metas, Comissões e Config. Comissões numa página única

**Data:** 2026-06-27
**Status:** Design aprovado pelo dono — aguardando revisão do spec
**Branch:** `feat/consolidar-metas-comissoes`

## Problema

A sidebar tem 3 itens separados que tratam do mesmo assunto (performance da
equipe), deixando o menu poluído e confuso:

- **Metas** (`/dashboard/metas`) — ranking de vendedores, cards de vendas/metas,
  definir metas do mês.
- **Comissões** (`/dashboard/relatorios/comissoes`) — relatório de comissão por
  vendedor/mês.
- **Config. Comissões** (`/dashboard/configuracoes/comissoes`) — abas "Base +
  Bônus" e "Metas por níveis" (mini/meta/mega) + exemplo de cálculo.

(Campanhas é item à parte e **permanece** no sidebar.)

## Objetivo

Colapsar os 3 itens em **1 único item de sidebar** ("Metas") que abre uma página
com **3 abas internas** (Ranking · Comissões · Configurações), preservando 100%
do acesso de hoje (permissões e gating de plano) e sem quebrar links antigos.

## Decisões aprovadas

1. **1 item no sidebar** ("Metas") com abas internas.
2. **3 abas:** Ranking · Comissões · Configurações. **Campanhas fica fora.**
3. **Permissões por aba** preservadas; página no sidebar se ≥1 permissão.
4. **URL com query** (`?tab=`) + **redirects 307** das rotas antigas.
5. **Gating de `goals` no componente** (aba Ranking com `FeatureGate` + upsell);
   `/dashboard/metas` sai do `pageMatchers` de `goals`; `/api/goals` permanece.

## Não-objetivos (YAGNI)

- Não tocar no kill-switch de comissão por ótica (já em prod). A página só
  **consome** o modo resolvido (`new`/`legacy`).
- Não mexer em banco, env, migração — é reorganização de UI + rotas.
- Não consolidar Campanhas (decisão do dono: fica separada).
- Não refatorar a lógica de cálculo de comissão/metas — só mover/extrair JSX.

---

## Arquitetura

### Rotas

**Canônica:** `/dashboard/metas?tab=ranking|comissoes|config` (default
`ranking`). `page.tsx` continua **server component**: lê `getCompanyId()` →
`isNewCommissionEngine(companyId)` para resolver `mode`, lê `?tab=`, e passa
`{ mode, initialTab }` ao componente client.

**Redirects (server-side, 307 temporário — NÃO 308):**

- `/dashboard/relatorios/comissoes` → `/dashboard/metas?tab=comissoes`
- `/dashboard/configuracoes/comissoes` → `/dashboard/metas?tab=config`

Motivo do 307: redirect permanente fica em cache "pra sempre" no navegador;
temporário permite desmembrar no futuro sem usuários presos a cache.

### Gating de plano (`goals`) — o ponto crítico

**Estado atual (a preservar):**
- Comissões é acessível **só por permissão** (`reports.sales`) — **não** exige a
  feature `goals`. Confirmado: já acessível no plano Básico.
- Config. Comissões é gateada só por `settings.edit`.
- `/dashboard/metas` HOJE é gateada por `goals` em **dois lugares**:
  - `src/app/(dashboard)/layout.tsx` → `findBlockedFeature(currentPath, features)`
    usando `x-current-path` (que é só `pathname`, **sem query** —
    `src/proxy.ts` seta `request.nextUrl.pathname`).
  - `metas-content.tsx` → `<FeatureGate feature="goals">` envolvendo a página.

**Regressão evitada:** se Comissões/Config fossem para dentro de
`/dashboard/metas` mantendo o gating por rota, qualquer ótica **sem `goals`**
(ex.: Básico) perderia acesso a Comissões e Config. O `?tab=` não protege porque
o matcher ignora a query.

**Correção (decisão 5):**
- **Remover `/dashboard/metas` do `pageMatchers`** de `FEATURES.GOALS` em
  `src/lib/plan-feature-catalog.ts`. Mantém `/api/goals` → `GOALS`.
- **Tirar o `FeatureGate` que envolve a página inteira.** A feature `goals`
  passa a gatear **apenas a aba Ranking** (e o "Definir metas"), via
  `<FeatureGate feature="goals">` em volta do conteúdo da aba Ranking, com
  upsell. Quem não tem `goals` vê a página, vê a aba Ranking bloqueada/upsell, e
  acessa Comissões/Config normalmente (se tiver as permissões).
- Rede de segurança: como o gating de `goals` deixa de ser por-URL, um **teste**
  garante que a aba Ranking está envolta em `FeatureGate feature="goals"`.

---

## Componentes

```
src/app/(dashboard)/dashboard/metas/
  page.tsx          (server) lê getCompanyId()+isNewCommissionEngine()+?tab=;
                    passa { mode, initialTab } ao client
  metas-tabs.tsx    (client) monta as 3 abas, aplica permissão por aba,
                    sincroniza aba↔URL
  ranking-tab.tsx   (client) extraído do metas-content.tsx atual; usa `mode`
                    p/ comportamento new (só ranking) vs legacy (com comissão);
                    envolto em <FeatureGate feature="goals"> (gating + upsell)
  (a aba Comissões reusa as views existentes:
     relatorios/comissoes/commission-new-view.tsx
     relatorios/comissoes/commission-legacy-view.tsx)
  commission-config-tab.tsx  (client) extraído do
                    configuracoes/comissoes/page.tsx atual (abas Base+Bônus /
                    Metas por níveis / exemplo de cálculo)

src/app/(dashboard)/dashboard/relatorios/comissoes/page.tsx
                    → redirect(307) para /dashboard/metas?tab=comissoes
src/app/(dashboard)/dashboard/configuracoes/comissoes/page.tsx
                    → redirect(307) para /dashboard/metas?tab=config
```

**Princípio: reaproveitar, não reescrever.**
- Aba Comissões: renderiza `CommissionNewView` ou `CommissionLegacyView` (já
  existem) conforme `mode`. Sem reescrever nada.
- Ranking e Config: extraídos do JSX atual para componentes de aba, mesma lógica.
  Arquivos focados (< 300 linhas cada).
- `metas-content.tsx` atual (que já tem a lógica `showCommission` do kill-switch)
  é a base do `ranking-tab.tsx`/`metas-tabs.tsx`; sua lógica de modo é carregada
  para os novos arquivos sem alterá-la.

**Permissão por aba (`metas-tabs.tsx`, via `usePermissions()`):**
- Aba Ranking: `goals.view`
- Aba Comissões: `reports.sales`
- Aba Config: `settings.edit`
- Só renderiza `TabsTrigger` + conteúdo de cada aba se tiver a permissão.
- Se sobrar **1 aba só** → esconde a barra de abas.
- Se **0** permissões → página não aparece no sidebar; acesso direto à URL cai no
  guard de `ProtectedRoute` (comportamento de hoje).

---

## Fluxo de dados

**Aba ↔ URL:**
- Aba ativa vive em `?tab=`. Clicar numa aba → `router.replace('?tab=X')`
  (replace, não push: não polui histórico/botão voltar).
- Link com `?tab=comissoes` abre na aba certa.
- Sem query → `ranking`.
- `?tab=` inválido ou para aba sem permissão → primeira aba permitida.

**Modo new/legacy:** resolvido uma vez no server (`page.tsx`) e passado como prop
`mode`. O client não lê env nem decide (mantém o padrão em prod). A aba Comissões
escolhe a view pelo `mode`; a aba Ranking usa `mode` p/ comportamento new (só
ranking) vs legacy (com comissão embutida).

**Carregamento:** cada aba busca seus próprios dados quando montada (Ranking →
`/api/goals/*`; Comissões → o que as views já chamam; Config →
`/api/commission-tiers` + settings). Sem prefetch das 3 juntas — só a aba ativa
carrega. Voltar a uma aba pode rebuscar (igual ao comportamento de hoje, em que
cada página buscava o seu).

---

## Sidebar / mobile-nav

- `src/components/layout/sidebar.tsx`: remover os itens "Comissões" e
  "Config. Comissões"; manter só "Metas" (`/dashboard/metas`). Campanhas fica.
- O item "Metas" deixa de depender só de `goals.view`/`feature: "goals"`: aparece
  se o usuário tem **≥1** das três permissões (`goals.view` OU `reports.sales` OU
  `settings.edit`). O `feature: "goals"` sai do item (o gating de `goals` agora é
  por aba).
- `src/components/layout/mobile-nav.tsx`: mesmo ajuste no item "Metas".

---

## Erros / edge cases

- `?tab=` inválido/sem permissão → primeira aba permitida.
- 0 das 3 permissões → item ausente do sidebar; URL direta cai no
  `ProtectedRoute`.
- 1 aba só → sem barra de abas.
- Redirects 307 preservam links/favoritos antigos.
- Convive com o kill-switch por ótica em prod (Atacadão=new, resto=legacy).

---

## Testes

1. **Redirect:** `/dashboard/relatorios/comissoes` e
   `/dashboard/configuracoes/comissoes` redirecionam (307) para a `?tab=` certa.
2. **Não-regressão de gating (crítico):** ótica **sem `goals`** → aba Ranking
   bloqueada com upsell, mas **Comissões e Config acessíveis**. Ótica **com
   `goals`** → Ranking normal.
3. **Rede de segurança:** garante que a aba Ranking está envolta em
   `<FeatureGate feature="goals">`.
4. **Permissão por aba:** sem `reports.sales` → sem aba Comissões; sem
   `settings.edit` → sem aba Config; 1 permissão só → sem barra de abas.
5. **Modo por ótica:** `mode=new` → aba Comissões usa `CommissionNewView` e
   Ranking sem comissão; `mode=legacy` → views/comportamento antigos.
6. **Catálogo:** ajustar `find-blocked-feature.test.ts` — remover
   `/dashboard/metas`→GOALS; manter `/api/goals`→GOALS.
7. **Qualidade:** `tsc --noEmit` limpo, suíte verde, build OK.

---

## Riscos e mitigações

- **Gating de `goals` deixa de ser por-URL** → mitigado por `FeatureGate` na aba
  Ranking + teste de rede de segurança (#3) + teste de não-regressão (#2).
- **Arquivos grandes ao extrair** → manter cada aba como componente focado
  (< 300 linhas); `metas-content.tsx` atual é desmembrado, não copiado inteiro.
- **Links internos antigos** → grep confirmou que só sidebar/mobile-nav e o
  catálogo de plano referenciam as rotas; redirects 307 cobrem o resto.

## Reversão

Reorganização de UI sem dado: reverter o(s) commit(s) da branch restaura os 3
itens de sidebar e as 3 rotas. Nenhuma env/migração envolvida.
