# AUDITORIA_ADMIN.md — PDV Ótica SaaS Admin Panel
**Data:** 2026-03-27
**Status:** READ-ONLY — diagnóstico, sem alterações

---

## Seção 1: Resumo Executivo

| Categoria | Quantidade |
|---|---|
| Páginas encontradas (`/admin`) | **18** |
| APIs encontradas (`/api/admin`) | **43 routes** |
| Erros TypeScript (`tsc --noEmit`) | **0** (build passou sem erros) |
| Problemas CRÍTICOS | **3** |
| Problemas ALTOS | **5** |
| Problemas MÉDIOS | **4** |
| Problemas BAIXOS | **3** |

**Build status:** ✅ Compila sem erros TypeScript.
**Prisma schema:** ✅ Válido — todos os models Sprint 1 (Tag, ActivityLog, OnboardingChecklist, DunningRule, AdminNotification, SLAPolicy, ClientPortalConfig) existem no schema.
**Middleware de auth:** ✅ Protege `/admin/**` e `/api/admin/**` via JWT cookie `admin.session-token`.

---

## Seção 2: Problemas Encontrados

---

### 🔴 [CRÍTICO] URL das APIs de Faturas está errada (404 em produção)

- **Onde:** `src/app/admin/financeiro/faturas/nova/new-invoice-form.tsx:38` e `src/app/admin/financeiro/faturas/[id]/invoice-actions.tsx:25`
- **O que:**
  - `new-invoice-form.tsx` chama `POST /api/admin/financeiro/faturas/create`
  - `invoice-actions.tsx` chama `POST /api/admin/financeiro/faturas/${invoiceId}/workflow`
  - As rotas **reais** são:
    - `POST /api/admin/faturas/create`
    - `POST /api/admin/faturas/[id]/workflow`
  - O prefixo `/financeiro/` não existe na estrutura de API — qualquer tentativa retorna **404**.
- **Impacto:** **Impossível criar cobranças manuais.** Impossível avançar no workflow de fatura (enviar, marcar como pago, gerar NF). Os formulários da página `/admin/financeiro/faturas/nova` e `/admin/financeiro/faturas/[id]` falham silenciosamente.
- **Como resolver:**
  - Opção A (recomendada): renomear as chamadas no frontend para a URL correta:
    - `new-invoice-form.tsx:38` → trocar `/api/admin/financeiro/faturas/create` por `/api/admin/faturas/create`
    - `invoice-actions.tsx:25` → trocar `/api/admin/financeiro/faturas/` por `/api/admin/faturas/`
  - Opção B: criar redirecionamento de rota no Next.js (desnecessário se A for feito)
- **Estimativa:** Rápido (< 30min) — 2 trocas de string em 2 arquivos

---

### 🔴 [CRÍTICO] GET `/api/admin/clientes` não existe — Aba Rede quebrada

- **Onde:** `src/app/admin/clientes/[id]/company-network.tsx:71`
- **O que:** O componente CompanyNetwork chama `GET /api/admin/clientes?pageSize=100` para listar empresas ao criar uma rede. Não existe nenhuma rota `GET` no root `/api/admin/clientes` — apenas subrotas (`/clientes/create`, `/clientes/[id]`, etc.).
- **Impacto:** A **aba Rede** na página de detalhe do cliente quebra ao tentar criar uma nova rede. O dropdown de seleção de empresas fica vazio ou gera erro silencioso. Redes existentes ainda carregam (usam `/api/admin/networks/[id]`), mas criar novas redes não funciona.
- **Como resolver:** Criar rota `GET /api/admin/clientes/route.ts` que retorna lista simplificada de empresas (`id`, `name`, `networkId`), ou alterar o componente para usar `/api/admin/company-users` adaptado, ou criar um novo endpoint `/api/admin/companies` que sirva esse propósito.
- **Estimativa:** Médio (1-2h) — criar nova rota GET com paginação e filtros básicos

---

### 🔴 [CRÍTICO] Página `/admin/suporte/tickets/[id]` sem proteção de autenticação

