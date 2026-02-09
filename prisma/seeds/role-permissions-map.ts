/**
 * Mapeamento de Permissões Padrão por Role
 *
 * Define quais permissões cada cargo tem por padrão
 */

export const ROLE_PERMISSIONS_MAP: Record<string, string[]> = {
  // ===================================================================
  // ADMIN - Acesso total a tudo
  // ===================================================================
  ADMIN: [
    // Dashboard
    "dashboard.view",

    // Vendas - TODAS
    "sales.access",
    "sales.create",
    "sales.view_own",
    "sales.view_all",
    "sales.edit",
    "sales.cancel",
    "sales.reactivate",
    "sales.edit_seller",

    // Orçamentos - TODOS
    "quotes.access",
    "quotes.create",
    "quotes.view_own",
    "quotes.view_all",
    "quotes.edit",
    "quotes.delete",
    "quotes.convert",

    // OS - TODAS
    "service_orders.access",
    "service_orders.create",
    "service_orders.view_own",
    "service_orders.view_all",
    "service_orders.edit_own",
    "service_orders.edit_all",
    "service_orders.delete",
    "service_orders.change_status",

    // Caixa - TUDO
    "cash.access",
    "cash.view_current",
    "cash.open",
    "cash.close",
    "cash.movements_create",
    "cash.movements_view",

    // Financeiro - TUDO
    "receivables.access",
    "receivables.view",
    "receivables.create",
    "receivables.edit",
    "receivables.delete",
    "payables.access",
    "payables.view",
    "payables.create",
    "payables.edit",
    "payables.delete",

    // Produtos - TUDO
    "products.access",
    "products.view",
    "products.create",
    "products.edit",
    "products.delete",
    "products.export",
    "products.import",
    "products.barcodes",

    // Estoque - TUDO
    "stock.access",
    "stock.view_position",
    "stock.movements_view",
    "stock.movements_create",
    "stock.transfer",
    "stock.adjustments_view",
    "stock.adjustments_create",
    "stock.adjustments_approve",

    // Clientes - TUDO
    "customers.access",
    "customers.view",
    "customers.create",
    "customers.edit",
    "customers.delete",
    "customers.export",
    "customers.import",

    // Fornecedores - TUDO
    "suppliers.access",
    "suppliers.view",
    "suppliers.create",
    "suppliers.edit",
    "suppliers.delete",
    "suppliers.export",
    "suppliers.import",

    // Usuários - TUDO
    "users.access",
    "users.view",
    "users.create",
    "users.edit",
    "users.delete",
    "users.permissions",

    // Relatórios - TODOS
    "reports.access",
    "reports.sales_consolidated",
    "reports.products_top_sellers",
    "reports.products_no_movement",
    "reports.stock_position",
    "reports.commissions_own",
    "reports.commissions_all",
    "reports.cash_history",
    "reports.receivables",
    "reports.payables",
    "reports.dre",

    // Configurações - TODAS
    "settings.access",
    "settings.rules_view",
    "settings.rules_edit",
    "settings.branches",

    // Metas - TODAS
    "goals.access",
    "goals.view_own",
    "goals.view_all",
  ],

  // ===================================================================
  // GERENTE - Quase tudo, exceto algumas configurações críticas
  // ===================================================================
  GERENTE: [
    // Dashboard
    "dashboard.view",

    // Vendas - TODAS
    "sales.access",
    "sales.create",
    "sales.view_own",
    "sales.view_all",
    "sales.edit",
    "sales.cancel",
    "sales.reactivate",
    "sales.edit_seller",

    // Orçamentos - TODOS
    "quotes.access",
    "quotes.create",
    "quotes.view_own",
    "quotes.view_all",
    "quotes.edit",
    "quotes.delete",
    "quotes.convert",

    // OS - TODAS
    "service_orders.access",
    "service_orders.create",
    "service_orders.view_own",
    "service_orders.view_all",
    "service_orders.edit_own",
    "service_orders.edit_all",
    "service_orders.delete",
    "service_orders.change_status",

    // Caixa - TUDO
    "cash.access",
    "cash.view_current",
    "cash.open",
    "cash.close",
    "cash.movements_create",
    "cash.movements_view",

    // Financeiro - TUDO
    "receivables.access",
    "receivables.view",
    "receivables.create",
    "receivables.edit",
    "receivables.delete",
    "payables.access",
    "payables.view",
    "payables.create",
    "payables.edit",
    "payables.delete",

    // Produtos - TUDO
    "products.access",
    "products.view",
    "products.create",
    "products.edit",
    "products.delete",
    "products.export",
    "products.import",
    "products.barcodes",

    // Estoque - TUDO
    "stock.access",
    "stock.view_position",
    "stock.movements_view",
    "stock.movements_create",
    "stock.transfer",
    "stock.adjustments_view",
    "stock.adjustments_create",
    "stock.adjustments_approve",

    // Clientes - TUDO
    "customers.access",
    "customers.view",
    "customers.create",
    "customers.edit",
    "customers.delete",
    "customers.export",
    "customers.import",

    // Fornecedores - TUDO
    "suppliers.access",
    "suppliers.view",
    "suppliers.create",
    "suppliers.edit",
    "suppliers.delete",
    "suppliers.export",
    "suppliers.import",

    // Usuários - apenas visualizar
    "users.access",
    "users.view",

    // Relatórios - TODOS
    "reports.access",
    "reports.sales_consolidated",
    "reports.products_top_sellers",
    "reports.products_no_movement",
    "reports.stock_position",
    "reports.commissions_own",
    "reports.commissions_all",
    "reports.cash_history",
    "reports.receivables",
    "reports.payables",
    "reports.dre",

    // Configurações - apenas visualizar
    "settings.access",
    "settings.rules_view",

    // Metas - TODAS
    "goals.access",
    "goals.view_own",
    "goals.view_all",
  ],

  // ===================================================================
  // VENDEDOR - Foco em vendas e clientes
  // ===================================================================
  VENDEDOR: [
    // Dashboard
    "dashboard.view",

    // Vendas - apenas suas
    "sales.access",
    "sales.create",
    "sales.view_own",

    // Orçamentos - apenas seus
    "quotes.access",
    "quotes.create",
    "quotes.view_own",
    "quotes.edit",
    "quotes.convert",

    // OS - apenas suas
    "service_orders.access",
    "service_orders.create",
    "service_orders.view_own",
    "service_orders.edit_own",

    // Produtos - apenas consulta
    "products.access",
    "products.view",

    // Clientes
    "customers.access",
    "customers.view",
    "customers.create",
    "customers.edit",

    // Relatórios - apenas próprios
    "reports.access",
    "reports.commissions_own",
    "goals.access",
    "goals.view_own",
  ],

  // ===================================================================
  // CAIXA - Foco em operações de caixa e financeiro
  // ===================================================================
  CAIXA: [
    // Dashboard
    "dashboard.view",

    // Vendas - consulta geral
    "sales.access",
    "sales.view_all",

    // Caixa - TUDO
    "cash.access",
    "cash.view_current",
    "cash.open",
    "cash.close",
    "cash.movements_create",
    "cash.movements_view",

    // Financeiro - recebimentos
    "receivables.access",
    "receivables.view",

    // Produtos - apenas consulta
    "products.access",
    "products.view",

    // Clientes - consulta e criar
    "customers.access",
    "customers.view",
    "customers.create",
  ],

  // ===================================================================
  // ATENDENTE - Foco em atendimento e OS
  // ===================================================================
  ATENDENTE: [
    // Dashboard
    "dashboard.view",

    // OS
    "service_orders.access",
    "service_orders.create",
    "service_orders.view_own",
    "service_orders.view_all",
    "service_orders.edit_own",
    "service_orders.change_status",

    // Orçamentos
    "quotes.access",
    "quotes.create",
    "quotes.view_own",
    "quotes.edit",

    // Clientes
    "customers.access",
    "customers.view",
    "customers.create",
    "customers.edit",

    // Produtos - apenas consulta
    "products.access",
    "products.view",
  ],
};
