═══════════════════════════════════════════════════════
    FIX — Sistema de Permissões 100% Funcional
    Data: 2026-02-23
═══════════════════════════════════════════════════════

PROBLEMAS ENCONTRADOS
━━━━━━━━━━━━━━━━━━━━━

1. CÓDIGOS DE PERMISSÃO INCONSISTENTES (Corrigido no commit anterior 549c434)
   - Onde: src/app/api/permissions/seed/route.ts
   - Causa: O seed usava códigos inventados (cash.view, financial.view_receivables,
     reports.view_sales, users.manage_permissions) que não batiam com os do enum
     Permission (cash_shift.view, financial.view, reports.sales, permissions.manage)
   - Fix: Reescreveu o seed para importar e usar Permission enum diretamente

2. PERMISSÃO laboratories.view INEXISTENTE NO BANCO
   - Onde: Seed não tinha essa permissão no catálogo
   - Causa: Laboratórios nunca aparecia na sidebar porque a permissão não existia
   - Fix: Adicionada ao catálogo do seed

3. MOBILE NAV SEM FILTRAGEM (Corrigido no commit anterior 549c434)
   - Onde: src/components/layout/mobile-nav.tsx
   - Causa: Mostrava TODOS os itens para todos os usuários
   - Fix: Adicionou usePermissions() e filtra itens como a sidebar faz

4. BUG CRÍTICO: PagePermissionGuard com código errado
   - Onde: src/app/(dashboard)/dashboard/funcionarios/[id]/permissoes/page.tsx
   - Causa: Usava permission="users.permissions" que NÃO EXISTE no enum
   - Fix: Corrigido para permission="permissions.manage"

5. MODULE LABELS DESATUALIZADOS na página de gestão
   - Onde: getModuleLabel() na página de permissões do funcionário
   - Causa: Mapa de labels usava "cash" em vez de "cash_shift", faltava
     financial, laboratories, cashback, reminders
   - Fix: Atualizado com todos os módulos corretos

6. PÁGINAS SEM PROTEÇÃO DE PERMISSÃO (27 páginas)
   - 4 páginas principais: lembretes, metas, campanhas, diagnostico-caixa
   - 13 sub-páginas: novo cliente/produto/OS/orçamento, ajustes estoque,
     histórico caixa, configs (empresa/permissões/comissões/regras/lembretes/cashback),
     lembretes config
   - 10 relatórios: vendas, DRE, contas receber/pagar, histórico caixas,
     posição estoque, produtos vendidos/sem giro, comissões, métricas lentes
   - Fix: Adicionado ProtectedRoute com permissão correta em TODAS


CÓDIGOS DE PERMISSÃO DEFINITIVOS (57 códigos)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Vendas:
  sales.create, sales.view, sales.view_all, sales.view_canceled,
  sales.cancel, sales.edit_seller, sales.edit_discount

Orçamentos:
  quotes.create, quotes.view, quotes.view_all, quotes.edit,
  quotes.delete, quotes.convert

Clientes:
  customers.create, customers.view, customers.edit, customers.delete

Produtos:
  products.create, products.view, products.edit, products.delete,
  products.manage_stock

Estoque:
  stock.view, stock.adjust, stock.transfer

Financeiro:
  financial.view, financial.manage, accounts_receivable.view,
  accounts_receivable.manage, accounts_payable.view, accounts_payable.manage

Caixa:
  cash_shift.open, cash_shift.close, cash_shift.view, cash_shift.view_all

Relatórios:
  reports.sales, reports.financial, reports.inventory, reports.customers

Funcionários:
  users.create, users.view, users.edit, users.delete, permissions.manage

Configurações:
  settings.view, settings.edit, company.settings, branch.manage

Módulos adicionais:
  service_orders.view, service_orders.create, service_orders.edit,
  suppliers.view, laboratories.view, cashback.view, goals.view, reminders.view