- **Onde:** `src/app/admin/suporte/tickets/[id]/page.tsx`
- **O que:** Esta é a única página protegida do `/admin` que **não chama `requireAdmin()`** ou `getAdminSession()`. O middleware JWT protege o acesso via cookie, mas dentro do código Next.js não há verificação — se o middleware for bypassado ou alterado, a página expõe dados sem auth. Também impede saber qual admin está acessando (sem `admin.id` disponível).
- **Impacto:** Inconsistência de segurança. Em cenários de SSR com cache ou revalidação, pode vazar dados de tickets. Não é possível registrar quem acessou o ticket nos logs de auditoria.
- **Como resolver:** Adicionar `const admin = await requireAdmin();` no início da função `TicketDetail` ou na função `getTicket`.
- **Estimativa:** Rápido (< 30min) — uma linha de código

---

### 🟠 [ALTO] Página `/admin/suporte/tickets/novo` não existe — botão quebrado

- **Onde:** `src/app/admin/suporte/tickets/page.tsx` — botão "Novo Ticket" aponta para `/admin/suporte/tickets/novo`
- **O que:** A página `/admin/suporte/tickets/novo` não existe. Não há `page.tsx` nesse diretório.
- **Impacto:** Clicar em "Novo Ticket" na página de tickets leva a uma **página 404**. Não é possível criar tickets via painel admin.
- **Como resolver:** Criar página `src/app/admin/suporte/tickets/novo/page.tsx` com formulário de criação, ou remover/substituir o botão por um modal inline.
- **Estimativa:** Médio (1-2h) — criar página com formulário + API de criação de ticket (a API POST `/api/admin/tickets` também não existe — ver próximo bug)

---

### 🟠 [ALTO] API POST para criar tickets não existe

- **Onde:** Não existe `POST /api/admin/tickets/route.ts`
- **O que:** Há endpoints `PATCH /api/admin/tickets/[id]/status` e `POST /api/admin/tickets/[id]/messages` para atualizar tickets existentes, mas nenhum endpoint para **criar** um novo ticket pelo admin.
- **Impacto:** Mesmo que a página `/admin/suporte/tickets/novo` seja criada, não há backend para processar a criação.
- **Como resolver:** Criar `src/app/api/admin/tickets/route.ts` com `POST` handler que cria `SupportTicket` no Prisma.
- **Estimativa:** Médio (1-2h)

---

### 🟠 [ALTO] Página `/admin/configuracoes` (Config) não existe — link no menu quebrado

- **Onde:** `src/app/admin/admin-nav.tsx` — item "Config" aponta para `/admin/configuracoes` (exact match)
- **O que:** A rota `/admin/configuracoes` não tem `page.tsx`. O diretório existe mas só tem subdiretórios `equipe/`, `logs/`, `planos/`. Ao clicar em "Config" no menu, renderiza 404.
- **Impacto:** Item "Config" no menu leva a página 404. A destacagem de rota ativa também funciona incorretamente (o item "Config" nunca fica ativo pois pathname nunca é exatamente `/admin/configuracoes`).
- **Como resolver:** Criar `src/app/admin/configuracoes/page.tsx` com redirect para `/admin/configuracoes/planos` ou criar uma página de visão geral das configurações.
- **Estimativa:** Rápido (< 30min) — redirect simples ou página index

---

### 🟠 [ALTO] Página de detalhe de ticket — tema claro inconsistente com o admin dark

- **Onde:** `src/app/admin/suporte/tickets/[id]/page.tsx`, `ticket-messages.tsx`, `ticket-actions.tsx`
- **O que:** A página usa componentes `Card`, `Badge`, `Button`, `Textarea`, `Checkbox`, `Label` do Shadcn UI com estilos **light-mode** (cores como `bg-gray-50`, `text-gray-800`, `bg-yellow-50`, `border-yellow-200`). Todo o resto do admin usa dark theme (`bg-gray-900`, `text-white`, `border-gray-800`).
- **Impacto:** A página parece completamente diferente do restante do admin — fundo branco/cinza claro no meio de um tema escuro. Visualmente quebrado.
- **Como resolver:** Reescrever os componentes da página de detalhe de ticket usando as mesmas classes Tailwind dark que as demais páginas do admin (sem usar `Card`/`Badge`/`Button` do Shadcn).
- **Estimativa:** Médio (1-2h)

---

### 🟠 [ALTO] Exports "Health Scores" e "Auditoria" não existem

