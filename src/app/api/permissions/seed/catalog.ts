import { Permission, PERMISSION_LABELS } from "@/lib/permissions";

/**
 * Catálogo de permissões + grant por role do seed (POST /api/permissions/seed).
 * Módulo PURO (sem next/prisma) para ser testável. A rota importa daqui.
 * Códigos DEVEM bater com o enum Permission (fonte de verdade).
 */

// Catálogo de permissões derivado do enum Permission (fonte de verdade)
export const PERMISSIONS = [
  // VENDAS
  { code: Permission.SALES_CREATE, name: PERMISSION_LABELS[Permission.SALES_CREATE], description: "Permite criar novas vendas no PDV", module: "sales", category: "Vendas", sortOrder: 1 },
  { code: Permission.SALES_VIEW, name: PERMISSION_LABELS[Permission.SALES_VIEW], description: "Permite visualizar a lista de vendas e detalhes", module: "sales", category: "Vendas", sortOrder: 2 },
  { code: Permission.SALES_VIEW_ALL, name: PERMISSION_LABELS[Permission.SALES_VIEW_ALL], description: "Permite visualizar vendas de todos os vendedores", module: "sales", category: "Vendas", sortOrder: 3 },
  { code: Permission.SALES_VIEW_CANCELED, name: PERMISSION_LABELS[Permission.SALES_VIEW_CANCELED], description: "Permite visualizar vendas canceladas", module: "sales", category: "Vendas", sortOrder: 4 },
  { code: Permission.SALES_CANCEL, name: PERMISSION_LABELS[Permission.SALES_CANCEL], description: "Permite cancelar vendas já finalizadas", module: "sales", category: "Vendas", sortOrder: 5 },
  { code: Permission.SALES_REFUND, name: PERMISSION_LABELS[Permission.SALES_REFUND], description: "Permite devolver/estornar vendas finalizadas", module: "sales", category: "Vendas", sortOrder: 6 },
  { code: Permission.SALES_EDIT_SELLER, name: PERMISSION_LABELS[Permission.SALES_EDIT_SELLER], description: "Permite alterar o vendedor de uma venda", module: "sales", category: "Vendas", sortOrder: 7 },
  { code: Permission.SALES_EDIT_DISCOUNT, name: PERMISSION_LABELS[Permission.SALES_EDIT_DISCOUNT], description: "Permite aplicar descontos em vendas", module: "sales", category: "Vendas", sortOrder: 8 },

  // ORÇAMENTOS
  { code: Permission.QUOTES_CREATE, name: PERMISSION_LABELS[Permission.QUOTES_CREATE], description: "Permite criar novos orçamentos", module: "quotes", category: "Orçamentos", sortOrder: 1 },
  { code: Permission.QUOTES_VIEW, name: PERMISSION_LABELS[Permission.QUOTES_VIEW], description: "Permite visualizar a lista de orçamentos", module: "quotes", category: "Orçamentos", sortOrder: 2 },
  { code: Permission.QUOTES_VIEW_ALL, name: PERMISSION_LABELS[Permission.QUOTES_VIEW_ALL], description: "Permite visualizar orçamentos de todos os vendedores", module: "quotes", category: "Orçamentos", sortOrder: 3 },
  { code: Permission.QUOTES_EDIT, name: PERMISSION_LABELS[Permission.QUOTES_EDIT], description: "Permite editar orçamentos existentes", module: "quotes", category: "Orçamentos", sortOrder: 4 },
  { code: Permission.QUOTES_DELETE, name: PERMISSION_LABELS[Permission.QUOTES_DELETE], description: "Permite excluir orçamentos", module: "quotes", category: "Orçamentos", sortOrder: 5 },
  { code: Permission.QUOTES_CONVERT, name: PERMISSION_LABELS[Permission.QUOTES_CONVERT], description: "Permite converter orçamento aprovado em venda", module: "quotes", category: "Orçamentos", sortOrder: 6 },

  // CLIENTES
  { code: Permission.CUSTOMERS_CREATE, name: PERMISSION_LABELS[Permission.CUSTOMERS_CREATE], description: "Permite cadastrar novos clientes", module: "customers", category: "Clientes", sortOrder: 1 },
  { code: Permission.CUSTOMERS_VIEW, name: PERMISSION_LABELS[Permission.CUSTOMERS_VIEW], description: "Permite visualizar a lista de clientes e seus detalhes", module: "customers", category: "Clientes", sortOrder: 2 },
  { code: Permission.CUSTOMERS_EDIT, name: PERMISSION_LABELS[Permission.CUSTOMERS_EDIT], description: "Permite editar dados de clientes existentes", module: "customers", category: "Clientes", sortOrder: 3 },
  { code: Permission.CUSTOMERS_DELETE, name: PERMISSION_LABELS[Permission.CUSTOMERS_DELETE], description: "Permite excluir clientes do sistema", module: "customers", category: "Clientes", sortOrder: 4 },

  // PRODUTOS
  { code: Permission.PRODUCTS_CREATE, name: PERMISSION_LABELS[Permission.PRODUCTS_CREATE], description: "Permite cadastrar novos produtos", module: "products", category: "Produtos", sortOrder: 1 },
  { code: Permission.PRODUCTS_VIEW, name: PERMISSION_LABELS[Permission.PRODUCTS_VIEW], description: "Permite visualizar a lista de produtos e seus detalhes", module: "products", category: "Produtos", sortOrder: 2 },
  { code: Permission.PRODUCTS_EDIT, name: PERMISSION_LABELS[Permission.PRODUCTS_EDIT], description: "Permite editar produtos existentes", module: "products", category: "Produtos", sortOrder: 3 },
  { code: Permission.PRODUCTS_DELETE, name: PERMISSION_LABELS[Permission.PRODUCTS_DELETE], description: "Permite excluir produtos do sistema", module: "products", category: "Produtos", sortOrder: 4 },
  { code: Permission.PRODUCTS_MANAGE_STOCK, name: PERMISSION_LABELS[Permission.PRODUCTS_MANAGE_STOCK], description: "Permite gerenciar estoque diretamente no produto", module: "products", category: "Produtos", sortOrder: 5 },

  // ESTOQUE
  { code: Permission.STOCK_VIEW, name: PERMISSION_LABELS[Permission.STOCK_VIEW], description: "Permite visualizar posição de estoque dos produtos", module: "stock", category: "Estoque", sortOrder: 1 },
  { code: Permission.STOCK_ADJUST, name: PERMISSION_LABELS[Permission.STOCK_ADJUST], description: "Permite criar ajustes de estoque", module: "stock", category: "Estoque", sortOrder: 2 },
  { code: Permission.STOCK_TRANSFER, name: PERMISSION_LABELS[Permission.STOCK_TRANSFER], description: "Permite transferir produtos entre filiais", module: "stock", category: "Estoque", sortOrder: 3 },

  // FINANCEIRO
  { code: Permission.FINANCIAL_VIEW, name: PERMISSION_LABELS[Permission.FINANCIAL_VIEW], description: "Permite visualizar painel financeiro", module: "financial", category: "Financeiro", sortOrder: 1 },
  { code: Permission.FINANCIAL_MANAGE, name: PERMISSION_LABELS[Permission.FINANCIAL_MANAGE], description: "Permite gerenciar operações financeiras", module: "financial", category: "Financeiro", sortOrder: 2 },
  { code: Permission.ACCOUNTS_RECEIVABLE_VIEW, name: PERMISSION_LABELS[Permission.ACCOUNTS_RECEIVABLE_VIEW], description: "Permite visualizar contas a receber", module: "financial", category: "Financeiro", sortOrder: 3 },
  { code: Permission.ACCOUNTS_RECEIVABLE_MANAGE, name: PERMISSION_LABELS[Permission.ACCOUNTS_RECEIVABLE_MANAGE], description: "Permite dar baixa em contas a receber", module: "financial", category: "Financeiro", sortOrder: 4 },
  { code: Permission.ACCOUNTS_PAYABLE_VIEW, name: PERMISSION_LABELS[Permission.ACCOUNTS_PAYABLE_VIEW], description: "Permite visualizar contas a pagar", module: "financial", category: "Financeiro", sortOrder: 5 },
  { code: Permission.ACCOUNTS_PAYABLE_MANAGE, name: PERMISSION_LABELS[Permission.ACCOUNTS_PAYABLE_MANAGE], description: "Permite gerenciar contas a pagar", module: "financial", category: "Financeiro", sortOrder: 6 },

  // CAIXA
  { code: Permission.CASH_SHIFT_OPEN, name: PERMISSION_LABELS[Permission.CASH_SHIFT_OPEN], description: "Permite abrir um novo turno de caixa", module: "cash_shift", category: "Caixa", sortOrder: 1 },
  { code: Permission.CASH_SHIFT_CLOSE, name: PERMISSION_LABELS[Permission.CASH_SHIFT_CLOSE], description: "Permite fechar um turno de caixa", module: "cash_shift", category: "Caixa", sortOrder: 2 },
  { code: Permission.CASH_SHIFT_VIEW, name: PERMISSION_LABELS[Permission.CASH_SHIFT_VIEW], description: "Permite visualizar movimentações e status do caixa", module: "cash_shift", category: "Caixa", sortOrder: 3 },
  { code: Permission.CASH_SHIFT_VIEW_ALL, name: PERMISSION_LABELS[Permission.CASH_SHIFT_VIEW_ALL], description: "Permite visualizar caixas de todos os operadores", module: "cash_shift", category: "Caixa", sortOrder: 4 },

  // RELATÓRIOS
  { code: Permission.REPORTS_SALES, name: PERMISSION_LABELS[Permission.REPORTS_SALES], description: "Permite visualizar relatórios de vendas", module: "reports", category: "Relatórios", sortOrder: 1 },
  { code: Permission.REPORTS_FINANCIAL, name: PERMISSION_LABELS[Permission.REPORTS_FINANCIAL], description: "Permite visualizar relatórios financeiros", module: "reports", category: "Relatórios", sortOrder: 2 },
  { code: Permission.REPORTS_INVENTORY, name: PERMISSION_LABELS[Permission.REPORTS_INVENTORY], description: "Permite visualizar relatórios de estoque", module: "reports", category: "Relatórios", sortOrder: 3 },
  { code: Permission.REPORTS_CUSTOMERS, name: PERMISSION_LABELS[Permission.REPORTS_CUSTOMERS], description: "Permite visualizar relatórios de clientes", module: "reports", category: "Relatórios", sortOrder: 4 },

  // USUÁRIOS E PERMISSÕES
  { code: Permission.USERS_CREATE, name: PERMISSION_LABELS[Permission.USERS_CREATE], description: "Permite cadastrar novos funcionários", module: "users", category: "Funcionários", sortOrder: 1 },
  { code: Permission.USERS_VIEW, name: PERMISSION_LABELS[Permission.USERS_VIEW], description: "Permite visualizar a lista de funcionários", module: "users", category: "Funcionários", sortOrder: 2 },
  { code: Permission.USERS_EDIT, name: PERMISSION_LABELS[Permission.USERS_EDIT], description: "Permite editar dados de funcionários", module: "users", category: "Funcionários", sortOrder: 3 },
  { code: Permission.USERS_DELETE, name: PERMISSION_LABELS[Permission.USERS_DELETE], description: "Permite excluir funcionários do sistema", module: "users", category: "Funcionários", sortOrder: 4 },
  { code: Permission.PERMISSIONS_MANAGE, name: PERMISSION_LABELS[Permission.PERMISSIONS_MANAGE], description: "Permite alterar permissões individuais de funcionários", module: "users", category: "Funcionários", sortOrder: 5 },

  // CONFIGURAÇÕES
  { code: Permission.SETTINGS_VIEW, name: PERMISSION_LABELS[Permission.SETTINGS_VIEW], description: "Permite visualizar configurações do sistema", module: "settings", category: "Configurações", sortOrder: 1 },
  { code: Permission.SETTINGS_EDIT, name: PERMISSION_LABELS[Permission.SETTINGS_EDIT], description: "Permite editar configurações do sistema", module: "settings", category: "Configurações", sortOrder: 2 },
  { code: Permission.COMPANY_SETTINGS, name: PERMISSION_LABELS[Permission.COMPANY_SETTINGS], description: "Permite editar dados e configurações da empresa", module: "settings", category: "Configurações", sortOrder: 3 },
  { code: Permission.BRANCH_MANAGE, name: PERMISSION_LABELS[Permission.BRANCH_MANAGE], description: "Permite gerenciar filiais", module: "settings", category: "Configurações", sortOrder: 4 },

  // MÓDULOS ADICIONAIS
  { code: Permission.SERVICE_ORDERS_VIEW, name: PERMISSION_LABELS[Permission.SERVICE_ORDERS_VIEW], description: "Permite visualizar a lista de ordens de serviço", module: "service_orders", category: "Ordens de Serviço", sortOrder: 1 },
  { code: Permission.SERVICE_ORDERS_CREATE, name: PERMISSION_LABELS[Permission.SERVICE_ORDERS_CREATE], description: "Permite criar novas ordens de serviço", module: "service_orders", category: "Ordens de Serviço", sortOrder: 2 },
  { code: Permission.SERVICE_ORDERS_EDIT, name: PERMISSION_LABELS[Permission.SERVICE_ORDERS_EDIT], description: "Permite editar ordens de serviço existentes", module: "service_orders", category: "Ordens de Serviço", sortOrder: 3 },
  { code: Permission.SUPPLIERS_VIEW, name: PERMISSION_LABELS[Permission.SUPPLIERS_VIEW], description: "Permite visualizar a lista de fornecedores", module: "suppliers", category: "Fornecedores", sortOrder: 1 },
  { code: Permission.SUPPLIERS_MANAGE, name: PERMISSION_LABELS[Permission.SUPPLIERS_MANAGE], description: "Permite criar, editar e excluir fornecedores", module: "suppliers", category: "Fornecedores", sortOrder: 2 },
  { code: Permission.LABORATORIES_VIEW, name: PERMISSION_LABELS[Permission.LABORATORIES_VIEW], description: "Permite visualizar a lista de laboratórios", module: "laboratories", category: "Laboratórios", sortOrder: 1 },
  { code: Permission.LABORATORIES_MANAGE, name: PERMISSION_LABELS[Permission.LABORATORIES_MANAGE], description: "Permite criar, editar e excluir laboratórios", module: "laboratories", category: "Laboratórios", sortOrder: 2 },
  { code: Permission.CASHBACK_VIEW, name: PERMISSION_LABELS[Permission.CASHBACK_VIEW], description: "Permite visualizar saldos e movimentações de cashback", module: "cashback", category: "Cashback", sortOrder: 1 },
  { code: Permission.CASHBACK_MANAGE, name: PERMISSION_LABELS[Permission.CASHBACK_MANAGE], description: "Permite configurar regras e gerenciar cashback", module: "cashback", category: "Cashback", sortOrder: 2 },
  { code: Permission.GOALS_VIEW, name: PERMISSION_LABELS[Permission.GOALS_VIEW], description: "Permite visualizar metas de vendas", module: "goals", category: "Metas", sortOrder: 1 },
  { code: Permission.GOALS_MANAGE, name: PERMISSION_LABELS[Permission.GOALS_MANAGE], description: "Permite definir metas, fechar mês e pagar comissões", module: "goals", category: "Metas", sortOrder: 2 },
  { code: Permission.CAMPAIGNS_VIEW, name: PERMISSION_LABELS[Permission.CAMPAIGNS_VIEW], description: "Permite visualizar campanhas de bonificação", module: "campaigns", category: "Campanhas", sortOrder: 1 },
  { code: Permission.CAMPAIGNS_MANAGE, name: PERMISSION_LABELS[Permission.CAMPAIGNS_MANAGE], description: "Permite criar, editar, ativar e encerrar campanhas", module: "campaigns", category: "Campanhas", sortOrder: 2 },
  { code: Permission.REMINDERS_VIEW, name: PERMISSION_LABELS[Permission.REMINDERS_VIEW], description: "Permite visualizar lembretes de clientes", module: "reminders", category: "Lembretes", sortOrder: 1 },

  // RECEITAS (Livro de Receitas — dado clínico sensível, LGPD)
  { code: Permission.PRESCRIPTIONS_VIEW, name: PERMISSION_LABELS[Permission.PRESCRIPTIONS_VIEW], description: "Permite visualizar receitas/grau dos clientes (dado de saúde)", module: "prescriptions", category: "Receitas", sortOrder: 1 },
  { code: Permission.PRESCRIPTIONS_EDIT, name: PERMISSION_LABELS[Permission.PRESCRIPTIONS_EDIT], description: "Permite digitar/editar o grau de receitas", module: "prescriptions", category: "Receitas", sortOrder: 2 },

  // CLÍNICO (Vis Medical)
  { code: Permission.CLINICAL_ENCOUNTER_VIEW, name: PERMISSION_LABELS[Permission.CLINICAL_ENCOUNTER_VIEW], description: "Ver atendimentos clínicos", module: "clinical", category: "Clínico", sortOrder: 900 },
  { code: Permission.CLINICAL_ENCOUNTER_CREATE, name: PERMISSION_LABELS[Permission.CLINICAL_ENCOUNTER_CREATE], description: "Registrar atendimento clínico", module: "clinical", category: "Clínico", sortOrder: 901 },
  { code: Permission.CLINICAL_EXAM_VIEW, name: PERMISSION_LABELS[Permission.CLINICAL_EXAM_VIEW], description: "Ver exames", module: "clinical", category: "Clínico", sortOrder: 902 },
  { code: Permission.CLINICAL_EXAM_CREATE, name: PERMISSION_LABELS[Permission.CLINICAL_EXAM_CREATE], description: "Registrar exames", module: "clinical", category: "Clínico", sortOrder: 903 },
  { code: Permission.CLINICAL_PRESCRIPTION_ISSUE, name: PERMISSION_LABELS[Permission.CLINICAL_PRESCRIPTION_ISSUE], description: "Emitir receita clínica", module: "clinical", category: "Clínico", sortOrder: 904 },
  { code: Permission.CLINICAL_APPOINTMENT_MANAGE, name: PERMISSION_LABELS[Permission.CLINICAL_APPOINTMENT_MANAGE], description: "Gerenciar agenda clínica", module: "clinical", category: "Clínico", sortOrder: 905 },
];

