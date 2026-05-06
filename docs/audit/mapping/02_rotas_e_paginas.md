# 02 — Rotas e Páginas

> Mapa completo de pages, layouts e API routes do App Router.

## 1. Visão geral

| Tipo | Quantidade |
|---|---|
| Pages (`page.tsx`) | **105** |
| Layouts (`layout.tsx`) | **7** |
| API Routes (`route.ts`) | **255** |

## 2. Layouts (cadeia)

| Layout | Caminho | Auth/Guard? |
|---|---|---|
| Root | `src/app/layout.tsx` | apenas providers globais (ver) |
| (auth) | implícito (não há `layout.tsx` em `(auth)/`) | — |
| (landing) | `src/app/(landing)/layout.tsx` | público |
| (dashboard) | `src/app/(dashboard)/layout.tsx` | 🔴 **Server-side `auth()` + `checkSubscription()` + redirect `/login`** (linhas 13–46) |
| admin | `src/app/admin/layout.tsx` | guarda separada (cookie `admin.session-token` via middleware) |
| contato | `src/app/contato/layout.tsx` | público |
| precos | `src/app/precos/layout.tsx` | público |
| registro | `src/app/registro/layout.tsx` | público |

⭐ Observação: `(dashboard)/layout.tsx:18-22` chama `auth()` server-side e redireciona para `/login` se não houver sessão. **Isto é a proteção real do dashboard** — `ProtectedRoute` (client-side) é granular por permissão, não por autenticação.

## 3. Pages — TODAS as rotas

### 3.1 Públicas / Auth

| Rota | Arquivo | Tipo | Layout pai | ProtectedRoute? | Permissão | Dynamic? |
|---|---|---|---|---|---|---|
| `/` | `src/app/(landing)/page.tsx` | page | (landing) | ❌ | público | — |
| `/login` | `src/app/(auth)/login/page.tsx` | page | root | ❌ | público | — |
| `/registro` | `src/app/registro/page.tsx` | page | registro | ❌ | público | — |
| `/precos` | `src/app/precos/page.tsx` | page | precos | ❌ | público | — |
| `/contato` | `src/app/contato/page.tsx` | page | contato | ❌ | público | — |
| `/activate` | `src/app/activate/page.tsx` | page | root | ❌ | público (token na query) | — |
| `/force-logout` | `src/app/force-logout/page.tsx` | page | root | ❌ | público | — |
| `/impersonate` | `src/app/impersonate/page.tsx` | page | root | ❌ | público (recebe token de impersonação) | — |

### 3.2 Dashboard (multi-tenant) — `(dashboard)` layout = `auth()` server-side

