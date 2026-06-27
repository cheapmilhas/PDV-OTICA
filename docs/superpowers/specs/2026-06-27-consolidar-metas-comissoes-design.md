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

Implementação: o corpo de cada `page.tsx` antigo vira `redirect("/dashboard/...")`
de `next/navigation` (M3: **`redirect`**, NÃO `permanentRedirect` — `redirect` dá
307; `permanentRedirect` daria 308). Em Next 16 App Router, `redirect()` num
Server Component lança `NEXT_REDIRECT` e o framework responde 307. Alvo é string
fixa (já com `?tab=`), não há query de entrada a preservar. Não precisa de
middleware. Substituir o corpo inteiro pelo `redirect()` remove a necessidade de
ler `ProtectedRoute`/`isNewCommissionEngine` nessas duas rotas.

Motivo do 307: redirect permanente fica em cache "pra sempre" no navegador;
temporário permite desmembrar no futuro sem usuários presos a cache.

### Gating de `goals` — o ponto crítico (TRÊS camadas, não duas)

**Estado atual (a preservar):**
- Comissões é acessível **só por permissão** (`reports.sales`) — **não** exige a
  feature `goals`. Confirmado: já acessível no plano Básico.
- Config. Comissões é gateada só por `settings.edit`.
- `/dashboard/metas` HOJE é gateada por `goals` em **TRÊS lugares** (a revisão do
  spec corrigiu: eram três, não dois):
  1. `src/app/(dashboard)/layout.tsx` → `findBlockedFeature(currentPath, features)`
     usando `x-current-path` (que é só `pathname`, **sem query** —
     `src/proxy.ts` seta `request.nextUrl.pathname`). Gating de **plano**.
  2. `metas-content.tsx:716` → `<FeatureGate feature="goals">` envolvendo a
     página. Gating de **plano**.
  3. ⚠️ **`metas-content.tsx:715` → `<ProtectedRoute permission="goals.view">`
     envolvendo a página inteira.** Gating de **PERMISSÃO** (distinto da feature
     de plano). Esta era a camada faltante no design original.

**Regressão evitada (dupla):** se Comissões/Config fossem para dentro de
`/dashboard/metas` mantendo qualquer um desses três gates no nível da página,
óticas **sem a feature `goals`** (camadas 1-2) OU usuários **sem a permissão
`goals.view`** (camada 3, ex.: um perfil que só tem `reports.sales`) perderiam
acesso a Comissões/Config. O `?tab=` não protege porque o matcher ignora a query.

**Correção (decisão 5):**
- **Camada 1:** remover `/dashboard/metas` do `pageMatchers` de `FEATURES.GOALS`
  em `src/lib/plan-feature-catalog.ts`. Mantém `apiMatchers: ["/api/goals"]`.
- **Camada 2:** tirar o `<FeatureGate feature="goals">` que envolve a página
  inteira. A feature `goals` passa a gatear **apenas a aba Ranking** (e o
  "Definir metas"), via `<FeatureGate feature="goals">` em volta do conteúdo da
  aba Ranking, com upsell.
- **Camada 3:** trocar o `<ProtectedRoute permission="goals.view">` da página por
  um guard de **qualquer uma das três** permissões. Usar
  `<ProtectedRoute requireAny={["goals.view","reports.sales","settings.edit"]}>`
  (ou o equivalente via `usePermission().hasAnyPermission(...)`). A permissão de
  cada aba é então reaplicada por aba (ver "Permissão por aba"). Assim, um usuário
  com só `reports.sales` passa pelo guard da página e vê a aba Comissões.
- Rede de segurança (testes): (a) garante que a aba Ranking está envolta em
  `FeatureGate feature="goals"`; (b) usuário só com `reports.sales` alcança a aba
  Comissões; usuário só com `settings.edit` alcança a aba Config.

> **Nota de comportamento (M2):** após remover a camada 1, um usuário de plano sem
> `goals` que abre `/dashboard/metas` **não é mais redirecionado** para a tela de
> upgrade (`/dashboard?upgrade-required=goals`); ele cai na página e vê a aba
> Ranking com upsell. Isso é intencional (decisão 5) — é o que mantém
> Comissões/Config acessíveis.