/**
 * Mapa de permissões por role do banco (ADMIN, GERENTE, VENDEDOR, CAIXA, ATENDENTE)
 * Usa os códigos do enum Permission que o frontend espera.
 */
export const ROLE_PERMISSIONS_MAP: Record<string, string[]> = {
  // Administrador - Acesso total (todas as permissões do catálogo)
  ADMIN: PERMISSIONS.map(p => p.code),

  // Gerente - Quase tudo, exceto company.settings, branch.manage, users.create, users.delete
  GERENTE: [
    // Vendas
    Permission.SALES_CREATE, Permission.SALES_VIEW, Permission.SALES_VIEW_ALL,
    Permission.SALES_VIEW_CANCELED, Permission.SALES_CANCEL, Permission.SALES_REFUND,
    Permission.SALES_EDIT_SELLER, Permission.SALES_EDIT_DISCOUNT,
    // Orçamentos
    Permission.QUOTES_CREATE, Permission.QUOTES_VIEW, Permission.QUOTES_VIEW_ALL,
    Permission.QUOTES_EDIT, Permission.QUOTES_DELETE, Permission.QUOTES_CONVERT,
    // Funil de Leads — gerente acessa e vê todos os leads da loja.
    Permission.LEADS_ACCESS, Permission.LEADS_CREATE, Permission.LEADS_VIEW_OWN,
    Permission.LEADS_VIEW_ALL, Permission.LEADS_EDIT, Permission.LEADS_DELETE,
    Permission.LEADS_CONVERT,
    // Clientes
    Permission.CUSTOMERS_CREATE, Permission.CUSTOMERS_VIEW,
    Permission.CUSTOMERS_EDIT, Permission.CUSTOMERS_DELETE,
    // Produtos
    Permission.PRODUCTS_CREATE, Permission.PRODUCTS_VIEW,
    Permission.PRODUCTS_EDIT, Permission.PRODUCTS_DELETE, Permission.PRODUCTS_MANAGE_STOCK,
    // Estoque
    Permission.STOCK_VIEW, Permission.STOCK_ADJUST, Permission.STOCK_TRANSFER,
    // Financeiro
    Permission.FINANCIAL_VIEW, Permission.FINANCIAL_MANAGE,
    Permission.ACCOUNTS_RECEIVABLE_VIEW, Permission.ACCOUNTS_RECEIVABLE_MANAGE,
    Permission.ACCOUNTS_PAYABLE_VIEW, Permission.ACCOUNTS_PAYABLE_MANAGE,
    // Caixa
    Permission.CASH_SHIFT_OPEN, Permission.CASH_SHIFT_CLOSE,
    Permission.CASH_SHIFT_VIEW, Permission.CASH_SHIFT_VIEW_ALL,
    // Relatórios
    Permission.REPORTS_SALES, Permission.REPORTS_FINANCIAL,
    Permission.REPORTS_INVENTORY, Permission.REPORTS_CUSTOMERS,
    // Usuários (sem criar/deletar)
    Permission.USERS_VIEW, Permission.USERS_EDIT,
    // Configurações básicas (sem company/branch)
    Permission.SETTINGS_VIEW, Permission.SETTINGS_EDIT,
    // Módulos adicionais
    Permission.SERVICE_ORDERS_VIEW, Permission.SERVICE_ORDERS_CREATE, Permission.SERVICE_ORDERS_EDIT,
    // Receitas (Livro de Receitas)
    Permission.PRESCRIPTIONS_VIEW, Permission.PRESCRIPTIONS_EDIT,
    Permission.SUPPLIERS_VIEW, Permission.SUPPLIERS_MANAGE,
    Permission.LABORATORIES_VIEW, Permission.LABORATORIES_MANAGE,
    Permission.CASHBACK_VIEW, Permission.CASHBACK_MANAGE,
    Permission.GOALS_VIEW, Permission.GOALS_MANAGE,
    Permission.CAMPAIGNS_VIEW, Permission.CAMPAIGNS_MANAGE,
    Permission.REMINDERS_VIEW,
  ],

  // Vendedor - Foco em vendas e clientes
  VENDEDOR: [
    // Vendas
    Permission.SALES_CREATE, Permission.SALES_VIEW,
    // Funil de Leads — funil coletivo por loja: vendedor acessa e vê TODOS os
    // leads (fila coletiva por dia). leads.access é exigido pela página do funil
    // (funil/page.tsx:606). SALES_VIEW_ALL fica de fora: vendas seguem por vendedor.
    Permission.LEADS_ACCESS, Permission.LEADS_CREATE, Permission.LEADS_VIEW_OWN,
    Permission.LEADS_VIEW_ALL, Permission.LEADS_EDIT, Permission.LEADS_CONVERT,
    // Orçamentos
    Permission.QUOTES_CREATE, Permission.QUOTES_VIEW,
    Permission.QUOTES_EDIT, Permission.QUOTES_CONVERT,
    // OS
    Permission.SERVICE_ORDERS_VIEW, Permission.SERVICE_ORDERS_CREATE,
    // Receitas (Livro de Receitas)
    Permission.PRESCRIPTIONS_VIEW, Permission.PRESCRIPTIONS_EDIT,
    // Clientes
    Permission.CUSTOMERS_CREATE, Permission.CUSTOMERS_VIEW, Permission.CUSTOMERS_EDIT,
    // Produtos (apenas visualizar)
    Permission.PRODUCTS_VIEW,
    // Caixa (abrir, fechar, visualizar)
    Permission.CASH_SHIFT_VIEW, Permission.CASH_SHIFT_OPEN, Permission.CASH_SHIFT_CLOSE,
    // Cashback
    Permission.CASHBACK_VIEW,
    // Lembretes
    Permission.REMINDERS_VIEW,
    // Metas (apenas visualizar)
    Permission.GOALS_VIEW,
    // Campanhas (apenas visualizar)
    Permission.CAMPAIGNS_VIEW,
    // NÃO tem settings.view — vendedor não acessa configurações
  ],

  // Caixa - Foco em operações de caixa e vendas
  CAIXA: [
    // Vendas
    Permission.SALES_CREATE, Permission.SALES_VIEW, Permission.SALES_VIEW_ALL,
    // Clientes (básico)
    Permission.CUSTOMERS_CREATE, Permission.CUSTOMERS_VIEW,
    // Produtos (apenas visualizar)
    Permission.PRODUCTS_VIEW,
    // Caixa
    Permission.CASH_SHIFT_OPEN, Permission.CASH_SHIFT_CLOSE, Permission.CASH_SHIFT_VIEW,
    // Financeiro (apenas visualizar recebíveis)
    Permission.ACCOUNTS_RECEIVABLE_VIEW,
    // Cashback
    Permission.CASHBACK_VIEW,
    // Configurações básicas
    Permission.SETTINGS_VIEW,
  ],

  // Atendente - Atendimento e orçamentos
  ATENDENTE: [
    // Vendas (apenas visualizar)
    Permission.SALES_VIEW,
    // Clientes
    Permission.CUSTOMERS_CREATE, Permission.CUSTOMERS_VIEW,
    // Produtos (apenas visualizar)
    Permission.PRODUCTS_VIEW,
    // Orçamentos
    Permission.QUOTES_VIEW, Permission.QUOTES_CREATE,
    // OS
    Permission.SERVICE_ORDERS_VIEW, Permission.SERVICE_ORDERS_CREATE,
    // Lembretes
    Permission.REMINDERS_VIEW,
    // Configurações básicas
    Permission.SETTINGS_VIEW,
  ],

  OFTALMOLOGISTA: [
    Permission.CLINICAL_ENCOUNTER_VIEW, Permission.CLINICAL_ENCOUNTER_CREATE,
    Permission.CLINICAL_EXAM_VIEW, Permission.CLINICAL_EXAM_CREATE,
    Permission.CLINICAL_PRESCRIPTION_ISSUE, Permission.CLINICAL_APPOINTMENT_MANAGE,
  ],
  OPTOMETRISTA: [
    Permission.CLINICAL_ENCOUNTER_VIEW, Permission.CLINICAL_ENCOUNTER_CREATE,
    Permission.CLINICAL_EXAM_VIEW, Permission.CLINICAL_EXAM_CREATE,
    Permission.CLINICAL_PRESCRIPTION_ISSUE, Permission.CLINICAL_APPOINTMENT_MANAGE,
  ],
};

