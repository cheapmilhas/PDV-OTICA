# Plano de Redesign de UI/UX — Super Admin (PDV Ótica)

**Data:** 2026-07-05 · **Status:** Fase 0 CONCLUÍDA (bug + login + shell). Fases 1-4 aguardam execução.
**Objetivo:** painel administrativo funcional, coeso e sem "cara de IA", aplicando um padrão profissional às ~25 telas internas.
**Método:** ancorado no design system que JÁ existe (`globals.css` + `tailwind.config.js`), refinado com os princípios de UX/dashboard da skill `ui-ux-pro-max`.

---

## 0. Princípio que guia tudo: coerência > novidade

A skill `ui-ux-pro-max`, consultada com "admin dashboard SaaS financial", sugeriu um tema **dark OLED + Fira Code + verde**. **Rejeitamos essa recomendação de propósito** — e é isso que evita a cara de IA:

- O sistema já tem identidade madura e aprovada: **light theme, azul de marca `#2E6BFF`, Plus Jakarta Sans (corpo) + Bricolage Grotesque (títulos)**, cantos ~10px, `shadow-card`, textura de pontos sutil.
- Trocar por um tema genérico de template criaria a inconsistência que dá aparência de "gerado por IA". A decisão do dono (sessão anterior) foi explícita: **manter o tema claro**.
- O que APROVEITAMOS da skill: os padrões de **dashboard data-dense**, o **checklist de qualidade** e as regras de **UX de tabela/densidade/loading/acessibilidade** — não a paleta.

**Regra de ouro:** toda tela usa tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `border-border`, `destructive`, `success`, `warning`, `info`) — **zero cor hardcoded**. É o que unifica o painel e mata o efeito "colcha de retalhos".

---

## 1. Fundação de componentes (o "kit" do admin)

O projeto já tem os blocos certos — o trabalho é **padronizar o uso**, não criar do zero.

| Já existe | Onde | Papel no padrão |
|---|---|---|
| `PageHeader`, `KPICard` | `src/components/admin/` | Já usam tokens — viram o **padrão de referência** de toda página |
| `Table` (shadcn) + `responsive-table.tsx` | `src/components/ui/` | Tabelas — sempre com wrapper `overflow-x-auto` (regra UX) |
| `AdminStatusBadge`, `status-badge.tsx`, `badge.tsx` | admin + ui | Status semânticos (success/warning/destructive/info) |
| `EmptyState` | `src/components/admin/` | Estado vazio — nunca deixar tela em branco |
| `FilterBar` | `src/components/admin/` | Filtros consistentes no topo das listagens |
| Recharts (`MrrChart` = AreaChart) | `src/components/admin/` | **Já é a lib de chart** — NÃO introduzir Chart.js/TanStack |
| `dialog`, `alert-dialog`, `confirm-reason-dialog` | `src/components/ui/` | Confirmação de ações destrutivas |
| Sonner `Toaster` (montado no layout) | `(painel)/layout.tsx` | Feedback de sucesso/erro |

**Gaps a criar (poucos, reutilizáveis):**
1. `TableSkeleton` — skeleton `animate-pulse` para listagens (regra UX "loading > 300ms": hoje várias tabelas aparecem "secas").
2. `SectionCard` — card de seção com título + descrição, para padronizar as telas de Configurações.
3. Padronizar `DataTable` leve sobre a `Table` shadcn (ordenar/paginar) SEM TanStack — usando query params na URL (regra UX "deep linking").

---

## 2. Refino do shell (sidebar + header)

Já corrigido: bug do vazamento, ícone Lock, tokens no logout. Refinos restantes:

1. **Header (top bar):** hoje só tem breadcrumb + sino. Padronizar como faixa de contexto: breadcrumb à esquerda, e à direita ações contextuais da página + sino. Altura e padding fixos (`h-14 px-6`), `border-b border-border`, fundo `bg-background/80 backdrop-blur` sticky — dá sensação de app, não de página estática.
2. **Sidebar ativa:** o `admin-nav.tsx` já marca ativo com `bg-primary/10 text-primary` + dot. Manter — está correto (regra UX "active state"). Só garantir `aria-current="page"` no item ativo (acessibilidade).
3. **Densidade:** a sidebar tem 5 seções. Manter a hierarquia de `text-xs uppercase tracking-wider` nos rótulos de seção (já está bom).
4. **Estado de foco:** garantir `focus-visible:ring-2 ring-ring` em todos os links/botões do shell (navegação por teclado).

---

## 3. Padrão por tipo de tela