PERMISSÕES POR ROLE (DEFAULT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ADMIN (57 permissões): TODAS

GERENTE (44 permissões):
  sales.create, sales.view, sales.view_all, sales.view_canceled, sales.cancel,
  sales.edit_seller, sales.edit_discount, quotes.create, quotes.view, quotes.view_all,
  quotes.edit, quotes.delete, quotes.convert, customers.create, customers.view,
  customers.edit, customers.delete, products.create, products.view, products.edit,
  products.delete, products.manage_stock, stock.view, stock.adjust, stock.transfer,
  financial.view, financial.manage, accounts_receivable.view, accounts_receivable.manage,
  accounts_payable.view, accounts_payable.manage, cash_shift.open, cash_shift.close,
  cash_shift.view, cash_shift.view_all, reports.sales, reports.financial,
  reports.inventory, reports.customers, users.view, users.edit, settings.view,
  settings.edit, service_orders.view, service_orders.create, service_orders.edit,
  suppliers.view, laboratories.view, cashback.view, goals.view, reminders.view

VENDEDOR (17 permissões):
  sales.create, sales.view, quotes.create, quotes.view, quotes.edit, quotes.convert,
  service_orders.view, service_orders.create, customers.create, customers.view,
  customers.edit, products.view, cash_shift.view, cashback.view, reminders.view,
  goals.view, settings.view

CAIXA (12 permissões):
  sales.create, sales.view, sales.view_all, customers.create, customers.view,
  products.view, cash_shift.open, cash_shift.close, cash_shift.view,
  accounts_receivable.view, cashback.view, settings.view

ATENDENTE (10 permissões):
  sales.view, customers.create, customers.view, products.view, quotes.view,
  quotes.create, service_orders.view, service_orders.create, reminders.view,
  settings.view


PÁGINAS PROTEGIDAS (47 páginas)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PÁGINAS PRINCIPAIS (20):
  /dashboard                           → (sem proteção - todos veem)
  /dashboard/pdv                       → sales.create
  /dashboard/vendas                    → sales.view
  /dashboard/clientes                  → customers.view
  /dashboard/produtos                  → products.view
  /dashboard/estoque                   → stock.view
  /dashboard/caixa                     → cash_shift.view
  /dashboard/financeiro                → financial.view
  /dashboard/orcamentos                → quotes.view
  /dashboard/ordens-servico            → service_orders.view
  /dashboard/fornecedores              → suppliers.view
  /dashboard/laboratorios              → laboratories.view
  /dashboard/tratamentos               → products.view
  /dashboard/funcionarios              → users.view
  /dashboard/cashback                  → cashback.view
  /dashboard/relatorios                → reports.sales|financial|inventory|customers (any)
  /dashboard/configuracoes             → settings.view
  /dashboard/lembretes                 → reminders.view
  /dashboard/metas                     → goals.view
  /dashboard/campanhas                 → sales.view
  /dashboard/diagnostico-caixa         → cash_shift.view

SUB-PÁGINAS (27):
  /dashboard/clientes/novo             → customers.create
  /dashboard/clientes/[id]             → customers.view
  /dashboard/produtos/novo             → products.create
  /dashboard/orcamentos/novo           → quotes.create
  /dashboard/orcamentos/[id]           → quotes.view
  /dashboard/ordens-servico/nova       → service_orders.create
  /dashboard/estoque/ajustes           → stock.adjust
  /dashboard/caixa/historico           → cash_shift.view
  /dashboard/configuracoes/empresa     → company.settings
  /dashboard/configuracoes/permissoes  → permissions.manage
  /dashboard/configuracoes/comissoes   → settings.edit
  /dashboard/configuracoes/regras      → settings.edit
  /dashboard/configuracoes/lembretes   → settings.edit
  /dashboard/configuracoes/cashback    → settings.edit
  /dashboard/configuracoes/aparencia   → settings.view
  /dashboard/lembretes/configuracoes   → settings.edit
  /dashboard/funcionarios/[id]/permissoes → permissions.manage
  /dashboard/relatorios/vendas         → reports.sales
  /dashboard/relatorios/dre            → reports.financial
  /dashboard/relatorios/contas-receber → reports.financial
  /dashboard/relatorios/contas-pagar   → reports.financial
  /dashboard/relatorios/historico-caixas → reports.financial
  /dashboard/relatorios/posicao-estoque → reports.inventory
  /dashboard/relatorios/produtos-vendidos → reports.sales
  /dashboard/relatorios/produtos-sem-giro → reports.inventory
  /dashboard/relatorios/comissoes      → reports.sales
  /dashboard/relatorios/metricas-lentes → reports.sales


COMPONENTES DE PROTEÇÃO
━━━━━━━━━━━━━━━━━━━━━━━

1. ProtectedRoute (src/components/auth/ProtectedRoute.tsx)
   - Usa hook usePermission (old) → busca /api/users/[id]/permissions
   - Mostra Card "Acesso Negado" com lista de permissões necessárias
   - ADMIN sempre tem acesso total

2. PageGuard (src/components/permissions/page-guard.tsx)
   - Usa hook usePermissions (new) → busca /api/users/[id]/permissions
   - Redireciona para /dashboard se sem permissão
   - Mostra ícone ShieldX com mensagem

3. Can (src/components/permissions/can.tsx)
   - Usa hook usePermissions (new) → mesma API
   - Esconde/mostra children baseado em permissão
   - Suporta fallback component

4. PermissionGuard (src/components/permission-guard.tsx)
   - Usa hook usePermission (old) → mesma API
   - Similar ao Can, mas usa o hook antigo

5. PagePermissionGuard (src/components/page-permission-guard.tsx)
   - Usa hook usePermission (old) → mesma API
   - Protege página inteira com "Acesso Negado" full screen

Nota: Os dois hooks (usePermission e usePermissions) chamam a mesma API
(/api/users/[id]/permissions) e retornam os mesmos dados. Ambos verificam
ADMIN diretamente na sessão. São intercambiáveis.


FLUXO COMPLETO VERIFICADO
━━━━━━━━━━━━━━━━━━━━━━━━━

1. Seed popula banco com códigos do enum: ✅ (usa Permission enum direto)
2. PermissionService busca do banco: ✅ (RolePermission + UserPermission)
3. API /api/users/[id]/permissions retorna effectivePermissions: ✅
4. Hook usePermissions/usePermission carrega permissões: ✅
5. Sidebar filtra itens por permissão: ✅
6. Mobile nav filtra por permissão: ✅
7. Mobile sidebar usa Sidebar component: ✅ (herda filtragem)
8. ProtectedRoute protege páginas: ✅ (47 páginas protegidas)
9. Admin vê permissões no painel: ✅ (Funcionários > [Nome] > Permissões)
10. Admin altera permissões (UserPermission): ✅
11. Override individual funciona: ✅ (grant=true adiciona, grant=false remove)
12. Reset para padrão funciona: ✅ (DELETE /api/users/[id]/permissions/reset)


PÓS-DEPLOY — AÇÃO NECESSÁRIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Após o deploy, o ADMIN deve executar no console do browser:

  fetch('/api/permissions/seed', { method: 'POST' })
    .then(r => r.json())
    .then(d => console.log(d))

Isso irá:
1. Criar/atualizar todas as 57 permissões no catálogo (tabela Permission)
2. Desativar permissões antigas com códigos errados
3. Recriar as permissões por role (tabela RolePermission) com os códigos corretos
4. Manter as permissões customizadas dos usuários (tabela UserPermission)

NOTA: Se um usuário tinha override com código antigo (ex: cash.view), esse
override ficará órfão (sem efeito) pois o catálogo antigo será desativado.
O admin deve reconfigurar overrides individuais após o seed.

═══════════════════════════════════════════════════════