- **Onde:** `src/app/admin/relatorios/page.tsx` — ExportCard com hrefs `/api/admin/export/health-scores` e `/api/admin/export/auditoria`
- **O que:** A página de relatórios exibe 6 botões de export. Apenas 4 têm rota real:
  - ✅ `/api/admin/export/clientes`
  - ✅ `/api/admin/export/assinaturas`
  - ✅ `/api/admin/export/faturas`
  - ✅ `/api/admin/export/tickets`
  - ❌ `/api/admin/export/health-scores` — não existe
  - ❌ `/api/admin/export/auditoria` — não existe
- **Impacto:** Clicar em "Baixar CSV" para Health Scores ou Auditoria retorna 404.
- **Como resolver:** Criar as duas rotas de export faltantes ou remover os botões da página.
- **Estimativa:** Médio (1-2h) — criar 2 route handlers simples com query Prisma + CSV

---

### 🟡 [MÉDIO] Componente `AdminDashboard.tsx` é órfão (nunca importado)

- **Onde:** `src/app/admin/dashboard/AdminDashboard.tsx`
- **O que:** Arquivo `.tsx` com um componente `AdminDashboard` que nunca é importado por nenhuma página. A página real do dashboard está em `src/app/admin/page.tsx` (Server Component independente). O arquivo órfão é provavelmente um artefato de refatoração.
- **Impacto:** Dead code — aumenta o bundle size se for incluído acidentalmente, confunde devs.
- **Como resolver:** Deletar o arquivo `src/app/admin/dashboard/AdminDashboard.tsx`.
- **Estimativa:** Rápido (< 30min)

---

### 🟡 [MÉDIO] Página `/admin/assinaturas` não está no menu de navegação

- **Onde:** `src/app/admin/assinaturas/page.tsx` existe, mas `admin-nav.tsx` não tem link para ela
- **O que:** A página de Assinaturas existe e funciona (lista todas as assinaturas com filtros por status), mas não tem entrada no menu lateral. Só é acessível via URL direta ou link externo.
- **Impacto:** Funcionalidade existente e útil completamente inacessível via navegação normal. Usuários admin não sabem que existe.
- **Como resolver:** Adicionar item "Assinaturas" no menu, provavelmente na seção "Principal" após "Clientes".
- **Estimativa:** Rápido (< 30min) — uma linha em `admin-nav.tsx`

---

### 🟡 [MÉDIO] Aba Rede (CompanyNetwork) usa POST com `action` body — padrão não-RESTful

- **Onde:** `src/app/admin/clientes/[id]/company-network.tsx` — `handleRemoveCompany` e `handleDeleteNetwork`
- **O que:** Para remover empresa de rede e desfazer rede, o frontend faz `POST /api/admin/networks/[id]` com `{ action: "remove-company" }` ou `{ action: "delete" }`. A API `networks/[id]/route.ts` tem um handler `POST` para isso, então tecnicamente funciona. Porém é um padrão não-RESTful que pode confundir e dificulta manutenção. Deveria ser `DELETE /api/admin/networks/[id]` e `DELETE /api/admin/networks/[id]/companies/[companyId]`.
- **Impacto:** Funcional, mas código difícil de entender e manter. Baixo risco de bugs.
- **Como resolver:** Refatorar para usar `DELETE` no router da API e atualizar os fetch calls. Não urgente.
- **Estimativa:** Médio (1-2h)

---

### 🟡 [MÉDIO] `DunningRule` e `DunningEvent` — modelos existem no schema mas sem páginas/APIs

- **Onde:** Schema tem `DunningRule` e `DunningEvent`, mas nenhuma página ou API admin os utiliza.
- **O que:** Os models de automação de cobrança (dunning) foram adicionados na Sprint 1 mas nenhuma interface foi criada para gerenciá-los. As regras de dunning não podem ser configuradas pelo admin.
- **Impacto:** Feature prometida no Sprint 1 mas não implementada na camada de apresentação. Não há "feature quebrada" per se — a feature simplesmente não existe na UI.
- **Como resolver:** Sprint 3.2 conforme planejado — criar página `/admin/financeiro/inadimplencia/dunning` ou seção dentro de `/admin/configuracoes`.
- **Estimativa:** Complexo (3h+)

---