| Rota | Arquivo | ProtectedRoute? | Permissão | Dynamic? |
|---|---|---|---|---|
| `/dashboard` | `dashboard/page.tsx` | ❌ | **NENHUMA** ⚠️ | — |
| `/dashboard/pdv` | `dashboard/pdv/page.tsx` | ✅ | `sales.create` | — |
| `/dashboard/onboarding` | `dashboard/onboarding/page.tsx` | ❌ | **NENHUMA** ⚠️ | — |
| `/dashboard/diagnostico-caixa` | `dashboard/diagnostico-caixa/page.tsx` | ✅ | (sem `permission=` props no header — INCERTO, ver) | — |
| **Caixa** | | | | |
| `/dashboard/caixa` | `dashboard/caixa/page.tsx` | ❌ | **NENHUMA** ⚠️ | — |
| `/dashboard/caixa/historico` | `dashboard/caixa/historico/page.tsx` | ❌ | **NENHUMA** ⚠️ | — |
| `/dashboard/caixa/[id]/relatorio` | `dashboard/caixa/[id]/relatorio/page.tsx` | ❌ | **NENHUMA** ⚠️ | sim (`[id]`) |
| **Clientes** | | | | |
| `/dashboard/clientes` | `dashboard/clientes/page.tsx` | ✅ | `customers.create` ⚠️ (esperava `customers.view`) | — |
| `/dashboard/clientes/novo` | `dashboard/clientes/novo/page.tsx` | ✅ | `customers.create` | — |
| `/dashboard/clientes/[id]` | `dashboard/clientes/[id]/page.tsx` | ✅ | `customers.view` | sim |
| `/dashboard/clientes/[id]/editar` | `dashboard/clientes/[id]/editar/page.tsx` | ✅ | `customers.edit` | sim |
| **Produtos** | | | | |
| `/dashboard/produtos` | `dashboard/produtos/page.tsx` | ✅ | `products.create` ⚠️ (esperava `products.view`) | — |
| `/dashboard/produtos/novo` | `dashboard/produtos/novo/page.tsx` | ✅ | `products.create` | — |
| `/dashboard/produtos/[id]/editar` | `dashboard/produtos/[id]/editar/page.tsx` | ✅ | `products.edit` | sim |
| `/dashboard/tratamentos` | `dashboard/tratamentos/page.tsx` | ✅ | `products.view` | — |
| **Fornecedores / Lab** | | | | |
| `/dashboard/fornecedores` | `dashboard/fornecedores/page.tsx` | ✅ | `suppliers.view` | — |
| `/dashboard/laboratorios` | `dashboard/laboratorios/page.tsx` | ✅ | `laboratories.view` | — |
| **Funcionários / Usuários** | | | | |
| `/dashboard/funcionarios` | `dashboard/funcionarios/page.tsx` | ✅ | `users.create` ⚠️ (esperava `users.view`) | — |
| `/dashboard/funcionarios/[id]/permissoes` | `dashboard/funcionarios/[id]/permissoes/page.tsx` | ✅ | `permissions.manage` | sim |
| `/dashboard/usuarios` | `dashboard/usuarios/page.tsx` | ✅ | `users.create` ⚠️ | — |
| `/dashboard/usuarios/[id]/permissoes` | `dashboard/usuarios/[id]/permissoes/page.tsx` | ✅ | `permissions.manage` | sim |
| **Vendas** | | | | |
| `/dashboard/vendas` | `dashboard/vendas/page.tsx` | ✅ | `sales.view` | — |
| `/dashboard/vendas/[id]/detalhes` | `dashboard/vendas/[id]/detalhes/page.tsx` | ❌ | **NENHUMA** ⚠️ | sim |
| `/dashboard/vendas/[id]/imprimir` | `dashboard/vendas/[id]/imprimir/page.tsx` | ✅ | `sales.view` | sim |
| `/dashboard/vendas/nova` | (não existe — `next.config.ts:32-37` redireciona 308 para `/dashboard/pdv`) | — | — | — |
| **Orçamentos** | | | | |
| `/dashboard/orcamentos` | `dashboard/orcamentos/page.tsx` | ✅ | `quotes.create` ⚠️ (esperava `quotes.view`) | — |
| `/dashboard/orcamentos/novo` | `dashboard/orcamentos/novo/page.tsx` | ✅ | `quotes.create` | — |
| `/dashboard/orcamentos/[id]` | `dashboard/orcamentos/[id]/page.tsx` | ✅ | `quotes.view` | sim |
| `/dashboard/orcamentos/[id]/editar` | `dashboard/orcamentos/[id]/editar/page.tsx` | ✅ | `quotes.edit` | sim |
| `/dashboard/orcamentos/[id]/imprimir` | `dashboard/orcamentos/[id]/imprimir/page.tsx` | ✅ | `quotes.view` | sim |
| **Ordens de Serviço (OS)** | | | | |
| `/dashboard/ordens-servico` | `dashboard/ordens-servico/page.tsx` | ❌ | **NENHUMA** ⚠️ | — |
| `/dashboard/ordens-servico/nova` | `dashboard/ordens-servico/nova/page.tsx` | ❌ | **NENHUMA** ⚠️ (importa ProtectedRoute mas não usa — INCERTO) | — |
| `/dashboard/ordens-servico/[id]/detalhes` | `dashboard/ordens-servico/[id]/detalhes/page.tsx` | ❌ | **NENHUMA** ⚠️ | sim |
| `/dashboard/ordens-servico/[id]/editar` | `dashboard/ordens-servico/[id]/editar/page.tsx` | ❌ | **NENHUMA** ⚠️ | sim |
| `/dashboard/ordens-servico/[id]/imprimir` | `dashboard/ordens-servico/[id]/imprimir/page.tsx` | ❌ | **NENHUMA** ⚠️ | sim |
| **Estoque** | | | | |
| `/dashboard/estoque` | `dashboard/estoque/page.tsx` | ✅ | `stock.adjust` ⚠️ (esperava `stock.view`) | — |
| `/dashboard/estoque/ajustes` | `dashboard/estoque/ajustes/page.tsx` | ✅ | `stock.adjust` | — |
| `/dashboard/estoque/transferencias` | `dashboard/estoque/transferencias/page.tsx` | ✅ | `stock.view` | — |
| **Financeiro** (todas exigem `financial.view`) | | | | |
| `/dashboard/financeiro` | `dashboard/financeiro/page.tsx` | ✅ | `financial.view` | — |
| `/dashboard/financeiro/dashboard` | … | ✅ | `financial.view` | — |
| `/dashboard/financeiro/contas` | … | ✅ | `financial.view` | — |
| `/dashboard/financeiro/lancamentos` | … | ✅ | `financial.view` | — |
| `/dashboard/financeiro/plano-contas` | … | ✅ | `financial.view` | — |
| `/dashboard/financeiro/dre` | … | ✅ | `financial.view` | — |
| `/dashboard/financeiro/fluxo-caixa` | … | ✅ | `financial.view` | — |
| `/dashboard/financeiro/cartoes` | … | ✅ | `financial.view` | — |
| `/dashboard/financeiro/conciliacao` | … | ✅ | `financial.view` | — |
| `/dashboard/financeiro/conciliacao/[id]` | … | ✅ | `financial.view` | sim |
| `/dashboard/financeiro/despesas-recorrentes` | … | ✅ | `financial.view` | — |
| `/dashboard/financeiro/devolucoes` | … | ✅ | `financial.view` | — |
| `/dashboard/financeiro/lotes-estoque` | … | ✅ | `financial.view` ⚠️ (talvez devesse ser `stock.view`) | — |
| `/dashboard/financeiro/bi` | … | ✅ | `financial.view` | — |
| **Relatórios** | | | | |
| `/dashboard/relatorios` | `dashboard/relatorios/page.tsx` | ❌ | **NENHUMA** ⚠️ (índice — INCERTO) | — |
| `/dashboard/relatorios/vendas` | … | ✅ | `reports.sales` | — |
| `/dashboard/relatorios/produtos-vendidos` | … | ✅ | `reports.sales` | — |
| `/dashboard/relatorios/produtos-sem-giro` | … | ✅ | `reports.inventory` | — |
| `/dashboard/relatorios/posicao-estoque` | … | ✅ | `reports.inventory` | — |
| `/dashboard/relatorios/contas-pagar` | … | ✅ | `reports.financial` | — |
| `/dashboard/relatorios/contas-receber` | … | ✅ | `reports.financial` | — |
| `/dashboard/relatorios/dre` | … | ✅ | `reports.financial` | — |
| `/dashboard/relatorios/historico-caixas` | … | ✅ | `reports.sales` | — |
| `/dashboard/relatorios/comissoes` | … | ✅ | `reports.sales` | — |
| `/dashboard/relatorios/metricas-lentes` | … | ✅ | `reports.sales` | — |
| `/dashboard/relatorios/comparativo-lojas` | … | ✅ | `reports.view` | — |
| `/dashboard/relatorios/avancados` | … | ✅ | `reports.financial` | — |
| **Outras** | | | | |
| `/dashboard/cashback` | `dashboard/cashback/page.tsx` | ✅ | `cashback.view` | — |
| `/dashboard/campanhas` | `dashboard/campanhas/page.tsx` | ✅ | `campaigns.view` | — |
| `/dashboard/lembretes` | `dashboard/lembretes/page.tsx` | ✅ | `reminders.view` | — |
| `/dashboard/lembretes/configuracoes` | … | ✅ | `settings.edit` | — |
| `/dashboard/metas` | `dashboard/metas/page.tsx` | ✅ | `goals.view` | — |
| **Configurações** | | | | |
| `/dashboard/configuracoes` | … | ✅ | `settings.view` | — |
| `/dashboard/configuracoes/aparencia` | … | ✅ | `settings.view` | — |
| `/dashboard/configuracoes/empresa` | … | ✅ | `company.settings` | — |
| `/dashboard/configuracoes/cashback` | … | ✅ | `settings.edit` | — |
| `/dashboard/configuracoes/comissoes` | … | ✅ | `settings.edit` | — |
| `/dashboard/configuracoes/lembretes` | … | ✅ | `settings.edit` | — |
| `/dashboard/configuracoes/regras` | … | ✅ | `settings.edit` | — |
| `/dashboard/configuracoes/permissoes` | … | ✅ | `permissions.manage` | — |

