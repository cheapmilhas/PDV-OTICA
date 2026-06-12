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
- Migração visual dark → light (tema Linear/Vercel) de **toda** a área admin (24 páginas).
- Criação de uma biblioteca de **7 componentes admin reutilizáveis**.
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
2. **Isolamento total da admin.** O tema vive num escopo `.admin-theme`. App/PDV, dashboard das óticas e landing **não são tocados**.
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

### 4.1. Fundação de tokens (tema claro, escopo isolado)

CSS variables sob `.admin-theme`, aplicado no `layout.tsx` da admin. Tailwind mapeia para classes utilitárias semânticas.

| Token | Valor | Uso |
|---|---|---|
| `surface-base` | `#FAFAFA` | Fundo da aplicação |
| `surface-card` | `#FFFFFF` | Cards, tabelas, painéis |
| `surface-hover` | `#F4F4F5` | Hover de linhas/itens |
| `border-subtle` | `#ECECEC` | Bordas de cards |
| `border-default` | `#E4E4E7` | Divisores, inputs |
| `text-primary` | `#18181B` | Títulos, valores |
| `text-secondary` | `#52525B` | Corpo |
| `text-muted` | `#A1A1AA` | Labels, hints |
| `accent` | `#2563EB` | Ações primárias, item ativo |
| status (green/amber/red/blue) | `-600` sobre fundo `-50` | Badges de estado |

**Isolamento:** como o tema é escopado em `.admin-theme`, o restante do sistema (app/PDV teal, landing azul) não é afetado. Migração de página = trocar `bg-gray-900` → `bg-card`, `text-gray-400` → `text-secondary`, etc.

### 4.2. Biblioteca de componentes — `src/components/admin/ui/`

Cada componente é criado **espelhando exatamente** o comportamento atual da página (mesmos dados, mesma lógica); só muda a casca. Cada um com teste unitário isolado.

| Componente | Substitui | Responsabilidade |
|---|---|---|
| `<AdminCard>` | ~40 divs `rounded-xl border bg-gray-900` | Container padrão (variantes plain / header / footer) |
| `<KPICard>` | blocos de métrica do dashboard/financeiro | Ícone + label + valor + tendência (▲▼) + sparkline opcional |
| `<StatusBadge>` | `STATUS_STYLES` duplicado 6× | `status` + `kind` (subscription/invoice/ticket/health) → pinta sozinho. **Fonte única de verdade.** |
| `<DataTable>` | `<table>` HTML repetido | Header, linhas com hover, `overflow-x-auto`, empty state, densidade consistente |
| `<PageHeader>` | títulos `text-2xl` divergentes | Título + subtítulo + slot de ações |
| `<FilterBar>` / `<FilterChip>` | filtros reimplementados | Chips de filtro consistentes |
| `<EmptyState>` | ad-hoc | Ícone + mensagem + ação para listas vazias |

Esses 7 cobrem ~90% do que a admin renderiza.

### 4.3. Limites e clareza (design for isolation)
- **Tokens** dependem só de CSS/Tailwind; consumidos por todos os componentes.
- **Componentes** dependem só de tokens + props tipadas; sem acoplamento a fetch/dados.
- **Páginas** consomem componentes e mantêm sua lógica intacta. Trocar a casca de uma página não afeta outra.
- Os dois arquivos grandes (`clientes/[id]` e `clientes` lista) são quebrados em subcomponentes **ao serem migrados** — melhoria focada, não refactor solto.

---

## 5. Plano de fases (entrega incremental)

Cada fase termina no **portão de validação**: `tsc` + `build` + testes + review + smoke visual no browser. Nada avança se o portão falhar. Deploy só com aprovação.

### Fase 0 — Fundação *(zero impacto visual)*
- Tokens `.admin-theme` em `globals.css` + mapeamento no `tailwind.config`.
- 7 componentes em `src/components/admin/ui/` + testes unitários.
- Aplica `.admin-theme` no `layout.tsx` da admin.
- **Portão:** build verde, componentes testados isolados; app/dashboard/landing intocados.

### Fase 1 — Casca: layout + navegação *(primeiro impacto visual)*
- `layout.tsx` e `admin-nav.tsx` → light mode.
- **Sidebar mobile:** drawer + toggle.
- Menu ganha **Assinaturas** e **Segurança**.
- `/configuracoes` deixa de ser redirect → **hub com cards** das 6 subseções.
- **Portão:** navegar todas as rotas; sidebar testada em mobile + desktop.

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

- **Unitário:** cada componente em `src/components/admin/ui/` testado isolado (render, variantes, StatusBadge cobrindo todos os `kind`/`status`).
- **Regressão visual/funcional:** smoke no browser por lote — confirmar que os dados que carregavam antes carregam depois e que botões/filtros operam igual.
- **Build/type:** `tsc` limpo + `next build` verde a cada portão.
- **Suite existente:** rodar a suite completa (atualmente ~750 testes) a cada portão; não pode haver regressão.
- **Cobertura:** componentes novos com testes; meta mínima 80% nos componentes adicionados.

---

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Quebrar funcionalidade ao migrar | Só troca de casca; lógica/fetch intocados; smoke por lote |
| Vazar tema claro para o resto do app | Escopo `.admin-theme`; app/landing não tocados |
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