### 🟢 [BAIXO] `ActivityLog` — model existe mas é chamado como `activityLog` no Prisma (casing inconsistente com convenção)

- **Onde:** `src/app/admin/clientes/[id]/page.tsx:83` — usa `prisma.activityLog.findMany`
- **O que:** Funciona corretamente (Prisma é case-insensitive para o model name), mas o model no schema é `ActivityLog` e a convenção Prisma usa camelCase `activityLog`. Não é um bug, mas é inconsistência de nomenclatura interna.
- **Impacto:** Nenhum — funciona corretamente.
- **Como resolver:** Nenhuma ação necessária.

---

### 🟢 [BAIXO] Página `/admin/usuarios` não tem link para criar novo usuário

- **Onde:** `src/app/admin/usuarios/page.tsx`
- **O que:** A página lista usuários com filtros e paginação, mas não tem botão "Novo Usuário" ou link para criar user em uma empresa específica. A criação de usuários está disponível na aba "Usuários" de `/admin/clientes/[id]` (via `company-users.tsx`), mas não há acesso global.
- **Impacto:** Menor — não é possível criar usuário diretamente pela página global, mas é possível via detalhe do cliente.
- **Como resolver:** Adicionar botão ou modal de criação de usuário na página global (ou deixar como está — pode ser intencional).
- **Estimativa:** Médio (1-2h)

---

### 🟢 [BAIXO] `AdminNotification` — model existe mas criação automática não está implementada

- **Onde:** A API `GET/PATCH /api/admin/notifications` existe e funciona. O `NotificationBell` exibe notificações. Mas nenhum código cria automaticamente notificações (ex: trial expirando, health crítico, fatura vencida).
- **O que:** As notificações admin existem na UI e API, mas precisam ser alimentadas manualmente ou por jobs agendados. Não há service de criação automática.
- **Impacto:** O sino de notificações sempre mostra zero itens em ambiente real. Não quebra nada, mas a feature está vazia.
- **Como resolver:** Sprint 3.3 conforme planejado — criar service que gera `AdminNotification` em eventos críticos.
- **Estimativa:** Complexo (3h+)

---

## Seção 3: O que está funcionando ✅