### 3.3 Admin (painel SaaS — auth via JWT separado)

| Rota | Arquivo | Tipo | Auth | Dynamic? |
|---|---|---|---|---|
| `/admin/login` | `admin/login/page.tsx` | page | público | — |
| `/admin` | `admin/page.tsx` | page | middleware verifica `admin.session-token` | — |
| `/admin/assinaturas` | `admin/assinaturas/page.tsx` | page | admin | — |
| `/admin/clientes` | `admin/clientes/page.tsx` | page | admin | — |
| `/admin/clientes/novo` | … | page | admin | — |
| `/admin/clientes/[id]` | … | page | admin | sim |
| `/admin/configuracoes` | … | page | admin | — |
| `/admin/configuracoes/equipe` | … | page | admin | — |
| `/admin/configuracoes/logs` | … | page | admin | — |
| `/admin/configuracoes/planos` | … | page | admin | — |
| `/admin/dashboard` | `admin/dashboard/page.tsx` | page | admin | — |
| `/admin/financeiro` | … | page | admin | — |
| `/admin/financeiro/faturas` | … | page | admin | — |
| `/admin/financeiro/faturas/nova` | … | page | admin | — |
| `/admin/financeiro/faturas/[id]` | … | page | admin | sim |
| `/admin/financeiro/inadimplencia` | … | page | admin | — |
| `/admin/relatorios` | … | page | admin | — |
| `/admin/suporte/tickets` | … | page | admin | — |
| `/admin/suporte/tickets/novo` | … | page | admin | — |
| `/admin/suporte/tickets/[id]` | … | page | admin | sim |
| `/admin/usuarios` | … | page | admin | — |
| `/admin/logout` | `admin/logout/route.ts` | **route handler** | admin | — |

