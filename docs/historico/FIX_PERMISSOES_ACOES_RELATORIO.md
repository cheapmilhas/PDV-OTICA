═══════════════════════════════════════════════════════
    FIX — Permissões em Nível de AÇÃO (Botões + APIs)
    Data: 2026-02-23
    Commit: 77941a2
═══════════════════════════════════════════════════════

BUG CRÍTICO ENCONTRADO
━━━━━━━━━━━━━━━━━━━━━━

PROBLEMA: `requirePermission()` em `src/lib/auth-permissions.ts` usava
um mapa estático `ROLE_PERMISSIONS` do enum que tinha roles com nomes
ERRADOS (MANAGER, SELLER, CASHIER, STOCK_MANAGER) enquanto o banco usa
(GERENTE, VENDEDOR, CAIXA, ATENDENTE).

RESULTADO: A função NUNCA encontrava permissões para nenhum role (exceto
ADMIN que tem bypass). Além disso, lançava `new Error()` genérico que
resultava em HTTP 500 ao invés de 403.

FIX: Reescreveu `auth-permissions.ts` para:
  1. Usar `PermissionService.userHasPermission()` que consulta o BANCO
     (RolePermission + UserPermission overrides)
  2. Usar `forbiddenError()` que retorna AppError com HTTP 403
  3. Adicionou funções: requireAllPermissions, requireAnyPermission,
     checkPermissionFromDB

ADMIN sempre tem bypass automático (não consulta banco).


FRONTEND — BOTÕES PROTEGIDOS (8 páginas)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Padrão: usa `hasPermission()` do hook `usePermissions()` para
mostrar/esconder botões de ação. Usuário sem permissão não vê o botão.

1. estoque/page.tsx
   - Botões de ajuste de estoque → stock.adjust

2. clientes/page.tsx
   - Botão editar → customers.edit
   - Botão excluir → customers.delete

3. clientes/[id]/page.tsx
   - Botão editar → customers.edit

4. vendas/[id]/detalhes/page.tsx
   - Botão cancelar venda → sales.cancel
   - Botão alterar vendedor → sales.edit_seller

5. caixa/page.tsx
   - Botão abrir caixa → cash_shift.open
   - Botão fechar caixa → cash_shift.close

6. financeiro/page.tsx
   - Botões de contas a pagar → accounts_payable.manage
   - Botões de contas a receber → accounts_receivable.manage

7. funcionarios/page.tsx
   - Botão editar → users.edit
   - Botão excluir → users.delete
   - Botão permissões → permissions.manage


BACKEND — APIs PROTEGIDAS (33 handlers em 27 arquivos)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Padrão: `await requirePermission("code")` no início do handler,
ANTES da lógica de negócio. Lança AppError 403 se sem permissão.

ESTOQUE (4 handlers):
  POST /api/stock-movements              → stock.adjust
  POST /api/stock-movements/transfer     → stock.transfer
  POST /api/stock-adjustments            → stock.adjust
  DELETE /api/stock-adjustments/[id]     → stock.adjust

CLIENTES (4 handlers):
  POST /api/customers                    → customers.create
  PUT /api/customers/[id]               → customers.edit
  DELETE /api/customers/[id]            → customers.delete
  POST /api/customers/import             → customers.create

PRODUTOS (4 handlers):
  POST /api/products                     → products.create
  PUT /api/products/[id]                → products.edit
  DELETE /api/products/[id]             → products.delete
  POST /api/products/import              → products.create

VENDAS (2 handlers):
  POST /api/sales                        → sales.create
  PATCH /api/sales/[id]/seller          → sales.edit_seller

CAIXA (2 handlers):
  POST /api/cash/shift                   → cash_shift.open
  POST /api/cash/shift/close             → cash_shift.close

CONTAS A RECEBER (3 handlers):
  PATCH /api/accounts-receivable         → accounts_receivable.manage
  DELETE /api/accounts-receivable        → accounts_receivable.manage
  POST /api/accounts-receivable/receive-multiple → accounts_receivable.manage

CONTAS A PAGAR (3 handlers):
  POST /api/accounts-payable             → accounts_payable.manage
  PATCH /api/accounts-payable            → accounts_payable.manage
  DELETE /api/accounts-payable           → accounts_payable.manage

ORÇAMENTOS (4 handlers):
  POST /api/quotes                       → quotes.create
  PUT /api/quotes/[id]                  → quotes.edit
  DELETE /api/quotes/[id]               → quotes.delete
  POST /api/quotes/[id]/convert          → quotes.convert

ORDENS DE SERVIÇO (2 handlers):
  POST /api/service-orders               → service_orders.create
  PUT /api/service-orders/[id]          → service_orders.edit

FUNCIONÁRIOS (3 handlers):
  POST /api/users                        → users.create
  PUT /api/users/[id]                   → users.edit
  DELETE /api/users/[id]                → users.delete

CONFIGURAÇÕES (3 handlers):
  PUT /api/settings                      → settings.edit
  PUT /api/company/settings              → company.settings
  POST/DELETE /api/company/logo          → company.settings

FORNECEDORES (3 handlers):
  POST /api/suppliers                    → suppliers.view
  PUT /api/suppliers/[id]               → suppliers.view
  DELETE /api/suppliers/[id]            → suppliers.view

METAS (2 handlers):
  POST /api/goals                        → goals.view
  PUT /api/goals/config                  → settings.edit


APIs JÁ PROTEGIDAS (não alteradas):
  DELETE /api/sales/[id]                → sales.cancel (já tinha)
  POST /api/sales/[id]/reactivate       → sales.cancel (já tinha)
  POST /api/stock-adjustments/[id]/approve → stock.adjust (já tinha)
  POST /api/stock-adjustments/[id]/reject  → stock.adjust (já tinha)
  POST /api/settings/rules              → settings.edit (já tinha)
  DELETE /api/settings/rules/[key]      → settings.edit (já tinha)
  POST /api/settings/rules/restore-defaults → settings.edit (já tinha)


VERIFICAÇÃO
━━━━━━━━━━━

✅ TypeScript: npx tsc --noEmit — sem erros
✅ Build: npm run build — sucesso
✅ Schema: prisma/schema.prisma inalterado
✅ Push: origin/main atualizado (77941a2)


PÓS-DEPLOY — AÇÃO NECESSÁRIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

O ADMIN deve executar o seed no console do browser:

  fetch('/api/permissions/seed', { method: 'POST' })
    .then(r => r.json())
    .then(d => console.log(d))

Isso garante que o banco tenha todos os 57 códigos de permissão
corretos, alinhados com o que o frontend e as APIs verificam.


RESUMO DE PROTEÇÃO COMPLETA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CAMADA 1 — Sidebar/Nav: Filtra itens por permissão (usePermissions)
CAMADA 2 — Páginas: ProtectedRoute bloqueia acesso (47 páginas)
CAMADA 3 — Botões: hasPermission esconde ações (8 páginas)
CAMADA 4 — APIs: requirePermission retorna 403 (40 handlers)

═══════════════════════════════════════════════════════
