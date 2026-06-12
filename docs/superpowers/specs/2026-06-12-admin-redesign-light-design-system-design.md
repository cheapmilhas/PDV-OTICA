# Redesign da Área Admin (SaaS) — Tema Claro + Design System

**Data:** 2026-06-12
**Autor:** Matheus Rebouças (brainstorm assistido)
**Status:** Spec aprovada para escrever plano de implementação
**Ambiente afetado:** Área `/admin` do SaaS (super-admin), em produção em `vis.app.br`

---

## 1. Contexto e objetivo

A área **admin (super-admin do SaaS)** do PDV Ótica está hoje em **dark mode** (`bg-gray-950/900`, acento `indigo-600`) e foi construída com **componentes inline** — cada página reimplementa cards, badges e tabelas com `<div>` cru, gerando duplicação (os mesmos estilos de badge de status aparecem em 6+ páginas).

O objetivo é transformar a admin numa interface **clara, minimalista e moderna** (direção estética **Linear / Vercel**), criando ao mesmo tempo uma **fundação reutilizável** (design system) que elimina a duplicação e padroniza tudo.

**Restrição inegociável do dono:** *não quebrar nenhuma funcionalidade existente que já funciona.* O sistema está em produção e a entrega deve ser incremental, validada fase a fase, com deploy só após aprovação manual.

### Escopo (o que entra)
- Migração visual dark → light (tema Linear/Vercel) de **toda** a área admin (24 páginas), **reusando o sistema de tokens e os componentes shadcn que já existem** (ver §4).
- Criação de **apenas os compositores admin que faltam** (`KPICard`, `PageHeader`, `FilterBar`, `EmptyState`), por cima dos componentes existentes.
- **Correção de solturas:** 2 páginas órfãs do menu + sidebar mobile quebrada + hub de configurações.
- **Dashboard mais acionável:** gráfico MRR/churn, sparklines, alertas/ações clicáveis.
- **Limpeza de código morto:** remover APIs comprovadamente sem consumidor.

### Fora de escopo (YAGNI)
- Busca global cmd+K (avaliado e adiado — nice-to-have de maior risco).
- Qualquer mudança no app/PDV das óticas, no dashboard das óticas ou na landing.
- Mudança de lógica de negócio, queries, cálculos ou contratos de API.

---

## 2. Princípio central: garantia de não-quebra

Esta é a coluna vertebral da spec, embutida na arquitetura — não é só uma intenção.

1. **Mudança só de "casca", nunca de "miolo".** Cada página tem duas camadas: lógica (fetch, filtros, cálculos, handlers) e aparência (divs/cores). O redesign troca **apenas a aparência**. Os `fetch('/api/admin/*')`, cálculos de MRR, queries Prisma e handlers de botão permanecem **idênticos**.
2. **Isolamento natural da admin.** A migração só toca arquivos sob `src/app/admin/**` e adiciona compositores em `src/components/admin/`. App/PDV, dashboard das óticas e landing **não são tocados** — usamos os tokens claros que já existem no `:root`, sem alterar o tema global nem o `.dark`.
3. **Portão de validação por fase.** Ao fim de cada fase/lote: `tsc` + `build` + testes + review + **smoke visual no browser** confirmando que os mesmos dados carregam, os mesmos botões funcionam e os mesmos filtros filtram.
4. **Limpeza conservadora e por último.** A única parte que *remove* código fica isolada no fim. Só se remove o que for confirmado, via grep de UI + cron + webhook, como sem nenhum consumidor.
5. **Deploy só com aprovação manual.** Nada vai a produção sem o dono ver e aprovar.

---

## 3. Estado atual (diagnóstico)

Levantamento feito por análise paralela de `src/app/admin/**` e `src/app/api/admin/**`.

### 3.1. O que está bom (preservar)
- **Auth limpa:** o bug histórico do `requireAdminAuth` já foi resolvido — todas as rotas usam `getAdminSession`.
- **Zero TODO/FIXME/botões mortos** — funcionalmente íntegra.
- **Hierarquia coerente:** financeiro / assinaturas / saúde não se duplicam.
- **NotificationBell funciona** e consome `/api/admin/notifications/*` (sino no topo). **Essas rotas NÃO são órfãs — devem permanecer.**