### 3.4 API Routes — agrupadas por domínio

> Detalhamento por endpoint (auth, multi-tenant, validação, transação) está no relatório **03_apis_e_server_actions.md**. Aqui apenas o índice.

#### Auth / Admin / Setup (28)
- `/api/auth/[...nextauth]`, `/api/auth/activate`, `/api/auth/clear-session`, `/api/auth/impersonate-session`, `/api/auth/validate-invite`
- `/api/admin-auth/login`, `/api/admin-auth/logout`, `/api/admin-auth/me`
- `/api/admin/auth/[...nextauth]`, `/api/admin/auth/login`, `/api/admin/auth/logout`
- `/api/admin/audit-logs`
- `/api/admin/clientes` (+ `/[id]`, `/[id]/actions`, `/[id]/notes`, `/[id]/notes/[noteId]`, `/[id]/onboarding`, `/[id]/tags`, `/[id]/tags/[tagId]`, `/create`)
- `/api/admin/companies/[id]/branches[/branchId]`, `/users[/userId]/{permissions,reset-password}`
- `/api/admin/company-users[/id]`
- `/api/admin/export/{assinaturas,auditoria,clientes,faturas,health-scores,tickets}`
- `/api/admin/faturas/[id]/workflow`, `/api/admin/faturas/create`
- `/api/admin/health-score`
- `/api/admin/impersonate`, `/api/admin/impersonate/[id]`
- `/api/admin/networks`, `/api/admin/networks/[id]`
- `/api/admin/notifications`, `/api/admin/notifications/[id]/read`, `/api/admin/notifications/read-all`
- `/api/admin/plans`, `/api/admin/plans/[id]`
- `/api/admin/seed`
- `/api/admin/tags`, `/api/admin/tags/[id]`
- `/api/admin/tickets`, `/api/admin/tickets/[id]/messages`, `/api/admin/tickets/[id]/status`
- `/api/admin/users`, `/api/admin/users/[id]`
- `/api/debug-auth` 🟡 endpoint de debug — verificar se é público
- `/admin/logout` (route)

