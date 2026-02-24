/**
 * Sistema de Permissões por Cargo
 *
 * Define quais ações cada cargo pode realizar no sistema
 */

export enum Permission {
  // Vendas
  SALES_CREATE = "sales.create",
  SALES_VIEW = "sales.view",
  SALES_VIEW_ALL = "sales.view_all", // Ver vendas de outros vendedores
  SALES_VIEW_CANCELED = "sales.view_canceled",
  SALES_CANCEL = "sales.cancel",
  SALES_EDIT_SELLER = "sales.edit_seller",
  SALES_EDIT_DISCOUNT = "sales.edit_discount",

  // Orçamentos
  QUOTES_CREATE = "quotes.create",
  QUOTES_VIEW = "quotes.view",
  QUOTES_VIEW_ALL = "quotes.view_all",
  QUOTES_EDIT = "quotes.edit",
  QUOTES_DELETE = "quotes.delete",
  QUOTES_CONVERT = "quotes.convert",

  // Clientes
  CUSTOMERS_CREATE = "customers.create",
  CUSTOMERS_VIEW = "customers.view",
  CUSTOMERS_EDIT = "customers.edit",
  CUSTOMERS_DELETE = "customers.delete",

  // Produtos
  PRODUCTS_CREATE = "products.create",
  PRODUCTS_VIEW = "products.view",
  PRODUCTS_EDIT = "products.edit",
  PRODUCTS_DELETE = "products.delete",
  PRODUCTS_MANAGE_STOCK = "products.manage_stock",

  // Estoque
  STOCK_VIEW = "stock.view",
  STOCK_ADJUST = "stock.adjust",
  STOCK_TRANSFER = "stock.transfer",

  // Financeiro
  FINANCIAL_VIEW = "financial.view",
  FINANCIAL_MANAGE = "financial.manage",
  ACCOUNTS_RECEIVABLE_VIEW = "accounts_receivable.view",
  ACCOUNTS_RECEIVABLE_MANAGE = "accounts_receivable.manage",
  ACCOUNTS_PAYABLE_VIEW = "accounts_payable.view",
  ACCOUNTS_PAYABLE_MANAGE = "accounts_payable.manage",

  // Caixa
  CASH_SHIFT_OPEN = "cash_shift.open",
  CASH_SHIFT_CLOSE = "cash_shift.close",
  CASH_SHIFT_VIEW = "cash_shift.view",
  CASH_SHIFT_VIEW_ALL = "cash_shift.view_all",

  // Relatórios
  REPORTS_SALES = "reports.sales",
  REPORTS_FINANCIAL = "reports.financial",
  REPORTS_INVENTORY = "reports.inventory",
  REPORTS_CUSTOMERS = "reports.customers",

  // Usuários e Permissões
  USERS_CREATE = "users.create",
  USERS_VIEW = "users.view",
  USERS_EDIT = "users.edit",
  USERS_DELETE = "users.delete",
  PERMISSIONS_MANAGE = "permissions.manage",

  // Configurações
  SETTINGS_VIEW = "settings.view",
  SETTINGS_EDIT = "settings.edit",
  COMPANY_SETTINGS = "company.settings",
  BRANCH_MANAGE = "branch.manage",

  // Módulos adicionais
  SERVICE_ORDERS_VIEW = "service_orders.view",
  SERVICE_ORDERS_CREATE = "service_orders.create",
  SERVICE_ORDERS_EDIT = "service_orders.edit",
  SUPPLIERS_VIEW = "suppliers.view",
  SUPPLIERS_MANAGE = "suppliers.manage",
  LABORATORIES_VIEW = "laboratories.view",
  LABORATORIES_MANAGE = "laboratories.manage",
  CASHBACK_VIEW = "cashback.view",
  CASHBACK_MANAGE = "cashback.manage",
  GOALS_VIEW = "goals.view",
  GOALS_MANAGE = "goals.manage",
  CAMPAIGNS_VIEW = "campaigns.view",
  CAMPAIGNS_MANAGE = "campaigns.manage",
  REMINDERS_VIEW = "reminders.view",
}

export type UserRole = "ADMIN" | "MANAGER" | "SELLER" | "CASHIER" | "STOCK_MANAGER";