### 3.2. Inventário de páginas (24)
- **Principal:** dashboard (`page.tsx`), clientes (lista + `[id]` + novo), interessados, usuários, saúde.
- **Suporte:** tickets (lista + `[id]` + novo).
- **Financeiro:** visão geral, faturas (lista + `[id]` + nova), inadimplência.
- **Relatórios:** relatorios.
- **Assinaturas:** assinaturas (órfã do menu).
- **Configurações:** redirect vazio + planos, equipe, logs, sincronização, emails, segurança (órfã do menu).

### 3.3. Problemas identificados

**UI/UX (foco do redesign):**
- Tudo em dark mode (bg-gray-950/900, indigo). ~309 ocorrências de `bg-gray-*`, ~539 de `text-gray-*`, ~293 de `border-gray-*` espalhadas em ~40 arquivos.
- **Zero componentização:** `<Card>`, `<Badge>`, `<Table>`, `<StatusBadge>` existem em `src/components/ui/` mas a admin **não usa** — reimplementa com div cru.
- **`STATUS_STYLES` / `ONBOARDING_STYLES` / `HEALTH_STYLES` duplicados** em 6+ páginas (múltiplas fontes de verdade).
- **Sidebar quebrada no mobile:** `w-60` fixo, sem toggle, sem drawer — em < 768px ocupa a maior parte da viewport.
- **Arquivos grandes:** `clientes/[id]/page.tsx` (594 linhas) e `clientes/page.tsx` (394 linhas).

**Solturas (correção de baixo risco):**
- 2 páginas órfãs do menu: `/admin/assinaturas` e `/admin/configuracoes/seguranca` (funcionam, só por URL direta).
- `/admin/configuracoes/page.tsx` é redirect vazio (anti-padrão; podia ser hub real).

**Código morto (limpeza cautelosa):**
- APIs sem consumidor de UI confirmado: `/api/admin/audit-logs`, `/api/admin/tags` (top-level), `/api/admin/seed`, `/api/admin/cash/close-stale-shifts`.
- ⚠️ Validar cron/webhook antes de remover qualquer uma. `notifications/*` **não** entra na lista (é usada).

---

## 4. Arquitetura da solução

> **Descoberta-chave (revisão da spec):** o projeto **já possui** um sistema de tokens semânticos em CSS-variables (`--background`, `--card`, `--foreground`, `--border`, `--accent`, `--success/--warning/--info`, sombras `.shadow-*`) ligado ao `tailwind.config.js` como `bg-card`, `text-foreground`, `border-border`, etc. **O `:root` já é um tema CLARO** (`--background: 220 20% 98%`, `--card: 0 0% 100%`, accent teal); `.dark` é o override escuro. A admin está dark **não** por causa dos tokens, mas porque suas páginas **hardcodam literais** `bg-gray-950`/`bg-gray-900`/`text-gray-400`. Além disso, os componentes shadcn que a admin precisa **já existem** em `src/components/ui/`: `Card`, `Badge`, `StatusBadge` (6 variantes semânticas prontas), `Table`, `Sheet` (drawer para o mobile), `responsive-table`.
>
> **Consequência:** NÃO criamos um sistema de tokens paralelo nem duplicamos componentes. A solução é **parar de hardcodar cores e passar a usar os tokens e componentes que já existem.** Isso é mais simples, mais seguro e mais DRY do que a primeira ideia. Verificado: a árvore da admin **não** está sob nenhum wrapper `.dark` — logo, ao remover os literais, ela herda o `:root` claro automaticamente.

### 4.1. Tokens — reuso do sistema existente (mecânica)

**Não há tokens novos.** A migração usa os tokens semânticos já mapeados no Tailwind:

| Literal hardcoded hoje | Token a usar | Origem |
|---|---|---|
| `bg-gray-950` / `bg-gray-900` (fundo/cards) | `bg-background` / `bg-card` | `--background` / `--card` (`:root` claro) |
| `text-white` / `text-gray-300` | `text-foreground` / `text-card-foreground` | `--foreground` |
| `text-gray-400` / `text-gray-500` | `text-muted-foreground` | `--muted-foreground` |
| `border-gray-800` / `border-gray-700` | `border-border` | `--border` |
| hover `bg-gray-800` | `hover:bg-muted` / `hover:bg-accent` | `--muted` / `--accent` |
| `bg-indigo-600` (ações/ativo) | `bg-primary` / `text-primary` | `--primary`/`--accent` (tema Vis) |
| badges de status hardcoded | `<StatusBadge variant=...>` | componente existente |
| sombras ad-hoc | classes `.shadow-soft/.shadow-medium` | já em `globals.css` |