#### Vendas / Orçamentos / OS / PDV (24)
- `/api/sales`, `/api/sales/[id]`, `/api/sales/[id]/{carne,cashback,pdf,reactivate,refund,refunds,seller}`
- `/api/quotes`, `/api/quotes/[id]`, `/api/quotes/stats`, `/api/quotes/[id]/{cancel,convert,follow-up,follow-ups,mark-sent,status}`
- `/api/service-orders`, `/api/service-orders/[id]`, `/api/service-orders/[id]/{convert,deliver,revert,status,warranty}`
- `/api/prescriptions`, `/api/prescriptions/[id]`, `/api/prescriptions/customer/[customerId]`

#### Caixa / Financeiro (28)
- `/api/cash/{shift,debug,movements}`, `/api/cash/shift/[id]`, `/api/cash/shift/close`
- `/api/cash-registers`, `/api/cash-registers/[id]/transactions`, `/api/cash-terminals`
- `/api/accounts-payable`, `/api/accounts-receivable`, `/api/accounts-receivable/[id]`, `/api/accounts-receivable/[id]/{penalties,receipt}`, `/api/accounts-receivable/receive-multiple`
- `/api/finance/{accounts,aggregate,backfill-expense-entries,bi,card-receivables,chart,dashboard,entries,reports}`
- `/api/finance/accounts/[id]/statement`, `/api/finance/bi/stock-aging`
- `/api/finance/reconciliation/{batches,rules,search-payments,templates}` + sub-rotas
- `/api/finance/reports/{cash-flow,dre}`
- `/api/recurring-expenses`, `/api/recurring-expenses/[id]`, `/api/recurring-expenses/generate`
- `/api/card-fees`

#### Cashback (7)
- `/api/cashback/{config,balance/[customerId],customer/[customerId],customers,expiring,summary,validate}`

#### Estoque (8)
- `/api/stock-adjustments`, `/api/stock-adjustments/[id]`, `/api/stock-adjustments/[id]/{approve,reject}`
- `/api/stock-movements`, `/api/stock-movements/transfer`
- `/api/stock-transfers`, `/api/stock-transfers/[id]`
- `/api/inventory/lots`