> **Confirmar `requireAny` no `ProtectedRoute`:** se o componente não aceitar
> `requireAny`/array hoje, a implementação adiciona esse suporte (o hook
> `usePermission()` já expõe `hasAnyPermission`), ou a página usa um guard inline
> com `hasAnyPermission` + estado de loading. Não deixar a página sem guard
> algum.

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
                    Metas por níveis / exemplo de cálculo).
                    M4: extrair o CONTEÚDO (CommissionConfigPageContent), NÃO o
                    wrapper. NÃO manter um <ProtectedRoute permission="settings.edit">
                    aninhado aqui (full-screen-bloquearia a página toda quando
                    nessa aba). A permissão settings.edit é aplicada pela
                    metas-tabs.tsx como gate da aba (igual às outras).

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

### Abas aninhadas (H1) — decisão explícita

Duas das views reusadas trazem seu **próprio** `<Tabs>` interno:
- `CommissionLegacyView` → abas internas "Atual" / "Preview regra nova"
  (`commission-legacy-view.tsx:271`). **Só em modo legacy.**
- `CommissionConfigTab` (extraída de `configuracoes/comissoes`) → abas internas
  "Base + Bônus" / "Metas por níveis" (`page.tsx:95`).
- `CommissionNewView` **não** tem abas internas (modo new fica limpo).

Sem tratamento, o resultado é uma **segunda barra de abas** dentro da aba externa
(duas linhas de abas empilhadas) — feio, principalmente na aba Comissões em
legacy. Decisão:

- **Aba Config:** as abas internas "Base + Bônus" / "Metas por níveis" são parte
  natural da configuração — **mantê-las** como sub-abas dentro da aba Config é
  aceitável e esperado (config costuma ter sub-seções). Sem mudança.
- **Aba Comissões (legacy):** as sub-abas "Atual" / "Preview regra nova" da
  `CommissionLegacyView` empilhariam com a barra externa. Como a barra externa já
  comunica "você está em Comissões", **a sub-barra interna fica visualmente
  redundante**. Tratamento: estilizar/rebaixar a sub-barra interna (variante
  visual menor, ex.: `variant="secondary"`/menor) para não competir com a barra
  externa — NÃO remover a funcionalidade do Preview (é read-only e útil). Em modo
  **new** não há sub-abas, então o problema não existe.
- Estado: as abas internas são Radix `defaultValue` (não-controladas) e
  independentes do `?tab=` externo — sem conflito de estado (apenas as internas
  não são endereçáveis por URL; aceitável, ver L3).

> Trade-off: a alternativa "achatar" (puxar a aba Preview pro nível externo) foi
> descartada — Preview só existe em legacy e some no new; criar/remover uma aba
> externa conforme o modo complicaria o `metas-tabs.tsx` sem ganho real.

**Permissão por aba (`metas-tabs.tsx`):**
- Aba Ranking: `goals.view`
- Aba Comissões: `reports.sales`
- Aba Config: `settings.edit`
- Só renderiza `TabsTrigger` + conteúdo de cada aba se tiver a permissão.
- Se sobrar **1 aba só** → esconde a barra de abas.
- Se **0** permissões → página não aparece no sidebar; acesso direto à URL cai no
  guard `requireAny` do `ProtectedRoute` (que nega acesso).

**⚠️ Estado de loading (H3):** usar o hook **`usePermission()` (singular,
`src/hooks/use-permission.ts`)**, que expõe `isLoading` e `hasAnyPermission` — e
**NÃO** o `usePermissions()` (plural) usado hoje no `metas-content.tsx`, cujo
`hasPermission` retorna `false` enquanto carrega. Se a visibilidade das abas for
calculada antes das permissões carregarem, as três checagens dão `false` →
"nenhuma aba" / aba inicial errada / flicker. A `metas-tabs.tsx` deve **aguardar
`isLoading === false`** (spinner, como o `ProtectedRoute` faz) antes de decidir
quais abas mostrar e qual é a aba inicial.

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
- O item "Metas" deve aparecer se o usuário tem **≥1** das três permissões
  (`goals.view` OU `reports.sales` OU `settings.edit`).
- **Mudança de modelo (H2):** hoje `MenuItem.permission?: string` é uma string
  única e o filtro faz um único `hasPermission(item.permission)`
  (`sidebar.tsx:53,436`). O OR-de-três **não** é expressável só trocando o
  atributo. A implementação estende `MenuItem` para aceitar
  `permissionAny?: string[]` (ou `permission: string | string[]`) e atualiza o
  filtro em **ambos** os arquivos (sidebar + mobile-nav) para, quando houver
  lista, usar `hasAnyPermission(list)`. Itens existentes (string única) seguem
  funcionando — mudança aditiva.