- **Build TypeScript:** Zero erros de compilação
- **Middleware de auth:** Protege corretamente todas as rotas `/admin/**` e `/api/admin/**`
- **Dashboard `/admin`:** Carrega KPIs, MRR, alertas de health, trials expirando, faturas pendentes — tudo via Prisma direto
- **Lista de Clientes `/admin/clientes`:** Busca, filtros (status, health, onboarding, segment, tag), tabela com dados completos
- **Detalhe do Cliente `/admin/clientes/[id]`:**
  - Aba Resumo: timeline (ActivityLog), health score, onboarding checklist, tags — ✅
  - Aba Dados: formulário de edição funciona (PATCH `/api/admin/clientes/[id]`) — ✅
  - Aba Assinatura: plano, ciclo, histórico de assinatura — ✅
  - Aba Filiais: CRUD completo via `/api/admin/companies/[id]/branches` — ✅
  - Aba Usuários: CRUD + reset senha + permissões via `/api/admin/companies/[id]/users` — ✅
  - Aba Faturas: lista faturas da assinatura, link para detalhe — ✅
  - Aba Notas: CRUD via `/api/admin/clientes/[id]/notes` — ✅
  - Aba Uso: UsageSnapshots (últimos 30 dias) — ✅
  - Aba Rede: carrega rede existente, toggle de compartilhamento — ✅ (criação nova: ❌ bug #2)
  - Ações da empresa: bloquear, desbloquear, reativar, estender trial, mudar plano, mudar ciclo, cancelar, impersonar — todas via `/api/admin/clientes/[id]/actions` — ✅
- **Novo Cliente `/admin/clientes/novo`:** Wizard 5 steps, validação por step, ViaCEP, POST `/api/admin/clientes/create` — ✅
- **Usuários Globais `/admin/usuarios`:** Lista com filtros, paginação, toggle ativar/desativar — ✅
- **Assinaturas `/admin/assinaturas`:** Lista com filtros por status, totais — ✅ (mas sem link no menu)
- **Financeiro `/admin/financeiro`:** KPIs (recebido, pendente, vencido, previsão), top 5 inadimplentes — ✅
- **Faturas `/admin/financeiro/faturas`:** Lista, filtros por status e etapa do workflow, KPIs financeiros — ✅
- **Detalhe da Fatura `/admin/financeiro/faturas/[id]`:** Workflow visual (5 etapas), dados da empresa, datas — ✅ (mas InvoiceActions chama URL errada: ❌ bug #1)
- **Inadimplência `/admin/financeiro/inadimplencia`:** Filtros por dias de atraso, tabela de faturas vencidas — ✅
- **Tickets `/admin/suporte/tickets`:** Lista com KPIs, tabela por prioridade — ✅
- **Detalhe do Ticket `/admin/suporte/tickets/[id]`:** Carrega ticket, histórico de mensagens, mudança de status — ✅ (mas tema claro: ⚠️ bug #4)
- **Relatórios `/admin/relatorios`:** KPIs, 4 exports funcionais (CSV clientes, assinaturas, faturas, tickets) — ✅ (2 exports faltando: ❌ bug #5)
- **Planos `/admin/configuracoes/planos`:** CRUD completo de planos (criar, editar, desativar) — ✅
- **Equipe `/admin/configuracoes/equipe`:** CRUD de admins (criar, editar, desativar) — ✅
- **Logs `/admin/configuracoes/logs`:** Auditoria paginada com filtros por ação, empresa, data — ✅
- **NotificationBell:** Aparece no header, busca `/api/admin/notifications`, marcar lida, marcar todas — ✅ (mas nunca tem notificações criadas automaticamente: ⚠️)
- **Todos os 24 modelos Prisma** usados no admin existem no schema — ✅

---

## Seção 4: Plano de Correção

### Batch URGENTE — Impedem uso de funcionalidades core

```
Bug #1: URL das faturas errada (2 arquivos, 2 trocas de string)
Bug #2: GET /api/admin/clientes não existe (criar nova rota)
Bug #3: Ticket detail sem requireAdmin() (1 linha)
```

**Prompt pronto para Claude Code:**
```
Corrija os seguintes 3 bugs no /admin:

1. Em `src/app/admin/financeiro/faturas/nova/new-invoice-form.tsx`, linha 38:
   Troque `/api/admin/financeiro/faturas/create` por `/api/admin/faturas/create`

2. Em `src/app/admin/financeiro/faturas/[id]/invoice-actions.tsx`, linha 25:
   Troque `/api/admin/financeiro/faturas/` por `/api/admin/faturas/`

3. Em `src/app/admin/suporte/tickets/[id]/page.tsx`:
   No início da função TicketDetail (ou antes de chamar getTicket), adicione:
   `const { requireAdmin } = await import("@/lib/admin-session"); await requireAdmin();`
   Ou importe no topo do arquivo e chame no início do componente page.

4. Crie a rota `src/app/api/admin/clientes/route.ts` com um handler GET que retorne:
   `prisma.company.findMany({ select: { id, name, networkId }, orderBy: { name: "asc" }, take: 200 })`
   protegido com `getAdminSession()`.
```

---

### Batch ALTO — Features quebradas visíveis ao usuário

```
Bug #4: Tema claro no detalhe de ticket
Bug #5: Exports health-scores e auditoria faltando
Bug #6: /admin/configuracoes 404 (Config no menu)
Bug #7: /admin/suporte/tickets/novo não existe (botão quebrado)
```

**Prompt pronto para Claude Code:**
```
Corrija os seguintes bugs visuais e de navegação no /admin:

1. Crie `src/app/admin/configuracoes/page.tsx` que faz redirect para
   `/admin/configuracoes/planos` (usando `redirect` do next/navigation).

2. Remova ou desabilite o botão "Novo Ticket" em `/admin/suporte/tickets/page.tsx`
   até que a feature seja implementada, ou crie um form modal inline básico.

3. Crie as rotas de export faltantes:
   - `src/app/api/admin/export/health-scores/route.ts`: GET que exporta CSV dos
     HealthScore mais recentes de cada empresa
   - `src/app/api/admin/export/auditoria/route.ts`: GET que exporta CSV dos
     GlobalAudit dos últimos 90 dias

4. Reescreva `src/app/admin/suporte/tickets/[id]/page.tsx`,
   `ticket-actions.tsx` e `ticket-messages.tsx` substituindo os componentes
   Shadcn light-mode (Card, Badge, Button, Textarea, Checkbox) por HTML
   direto com classes Tailwind dark-mode, consistente com o resto do admin
   (bg-gray-900, border-gray-800, text-white, etc).
```

---

### Batch MÉDIO — Melhorias de usabilidade

```
Bug #8: /admin/assinaturas sem link no menu
Bug #9: AdminDashboard.tsx órfão — remover
```

**Prompt pronto para Claude Code:**
```
1. Em `src/app/admin/admin-nav.tsx`, adicione na seção "Principal":
   `{ href: "/admin/assinaturas", icon: CreditCard, label: "Assinaturas", exact: false }`
   (CreditCard já está importado)

2. Delete o arquivo órfão `src/app/admin/dashboard/AdminDashboard.tsx`.
```

---

### Batch BAIXO / Sprint Futuro — Implementações pendentes

```
Sprint 3.2: Dashboard de dunning/collections (DunningRule, DunningEvent)
Sprint 3.3: Criação automática de AdminNotification em eventos críticos
Sprint 3.3: Página /admin/suporte/tickets/novo com form + API POST /api/admin/tickets
```

---

## Seção 5: Mapa Visual

```
/admin (Dashboard)                    ✅ OK
├── /clientes                         ✅ OK
│   ├── /novo                         ✅ OK (Wizard 5 steps funciona)
│   └── /[id]                         ⚠️ Parcial
│       ├── Resumo                    ✅ OK
│       ├── Dados                     ✅ OK
│       ├── Assinatura                ✅ OK
│       ├── Filiais                   ✅ OK
│       ├── Usuários                  ✅ OK
│       ├── Faturas                   ✅ OK (lista funciona)
│       ├── Notas                     ✅ OK
│       ├── Uso                       ✅ OK
│       └── Rede                      ⚠️ Parcial (leitura OK, criação nova 404)
├── /usuarios                         ✅ OK
├── /assinaturas                      ⚠️ Parcial (página existe, sem link no menu)
├── /financeiro                       ✅ OK
│   ├── /faturas                      ✅ OK (listagem OK)
│   │   ├── /nova                     ❌ Quebrado (POST chama URL errada)
│   │   └── /[id]                     ❌ Quebrado (workflow chama URL errada)
│   └── /inadimplencia                ✅ OK
├── /suporte
│   └── /tickets                      ✅ OK
│       ├── /novo                     🚫 Não existe (botão aponta para 404)
│       └── /[id]                     ⚠️ Parcial (funciona, mas tema claro)
├── /relatorios                       ⚠️ Parcial (4/6 exports funcionam)
├── /configuracoes
│   ├── (index)                       🚫 Não existe (Config no menu → 404)
│   ├── /planos                       ✅ OK
│   ├── /equipe                       ✅ OK
│   └── /logs                         ✅ OK
└── /notificacoes (sino no header)    ⚠️ Parcial (UI funciona, sem notificações auto)
```

**Legenda:** ✅ OK | ⚠️ Parcial | ❌ Quebrado | 🚫 Não existe

---

## Notas Adicionais

### Segurança
- ✅ Middleware Edge protege todas as rotas `/admin/**` com JWT
- ✅ BCrypt para senhas de admin
- ✅ Audit logging em todas as operações críticas
- ⚠️ `ticket/[id]/page.tsx` não chama `requireAdmin()` (depende 100% do middleware)
- ✅ Role-based access (SUPER_ADMIN, ADMIN, SUPPORT, BILLING) nas APIs críticas

### Performance
- ⚠️ Vários server components fazem 5-12 queries paralelas (`Promise.all`) sem cache — OK para uso admin mas pode ser lento com volume alto
- ⚠️ Listas sem paginação virtual (ex: `/admin/clientes` usa `take: 100` fixo, sem cursor pagination)

### Dados
- ✅ Todos os 24 models Prisma usados no admin existem no schema.prisma
- ✅ Sprint 1 models (Tag, ActivityLog, OnboardingChecklist, DunningRule, AdminNotification, SLAPolicy, ClientPortalConfig) todos presentes
- ✅ Sprint 2 models (SavedFilter, etc.) presentes