#### Cadastros (28)
- `/api/customers`, `/api/customers/[id]`, `/api/customers/[id]/receivables`, `/api/customers/{export,filters,import,template}`
- `/api/products`, `/api/products/[id]`, `/api/products/{export,filters,import,template,print,search,search-by-barcode}`, `/api/products/[id]/barcodes`, `/api/products/[id]/barcodes/[barcodeId]`, `/api/products/[id]/barcodes/generate-all`
- `/api/suppliers`, `/api/suppliers/[id]`, `/api/suppliers/{export,filters,import,template}`
- `/api/categories`, `/api/brands`, `/api/laboratories`, `/api/laboratories/[id]`, `/api/laboratories/[id]/service-orders`, `/api/lens-treatments`, `/api/lens-treatments/[id]`
- `/api/users`, `/api/users/[id]`, `/api/users/[id]/{permissions,permissions/reset,profile}`, `/api/users/sellers`
- `/api/branches`, `/api/company`, `/api/company/{logo,payment-methods,settings}`

#### Permissões (3)
- `/api/permissions`, `/api/permissions/by-module`, `/api/permissions/seed`

#### Dashboard / Métricas (4)
- `/api/dashboard/{metrics,payment-distribution,sales-last-7-days,top-products}`

#### Relatórios (24)
- `/api/reports/{branch-comparison,card-settlement,category-distribution,commissions,customers,dashboard,payment-methods,products,sales-evolution,summary,team-performance,temporal,top-products}`
- `/api/reports/products/top-sellers`
- `/api/reports/sales/consolidated`
- `/api/reports/financial/{accounts-payable,accounts-receivable,cash-history,dre}`
- `/api/reports/optical`, `/api/reports/optical/labs`
- `/api/reports/stock/{no-movement,position}`

#### CRM / Lembretes / Metas (15)
- `/api/crm/{contacts,goals,settings}`, `/api/crm/reminders`, `/api/crm/reminders/counts`, `/api/crm/reports`, `/api/crm/templates`, `/api/crm/templates/[segment]/message`
- `/api/reminders`, `/api/reminders/[id]`, `/api/reminders/{config,contacts,summary}`
- `/api/goals`, `/api/goals/{commissions,config,dashboard,monthly-summary,sellers,sellers-ranking}`, `/api/goals/commissions/[id]`

#### Settings / Onboarding / Plan (8)
- `/api/settings`, `/api/settings/{reset-message,rules}`, `/api/settings/rules/[key]`, `/api/settings/rules/restore-defaults`
- `/api/onboarding`, `/api/plan-features`
- `/api/data-management/{count,delete}`, `/api/data-management/import/{customers,products}`

#### Misc (7)
- `/api/search`, `/api/barcodes/generate-image`
- `/api/ocr/prescription` (Anthropic SDK?)
- `/api/upload/prescription-image`
- `/api/product-campaigns`, `/api/product-campaigns/[id]`, `/api/product-campaigns/[id]/{activate,pause,reconcile,report,simulate}`

#### Públicas (3)
- `/api/public/contact`, `/api/public/plans`, `/api/public/register`

## 4. 🚨 Pages SEM proteção de permissão (mas DENTRO de `(dashboard)`)

Estas pages **não têm `<ProtectedRoute>`**. Estão protegidas apenas pelo `auth()` do layout (qualquer usuário logado entra). Não há filtragem por role/permissão na própria página.

| Page | Risco | Classe |
|---|---|---|
| `/dashboard` (root) | Dashboard exibe métricas — pode vazar info se role muito restrita não tem `reports.view` | 🟡 SUSPEITA |
| `/dashboard/onboarding` | Setup wizard — talvez intencional (todo usuário precisa completar) | 🔵 PROVÁVEL OK |
| `/dashboard/diagnostico-caixa` | Endpoint diagnóstico — qualquer logado acessa | 🟠 RISCO PROVÁVEL |
| `/dashboard/caixa` | Caixa do dia / abertura | 🔴 CONFIRMADO falta `cash_shift.view`/`cash_shift.manage` |
| `/dashboard/caixa/historico` | Histórico de caixas | 🔴 CONFIRMADO |
| `/dashboard/caixa/[id]/relatorio` | Relatório de caixa específico | 🔴 CONFIRMADO |
| `/dashboard/vendas/[id]/detalhes` | Detalhe de venda — possíveis ações (devolução, edição) | 🟠 (aplica `usePermissions` no body, mas a página em si entra) |
| `/dashboard/ordens-servico` | Lista de OS | 🔴 CONFIRMADO falta `service_orders.view` |
| `/dashboard/ordens-servico/nova` | Criação de OS — importa `ProtectedRoute` mas não usa | 🔴 CONFIRMADO |
| `/dashboard/ordens-servico/[id]/detalhes` | … | 🔴 CONFIRMADO |
| `/dashboard/ordens-servico/[id]/editar` | … | 🔴 CONFIRMADO |
| `/dashboard/ordens-servico/[id]/imprimir` | … | 🔴 CONFIRMADO |
| `/dashboard/relatorios` | Índice de relatórios — pode vazar links | 🟡 (provavelmente OK pois sub-páginas validam) |