/**
 * Mapa de permissões por cargo
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  // Administrador - Acesso total
  ADMIN: Object.values(Permission),

  // Gerente - Quase todos os acessos, exceto configurações da empresa
  MANAGER: [
    // Vendas
    Permission.SALES_CREATE,
    Permission.SALES_VIEW,
    Permission.SALES_VIEW_ALL,
    Permission.SALES_VIEW_CANCELED,
    Permission.SALES_CANCEL,
    Permission.SALES_EDIT_SELLER,
    Permission.SALES_EDIT_DISCOUNT,

    // Orçamentos
    Permission.QUOTES_CREATE,
    Permission.QUOTES_VIEW,
    Permission.QUOTES_VIEW_ALL,
    Permission.QUOTES_EDIT,
    Permission.QUOTES_DELETE,
    Permission.QUOTES_CONVERT,

    // Clientes
    Permission.CUSTOMERS_CREATE,
    Permission.CUSTOMERS_VIEW,
    Permission.CUSTOMERS_EDIT,
    Permission.CUSTOMERS_DELETE,

    // Produtos
    Permission.PRODUCTS_CREATE,
    Permission.PRODUCTS_VIEW,
    Permission.PRODUCTS_EDIT,
    Permission.PRODUCTS_DELETE,
    Permission.PRODUCTS_MANAGE_STOCK,

    // Estoque
    Permission.STOCK_VIEW,
    Permission.STOCK_ADJUST,
    Permission.STOCK_TRANSFER,

    // Financeiro
    Permission.FINANCIAL_VIEW,
    Permission.FINANCIAL_MANAGE,
    Permission.ACCOUNTS_RECEIVABLE_VIEW,
    Permission.ACCOUNTS_RECEIVABLE_MANAGE,
    Permission.ACCOUNTS_PAYABLE_VIEW,
    Permission.ACCOUNTS_PAYABLE_MANAGE,

    // Caixa
    Permission.CASH_SHIFT_OPEN,
    Permission.CASH_SHIFT_CLOSE,
    Permission.CASH_SHIFT_VIEW,
    Permission.CASH_SHIFT_VIEW_ALL,

    // Relatórios
    Permission.REPORTS_SALES,
    Permission.REPORTS_FINANCIAL,
    Permission.REPORTS_INVENTORY,
    Permission.REPORTS_CUSTOMERS,

    // Usuários (exceto criar/deletar)
    Permission.USERS_VIEW,
    Permission.USERS_EDIT,

    // Configurações básicas
    Permission.SETTINGS_VIEW,
    Permission.SETTINGS_EDIT,

    // Módulos adicionais
    Permission.SERVICE_ORDERS_VIEW,
    Permission.SERVICE_ORDERS_CREATE,
    Permission.SERVICE_ORDERS_EDIT,
    Permission.SUPPLIERS_VIEW,
    Permission.SUPPLIERS_MANAGE,
    Permission.LABORATORIES_VIEW,
    Permission.LABORATORIES_MANAGE,
    Permission.CASHBACK_VIEW,
    Permission.CASHBACK_MANAGE,
    Permission.GOALS_VIEW,
    Permission.GOALS_MANAGE,
    Permission.CAMPAIGNS_VIEW,
    Permission.CAMPAIGNS_MANAGE,
    Permission.REMINDERS_VIEW,
  ],

  // Vendedor - Foco em vendas e clientes
  SELLER: [
    // Vendas (apenas suas próprias)
    Permission.SALES_CREATE,
    Permission.SALES_VIEW,

    // Orçamentos
    Permission.QUOTES_CREATE,
    Permission.QUOTES_VIEW,
    Permission.QUOTES_EDIT,
    Permission.QUOTES_CONVERT,

    // OS
    Permission.SERVICE_ORDERS_VIEW,
    Permission.SERVICE_ORDERS_CREATE,

    // Clientes
    Permission.CUSTOMERS_CREATE,
    Permission.CUSTOMERS_VIEW,
    Permission.CUSTOMERS_EDIT,

    // Produtos (apenas visualizar)
    Permission.PRODUCTS_VIEW,

    // Caixa (básico)
    Permission.CASH_SHIFT_VIEW,

    // Lembretes
    Permission.REMINDERS_VIEW,

    // Metas (apenas visualizar)
    Permission.GOALS_VIEW,

    // Campanhas (apenas visualizar)
    Permission.CAMPAIGNS_VIEW,

    // Configurações básicas
    Permission.SETTINGS_VIEW,
  ],

  // Caixa - Foco em operações de caixa e vendas
  CASHIER: [
    // Vendas
    Permission.SALES_CREATE,
    Permission.SALES_VIEW,
    Permission.SALES_VIEW_ALL,

    // Clientes (básico)
    Permission.CUSTOMERS_CREATE,
    Permission.CUSTOMERS_VIEW,

    // Produtos (apenas visualizar)
    Permission.PRODUCTS_VIEW,

    // Caixa
    Permission.CASH_SHIFT_OPEN,
    Permission.CASH_SHIFT_CLOSE,
    Permission.CASH_SHIFT_VIEW,

    // Financeiro (apenas visualizar)
    Permission.ACCOUNTS_RECEIVABLE_VIEW,

    // Configurações básicas
    Permission.SETTINGS_VIEW,
  ],

  // Gerente de Estoque - Foco em produtos e estoque
  STOCK_MANAGER: [
    // Produtos
    Permission.PRODUCTS_CREATE,
    Permission.PRODUCTS_VIEW,
    Permission.PRODUCTS_EDIT,
    Permission.PRODUCTS_MANAGE_STOCK,

    // Estoque
    Permission.STOCK_VIEW,
    Permission.STOCK_ADJUST,
    Permission.STOCK_TRANSFER,

    // Relatórios
    Permission.REPORTS_INVENTORY,

    // Vendas (apenas visualizar para controle de estoque)
    Permission.SALES_VIEW,
    Permission.SALES_VIEW_ALL,

    // Fornecedores (para controle de estoque)
    Permission.SUPPLIERS_VIEW,

    // Configurações básicas
    Permission.SETTINGS_VIEW,
  ],
};

/**
 * Verifica se um usuário tem uma permissão específica
 */