### 3.1 Dashboard (`/admin`)
- **Linha de KPIs:** `KPICard` em grid responsivo (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`). Cada card: rótulo `muted`, número grande `font-display`, delta com cor semântica (`success`/`destructive`) + ícone de tendência (não só cor — regra "color não é o único indicador").
- **Gráfico MRR:** AreaChart Recharts com `--primary` a 20% de fill (bate com a orientação da skill: line/area para trend). Tooltip formatado em BRL. `aria-label` no container + tabela alternativa oculta (a11y de chart).
- **Tabela "empresas recentes":** `Table` com wrapper scroll, badges de status, linha clicável (`cursor-pointer`, hover `bg-muted/50`), skeleton no loading.

### 3.2 Listagens (Clientes, Interessados, Assinaturas, Faturas, Tickets, Usuários)
Padrão único:
1. `PageHeader` (título + descrição + ação primária à direita).
2. `FilterBar` (busca + filtros) — estado na **URL via query params** (compartilhável, regra "deep linking").
3. `Table` responsiva com: header semântico, `cursor-pointer` na linha, hover, badges de status, **skeleton** no carregamento, **`EmptyState`** quando vazio ("Nenhum cliente ainda" + ação).
4. **Bulk actions** onde faz sentido (faturas, interessados): coluna de checkbox + barra de ação que aparece ao selecionar (regra UX "bulk actions").
5. Paginação com contagem ("1–20 de 148").

### 3.3 Detalhe (Cliente `[id]`, Fatura `[id]`, Ticket `[id]`)
- `PageHeader` com breadcrumb + status + ações (Editar / mais ações em `dropdown-menu`).
- Conteúdo em `Tabs` (o cliente já usa `company-tabs`) ou em `SectionCard`s empilhados.
- Ações destrutivas SEMPRE via `alert-dialog`/`confirm-reason-dialog` (nunca clique direto).
- Botões async com `disabled={loading}` + spinner (regra "loading buttons" — previne duplo submit; crítico em faturas/cobrança).

### 3.4 Configurações (Planos, Equipe, IA, WhatsApp, Logs, Sincronização, Emails, Segurança)
- Índice de config em cards navegáveis (grid), cada um com ícone (lucide), título e descrição.
- Cada subtela: `SectionCard`s com formulário shadcn (`form` + `label`+`input`) — **todo input com `<label htmlFor>`** (a11y).
- Salvar: botão com loading + toast de sucesso/erro (Sonner já montado).

---

## 4. Correções pontuais de "cara de IA" / inconsistência

| Item | Problema | Correção |
|---|---|---|
| `nova-cobranca-button.tsx` | Ilha dark/índigo (`bg-gray-900`, `indigo-600`, `border-gray-700`) | Migrar para tokens (`bg-card`, `bg-primary`, `border-border`) |
| Badges de role (usuarios/equipe/timeline) | `purple`/`indigo` hardcoded soltos | Definir mapa semântico de cores por role usando tokens/badge variants |
| Tabelas "secas" no loading | Sem skeleton (regra UX High) | `TableSkeleton` |
| Tabelas sem empty state | Tela em branco quando 0 itens | `EmptyState` |
| Foco de teclado | Nem todo interativo tem ring visível | `focus-visible:ring-2 ring-ring` global no admin |
| Inputs sem label associado | a11y | `htmlFor`/`id` em todos os forms |

---

## 5. Checklist de qualidade (da skill, adaptado — rodar por tela)

- [ ] Zero cor hardcoded — só tokens (`bg-card`, `text-foreground`, `bg-primary`, `destructive`…).
- [ ] Ícones SVG (lucide), nunca emoji. Tamanho consistente (`h-4 w-4`/`h-5 w-5`).
- [ ] `cursor-pointer` em tudo que é clicável (linhas de tabela, cards navegáveis).
- [ ] Hover com transição 150–300ms (`transition-colors`), sem layout shift.
- [ ] Foco visível (`focus-visible:ring-2 ring-ring`) — navegação por teclado.
- [ ] Contraste texto ≥ 4.5:1 (corpo em `foreground`, secundário em `muted-foreground` — nunca mais claro).
- [ ] Tabela com `overflow-x-auto`; no mobile, cair para `responsive-table`.
- [ ] Skeleton/spinner para qualquer espera > 300ms.
- [ ] Botão async: `disabled={loading}` + spinner.
- [ ] Empty state útil (mensagem + ação), nunca tela em branco.
- [ ] Erro perto do problema, cor semântica + texto (não só cor).
- [ ] Todo input com `<label htmlFor>`; ícone-botão com `aria-label`.
- [ ] Responsivo em 375 / 768 / 1024 / 1440px, sem scroll horizontal.
- [ ] `aria-current="page"` no item ativo da sidebar.
- [ ] `prefers-reduced-motion` respeitado nas animações.

---

## 6. Ordem de execução sugerida

1. **Fundação** (kit): `TableSkeleton`, `SectionCard`, padrão de `DataTable` leve por query param, tokens de status por role. Refino do header do shell. *(base para tudo)*
2. **Dashboard** — vitrine; maior impacto visual.
3. **Listagens** — aplicar o padrão único (Clientes → Faturas → Interessados → Assinaturas → Tickets → Usuários).
4. **Detalhe** — Cliente `[id]` (mais complexo), Fatura `[id]`, Ticket `[id]`.
5. **Configurações** — índice + 8 subtelas.
6. **Varredura final** com o checklist (§5) tela a tela + verificação no browser em 4 breakpoints.

**Sugestão de entrega:** cada bloco (2→3→4→5) vira um commit próprio, verificado no navegador antes de seguir — mesmo playbook incremental que já usamos. `rm -rf .next` antes de qualquer `tsc` (gotcha conhecido após mover rotas).

---

*Fontes: design system do projeto (`src/app/globals.css`, `tailwind.config.js`); skill `ui-ux-pro-max` (padrões de dashboard data-dense, UX de tabela/loading/empty-state/bulk-action, charts trend=Area/Recharts, checklist de qualidade); inventário de componentes (`src/components/ui/`, `src/components/admin/`). Recomendação de tema dark/Fira Code da skill descartada por decisão de manter a identidade da marca.*