## 5. 🚨 Permissões aparentemente "erradas" (intent vs. uso)

A string usada como permissão na página parece **mais permissiva do que deveria**, ou nominalmente errada:

| Page | Permissão usada | Permissão esperada | Classe |
|---|---|---|---|
| `/dashboard/clientes` (lista) | `customers.create` | `customers.view` | 🟠 |
| `/dashboard/produtos` (lista) | `products.create` | `products.view` | 🟠 |
| `/dashboard/funcionarios` | `users.create` | `users.view` | 🟠 |
| `/dashboard/usuarios` | `users.create` | `users.view` | 🟠 |
| `/dashboard/orcamentos` (lista) | `quotes.create` | `quotes.view` | 🟠 |
| `/dashboard/estoque` (lista) | `stock.adjust` | `stock.view` | 🟠 |
| `/dashboard/financeiro/lotes-estoque` | `financial.view` | `stock.view` (ou similar) | 🟡 |

> Efeito prático: usuário com permissão de "criar" pode listar, mas usuário com permissão **só de "view"** pode ser indevidamente bloqueado da listagem. Inverso: usuário com `customers.create` mas SEM `customers.view` consegue acessar lista — possivelmente um bug. Ver detalhes no relatório 05.

## 6. Rotas redirecionadas / removidas

| Origem | Destino | Tipo | Fonte |
|---|---|---|---|
| `/dashboard/vendas/nova` | `/dashboard/pdv` | redirect 308 (permanent) | `next.config.ts:32-37` |
| `/login` (logado) | `/dashboard` | redirect 302 | `src/auth.config.ts:58-60` |
| `/dashboard/configuracoes/permissoes` (não-ADMIN) | `/dashboard` | redirect 302 | `src/auth.config.ts:63-65` |

## 7. Observações / lacunas identificadas

| # | Achado | Classe | Onde |
|---|---|---|---|
| B1 | 13 pages dentro de `(dashboard)` sem `ProtectedRoute` | 🔴/🟠 | ver tabela §4 |
| B2 | 7 pages com permissão semanticamente errada (create no lugar de view) | 🟠 | ver §5 |
| B3 | `/dashboard/ordens-servico/nova` importa `ProtectedRoute` mas não envolve a árvore | 🔴 | `ordens-servico/nova/page.tsx` |
| B4 | `/api/debug-auth` existe — INCERTO se é público em produção | 🟡 | `src/app/api/debug-auth/` |
| B5 | `/api/cash/debug` existe — INCERTO se é público em produção | 🟡 | `src/app/api/cash/debug/` |
| B6 | `/dashboard/diagnostico-caixa` sem permissão | 🟠 | `dashboard/diagnostico-caixa/page.tsx` |
| B7 | `/api/admin/seed` existe — POTENCIAL **destrutivo** se acessível | 🟠 | `src/app/api/admin/seed/route.ts` (verificar no rel. 03) |
| B8 | `/api/permissions/seed` — idem | 🟠 | `src/app/api/permissions/seed/route.ts` |

> Detalhes em `14_inconsistencias_e_pontos_de_atencao.md`.