export function hasPermission(userRole: UserRole | string, permission: Permission): boolean {
  if (!userRole) return false;

  const permissions = ROLE_PERMISSIONS[userRole as UserRole];
  if (!permissions) return false;

  return permissions.includes(permission);
}

/**
 * Verifica se um usuário tem todas as permissões especificadas
 */
export function hasAllPermissions(userRole: UserRole | string, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(userRole, permission));
}

/**
 * Verifica se um usuário tem pelo menos uma das permissões especificadas
 */
export function hasAnyPermission(userRole: UserRole | string, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(userRole, permission));
}

/**
 * Retorna todas as permissões de um cargo
 */
export function getRolePermissions(role: UserRole | string): Permission[] {
  return ROLE_PERMISSIONS[role as UserRole] || [];
}

/**
 * Labels amigáveis para as permissões
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  // Vendas
  [Permission.SALES_CREATE]: "Criar vendas",
  [Permission.SALES_VIEW]: "Visualizar suas vendas",
  [Permission.SALES_VIEW_ALL]: "Visualizar todas as vendas",
  [Permission.SALES_VIEW_CANCELED]: "Visualizar vendas canceladas",
  [Permission.SALES_CANCEL]: "Cancelar vendas",
  [Permission.SALES_EDIT_SELLER]: "Alterar vendedor da venda",
  [Permission.SALES_EDIT_DISCOUNT]: "Aplicar descontos",

  // Orçamentos
  [Permission.QUOTES_CREATE]: "Criar orçamentos",
  [Permission.QUOTES_VIEW]: "Visualizar orçamentos",
  [Permission.QUOTES_VIEW_ALL]: "Visualizar todos os orçamentos",
  [Permission.QUOTES_EDIT]: "Editar orçamentos",
  [Permission.QUOTES_DELETE]: "Excluir orçamentos",
  [Permission.QUOTES_CONVERT]: "Converter orçamento em venda",

  // Clientes
  [Permission.CUSTOMERS_CREATE]: "Cadastrar clientes",
  [Permission.CUSTOMERS_VIEW]: "Visualizar clientes",
  [Permission.CUSTOMERS_EDIT]: "Editar clientes",
  [Permission.CUSTOMERS_DELETE]: "Excluir clientes",

  // Produtos
  [Permission.PRODUCTS_CREATE]: "Cadastrar produtos",
  [Permission.PRODUCTS_VIEW]: "Visualizar produtos",
  [Permission.PRODUCTS_EDIT]: "Editar produtos",
  [Permission.PRODUCTS_DELETE]: "Excluir produtos",
  [Permission.PRODUCTS_MANAGE_STOCK]: "Gerenciar estoque de produtos",

  // Estoque
  [Permission.STOCK_VIEW]: "Visualizar estoque",
  [Permission.STOCK_ADJUST]: "Ajustar estoque",
  [Permission.STOCK_TRANSFER]: "Transferir entre filiais",

  // Financeiro
  [Permission.FINANCIAL_VIEW]: "Visualizar financeiro",
  [Permission.FINANCIAL_MANAGE]: "Gerenciar financeiro",
  [Permission.ACCOUNTS_RECEIVABLE_VIEW]: "Visualizar contas a receber",
  [Permission.ACCOUNTS_RECEIVABLE_MANAGE]: "Gerenciar contas a receber",
  [Permission.ACCOUNTS_PAYABLE_VIEW]: "Visualizar contas a pagar",
  [Permission.ACCOUNTS_PAYABLE_MANAGE]: "Gerenciar contas a pagar",

  // Caixa
  [Permission.CASH_SHIFT_OPEN]: "Abrir caixa",
  [Permission.CASH_SHIFT_CLOSE]: "Fechar caixa",
  [Permission.CASH_SHIFT_VIEW]: "Visualizar seu caixa",
  [Permission.CASH_SHIFT_VIEW_ALL]: "Visualizar todos os caixas",

  // Relatórios
  [Permission.REPORTS_SALES]: "Relatórios de vendas",
  [Permission.REPORTS_FINANCIAL]: "Relatórios financeiros",
  [Permission.REPORTS_INVENTORY]: "Relatórios de estoque",
  [Permission.REPORTS_CUSTOMERS]: "Relatórios de clientes",

  // Usuários
  [Permission.USERS_CREATE]: "Cadastrar usuários",
  [Permission.USERS_VIEW]: "Visualizar usuários",
  [Permission.USERS_EDIT]: "Editar usuários",
  [Permission.USERS_DELETE]: "Excluir usuários",
  [Permission.PERMISSIONS_MANAGE]: "Gerenciar permissões",

  // Configurações
  [Permission.SETTINGS_VIEW]: "Visualizar configurações",
  [Permission.SETTINGS_EDIT]: "Editar configurações",
  [Permission.COMPANY_SETTINGS]: "Configurações da empresa",
  [Permission.BRANCH_MANAGE]: "Gerenciar filiais",

  // Módulos adicionais
  [Permission.SERVICE_ORDERS_VIEW]: "Visualizar ordens de serviço",
  [Permission.SERVICE_ORDERS_CREATE]: "Criar ordens de serviço",
  [Permission.SERVICE_ORDERS_EDIT]: "Editar ordens de serviço",
  [Permission.SUPPLIERS_VIEW]: "Visualizar fornecedores",
  [Permission.SUPPLIERS_MANAGE]: "Gerenciar fornecedores",
  [Permission.LABORATORIES_VIEW]: "Visualizar laboratórios",
  [Permission.LABORATORIES_MANAGE]: "Gerenciar laboratórios",
  [Permission.CASHBACK_VIEW]: "Visualizar cashback",
  [Permission.CASHBACK_MANAGE]: "Gerenciar cashback",
  [Permission.GOALS_VIEW]: "Visualizar metas",
  [Permission.GOALS_MANAGE]: "Gerenciar metas e comissões",
  [Permission.CAMPAIGNS_VIEW]: "Visualizar campanhas",
  [Permission.CAMPAIGNS_MANAGE]: "Gerenciar campanhas",
  [Permission.REMINDERS_VIEW]: "Visualizar lembretes",
};

/**
 * Labels amigáveis para os cargos
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  SELLER: "Vendedor",
  CASHIER: "Caixa",
  STOCK_MANAGER: "Gerente de Estoque",
};