**Mecânica confirmada:**
- Os tokens já existem em `src/app/globals.css` `:root` e estão ligados ao `tailwind.config.js`. **Nenhuma entrada nova de cor no Tailwind é necessária.**
- A admin **não** precisa de um escopo `.admin-theme` nem de aplicar `.dark`. Como `:root` é claro e a admin não está sob `.dark`, basta **remover os literais** para ela ficar clara.
- Caso o acento da admin (teal padrão do `--accent`) precise diferir, isso é um ajuste pontual de classe (`bg-primary`), não um token novo. O accent permanece o da marca Vis — sem introduzir um terceiro azul.

### 4.2. Componentes — reuso + apenas 4 compositores novos

**Reusar (já existem em `src/components/ui/`):**
- `Card` → containers (substitui ~40 divs `rounded-xl border bg-gray-900`).
- `StatusBadge` (variantes success/warning/info/danger/neutral/premium) → **fonte única de verdade** para os badges de status hoje duplicados 6×. Mapear cada status de domínio (subscription/invoice/ticket/health) para uma variante via um helper puro `adminStatusVariant(kind, status)`.
- `Table` / `responsive-table` → tabelas (substitui `<table>` HTML cru com overflow).
- `Sheet` → drawer da sidebar mobile.
- `Badge`, `Button`, `Input`, `Select` → conforme necessário.

**Criar novos em `src/components/admin/` (compositores admin que não existem):**

| Componente | Substitui | Responsabilidade |
|---|---|---|
| `<KPICard>` | blocos de métrica do dashboard/financeiro | Ícone + label + valor + tendência (▲▼) + sparkline opcional |
| `<PageHeader>` | títulos `text-2xl` divergentes | Título + subtítulo + slot de ações |
| `<FilterBar>` / `<FilterChip>` | filtros reimplementados | Chips de filtro consistentes |
| `<EmptyState>` | ad-hoc | Ícone + mensagem + ação para listas vazias |

Cada novo componente é construído **por cima dos existentes** (ex.: `KPICard` usa `Card`), espelhando exatamente o comportamento atual (mesmos dados, mesma lógica); só muda a casca. Cada um com teste unitário isolado. O helper `adminStatusVariant` também é testado cobrindo todos os pares `kind`×`status`.

### 4.3. Limites e clareza (design for isolation)
- **Tokens** já existem; nada novo a manter.
- **Componentes** dependem só de props tipadas + componentes base; sem acoplamento a fetch/dados.
- **Páginas** consomem componentes e mantêm sua lógica intacta. Trocar a casca de uma página não afeta outra.
- **Ressalva de honestidade:** os dois arquivos grandes (`clientes/[id]/page.tsx` 594 linhas e `clientes/page.tsx` 394) serão quebrados em subcomponentes ao migrar. Isso vai **além** de "só troca de casca" — são os dois pontos de maior risco e recebem atenção redobrada no portão (smoke + diff de dados antes/depois).

---

## 5. Plano de fases (entrega incremental)

Cada fase termina no **portão de validação**: `tsc` + `build` + testes + review + smoke visual no browser. Nada avança se o portão falhar. Deploy só com aprovação.

### Fase 0 — Fundação *(zero impacto visual)*
- **Sem tokens novos** (reuso do `:root` existente — ver §4.1).
- Criar os 4 compositores em `src/components/admin/` (`KPICard`, `PageHeader`, `FilterBar`, `EmptyState`) + helper `adminStatusVariant` + testes unitários.
- Criar `admin-smoke-checklist.md` (24 rotas com asserções concretas — ver §6) que servirá de oráculo em todos os portões seguintes.
- **Portão:** build verde, componentes/helper testados isolados; app/dashboard/landing intocados.

### Fase 1a — Casca: layout claro + navegação *(primeiro impacto visual)*
- `layout.tsx` e `admin-nav.tsx`: remover literais dark → usar tokens (`bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`).
- Menu ganha **Assinaturas** e **Segurança**.
- `/configuracoes` deixa de ser redirect → **hub com cards** das 6 subseções.
- **Portão:** navegar todas as rotas; cores claras aplicadas; menu completo.

### Fase 1b — Sidebar mobile *(checkpoint isolado — maior risco de navegação)*
- Drawer via `Sheet` + botão toggle; sidebar fixa em ≥lg, drawer em < lg.
- **Portão:** testar abrir/fechar e navegar em mobile e desktop; nenhuma rota fica inacessível.