- O `feature: "goals"` **sai do item** "Metas" (o gating de `goals` agora é por
  aba). Consequência: o badge de cadeado (`Lock`, `sidebar.tsx:472`) some do item
  — aceitável e intencional, já que a página hospeda também Comissões/Config que
  não são `goals`.
- `src/components/layout/mobile-nav.tsx`: mesmo ajuste (item "Metas" com
  `permissionAny`, sem `feature: "goals"`).

---

## Erros / edge cases

- `?tab=` inválido/sem permissão → primeira aba permitida.
- 0 das 3 permissões → item ausente do sidebar; URL direta cai no
  `ProtectedRoute`.
- 1 aba só → sem barra de abas.
- Redirects 307 preservam links/favoritos antigos.
- Convive com o kill-switch por ótica em prod (Atacadão=new, resto=legacy).
- **Contexto de providers (L1):** `CommissionLegacyView` usa `useBranchContext` e
  `useCompanySettings`; ambos vêm do `BranchProviderWrapper` no
  `(dashboard)/layout.tsx`, que também envolve `/dashboard/metas`. Mover as views
  para cá mantém os providers — sem quebra.

---

## Testes

1. **Redirect:** `/dashboard/relatorios/comissoes` e
   `/dashboard/configuracoes/comissoes` redirecionam (307) para a `?tab=` certa.
2. **Não-regressão de PLANO (crítico):** ótica **sem a feature `goals`** → aba
   Ranking bloqueada com upsell, mas **Comissões e Config acessíveis**. Ótica
   **com `goals`** → Ranking normal.
3. **Não-regressão de PERMISSÃO (C1, crítico):** usuário só com `reports.sales`
   (sem `goals.view`) → passa pelo guard `requireAny` da página e **vê a aba
   Comissões**. Usuário só com `settings.edit` → vê a aba Config. Usuário só com
   `goals.view` → vê só Ranking. Usuário com **0 das 3** → guard nega a página.
4. **Rede de segurança:** garante que a aba Ranking está envolta em
   `<FeatureGate feature="goals">`.
5. **Permissão por aba + loading (H3):** sem `reports.sales` → sem aba Comissões;
   sem `settings.edit` → sem aba Config; 1 permissão só → sem barra de abas;
   enquanto `isLoading` → spinner, não "nenhuma aba".
6. **Modo por ótica:** `mode=new` → aba Comissões usa `CommissionNewView` e
   Ranking sem comissão; `mode=legacy` → views/comportamento antigos.
7. **Catálogo:** ajustar `find-blocked-feature.test.ts` — remover a linha
   `["/dashboard/metas", FEATURES.GOALS]` (:77); manter `["/api/goals",
   FEATURES.GOALS]` (:79).
8. **Qualidade:** `tsc --noEmit` limpo, suíte verde, build OK.

---

## Riscos e mitigações

- **C1 — perda de acesso por permissão:** o `ProtectedRoute permission="goals.view"`
  da página bloquearia usuários só com `reports.sales`/`settings.edit` → trocado
  por `requireAny` das três permissões + teste #3.
- **Gating de `goals` deixa de ser por-URL** → mitigado por `FeatureGate` na aba
  Ranking + teste de rede de segurança (#4) + teste de não-regressão de plano (#2).
- **H1 — abas aninhadas em legacy** → decisão explícita (rebaixar a sub-barra de
  Comissões; manter sub-abas de Config). New não tem o problema.
- **H2 — modelo de `MenuItem`** → estender para `permissionAny` (aditivo) nos dois
  arquivos de nav.
- **H3 — flicker de permissão** → usar `usePermission()` (com `isLoading`), não
  `usePermissions()`.
- **Arquivos grandes ao extrair** → manter cada aba como componente focado
  (< 300 linhas); `metas-content.tsx` atual é desmembrado, não copiado inteiro.
- **Links internos antigos** → grep confirmou que só sidebar/mobile-nav e o
  catálogo de plano referenciam as rotas; redirects 307 cobrem o resto.

## Reversão

Reorganização de UI sem dado: reverter o(s) commit(s) da branch restaura os 3
itens de sidebar e as 3 rotas. Nenhuma env/migração envolvida.