### Fase 2 — Migração de páginas (lotes)
- **Lote A:** Dashboard, Clientes (lista), Assinaturas, Usuários.
- **Lote B:** Financeiro (visão/faturas/inadimplência), Saúde.
- **Lote C:** Suporte/Tickets, Relatórios, Interessados.
- **Lote D:** Configurações (planos/equipe/logs/sync/emails/segurança) + `clientes/[id]`.
- Cada página: trocar divs cruas pelos componentes. **Lógica/fetch intocados.** Quebrar `clientes/[id]` (594) e `clientes` lista (394) em subcomponentes ao migrar.
- **Portão por lote:** smoke visual + dados carregam idênticos.

### Fase 3 — Dashboard acionável
- Gráfico MRR/churn no tempo; sparklines nos KPIs.
- "Ações pendentes" e alertas viram **links clicáveis** para a tela de destino.
- **Portão:** números batem com os atuais; links levam ao lugar certo.

### Fase 4 — Limpeza de código morto *(por último, com rede)*
- Confirmar via grep (UI + cron + webhook) que `tags` top-level, `audit-logs`, `seed`, `close-stale-shifts` não têm consumidor.
- `notifications/*` **permanece** (NotificationBell usa).
- Remover só o confirmadamente órfão.
- **Portão:** build + testes + grep limpo.

**Ordem proposital:** visual (0–2) antes da limpeza (4), porque é o que o dono mais quer ver e a limpeza é a parte de maior risco — isolada no fim com o sistema já estável.

---

## 6. Estratégia de testes

A garantia "zero regressão" precisa de um **oráculo verificável**, não só inspeção a olho. Por isso o portão combina três camadas:

- **Unitário:** cada compositor novo em `src/components/admin/` testado isolado; o helper `adminStatusVariant` testado cobrindo todos os pares `kind`×`status`.
- **Build/type:** `tsc` limpo + `next build` verde a cada portão.
- **Suite existente:** rodar a suite completa (~750 testes) a cada portão; não pode haver regressão.
- **Checklist de smoke por rota (oráculo manual):** existe um documento `admin-smoke-checklist.md` (criado na Fase 0) enumerando as 24 páginas e, para cada uma, as asserções concretas — quais KPIs/tabelas devem carregar dados, quais filtros aplicar e o resultado esperado, quais botões/modais devem abrir. O smoke por lote percorre esse checklist; "os mesmos dados carregam" passa a ter critério objetivo.
- **Smoke automatizado leve (Playwright / skill `browse`):** por lote, um passe que carrega cada rota migrada, afirma que os elementos-chave renderizam (header, primeira tabela/card com ≥1 linha quando há dados) e dispara **uma** ação primária (ex.: aplicar um filtro) sem erro de console. Transforma o smoke num artefato repetível, não numa "vibe".
- **Cobertura:** compositores novos com testes; meta mínima 80% no código adicionado.

### Definição do portão de validação (aplicado ao fim de cada fase/lote)
1. `tsc` limpo. 2. `next build` verde. 3. Suite ~750 testes verde. 4. Checklist de smoke da(s) rota(s) afetada(s) cumprido. 5. Passe Playwright/`browse` leve sem erro de console. 6. Review do diff. Só então avança; deploy só com aprovação manual.

---

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Quebrar funcionalidade ao migrar | Só troca de casca; lógica/fetch intocados; smoke por lote |
| Vazar tema claro para o resto do app | Só edita `src/app/admin/**` + add `src/components/admin/`; tema global e `.dark` intocados; app/landing não tocados |
| Remover API viva na limpeza | Grep UI+cron+webhook antes; `notifications` excluída; limpeza por último |
| Colisão com sessão paralela (histórico) | Trabalhar em branch dedicada; commits atômicos por fase |
| Contraste/acessibilidade insuficiente no light | Tokens validados para WCAG AA; labels/ARIA nos componentes |
| Regressão silenciosa em página grande | Quebrar `clientes/[id]` e `clientes` lista em subcomponentes ao migrar |

---

## 8. Critérios de sucesso
- Toda a admin em tema claro Linear/Vercel, visualmente coeso.
- Duplicação de badge/card/tabela eliminada (fonte única via componentes).
- Sidebar funcional em mobile; menu completo (sem órfãs); `/configuracoes` é hub real.
- Dashboard com gráficos/sparklines e ações clicáveis.
- Código morto confirmado removido; `notifications` preservada.
- **Zero regressão funcional** — toda funcionalidade que funcionava continua funcionando.
- `tsc` limpo, `build` verde, suite de testes verde a cada fase.
