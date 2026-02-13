/**
 * Catálogo Completo de Permissões do Sistema
 *
 * IMPORTANTE: Cada permissão aqui foi verificada e existe no código
 */

export interface PermissionDefinition {
  code: string;
  name: string;
  description?: string;
  module: string;
  category: string;
  sortOrder: number;
}

export const PERMISSIONS_CATALOG: PermissionDefinition[] = [
  // =================================================================
  // DASHBOARD
  // =================================================================
  {
    code: "dashboard.view",
    name: "Acessar Dashboard",
    description: "Visualizar página principal com métricas",
    module: "dashboard",
    category: "Dashboard",
    sortOrder: 1,
  },

  // =================================================================
  // VENDAS (Sales)
  // =================================================================
  {
    code: "sales.access",
    name: "Acessar Vendas",
    description: "Entrar na seção de vendas",
    module: "sales",
    category: "Vendas",
    sortOrder: 10,
  },
  {
    code: "sales.create",
    name: "Criar Vendas",
    description: "Criar novas vendas no PDV",
    module: "sales",
    category: "Vendas",
    sortOrder: 11,
  },
  {
    code: "sales.view_own",
    name: "Ver Suas Vendas",
    description: "Visualizar apenas suas próprias vendas",
    module: "sales",
    category: "Vendas",
    sortOrder: 12,
  },
  {
    code: "sales.view_all",
    name: "Ver Todas Vendas",
    description: "Visualizar vendas de todos os vendedores",
    module: "sales",
    category: "Vendas",
    sortOrder: 13,
  },
  {
    code: "sales.edit",
    name: "Editar Vendas",
    description: "Modificar vendas existentes",
    module: "sales",
    category: "Vendas",
    sortOrder: 14,
  },
  {
    code: "sales.cancel",
    name: "Cancelar Vendas",
    description: "Cancelar vendas realizadas",
    module: "sales",
    category: "Vendas",
    sortOrder: 15,
  },
  {
    code: "sales.reactivate",
    name: "Reativar Vendas",
    description: "Reativar vendas canceladas",
    module: "sales",
    category: "Vendas",
    sortOrder: 16,
  },
  {
    code: "sales.edit_seller",
    name: "Alterar Vendedor",
    description: "Modificar vendedor vinculado à venda",
    module: "sales",
    category: "Vendas",
    sortOrder: 17,
  },

  // =================================================================
  // ORÇAMENTOS (Quotes)
  // =================================================================
  {
    code: "quotes.access",
    name: "Acessar Orçamentos",
    description: "Entrar na seção de orçamentos",
    module: "quotes",
    category: "Orçamentos",
    sortOrder: 20,
  },
  {
    code: "quotes.create",
    name: "Criar Orçamentos",
    description: "Criar novos orçamentos",
    module: "quotes",
    category: "Orçamentos",
    sortOrder: 21,
  },
  {
    code: "quotes.view_own",
    name: "Ver Seus Orçamentos",
    description: "Visualizar apenas seus próprios orçamentos",
    module: "quotes",
    category: "Orçamentos",
    sortOrder: 22,
  },
  {
    code: "quotes.view_all",
    name: "Ver Todos Orçamentos",
    description: "Visualizar orçamentos de todos",
    module: "quotes",
    category: "Orçamentos",
    sortOrder: 23,
  },
  {
    code: "quotes.edit",
    name: "Editar Orçamentos",
    description: "Modificar orçamentos existentes",
    module: "quotes",
    category: "Orçamentos",
    sortOrder: 24,
  },
  {
    code: "quotes.delete",
    name: "Excluir Orçamentos",
    description: "Remover orçamentos",
    module: "quotes",
    category: "Orçamentos",
    sortOrder: 25,
  },
  {
    code: "quotes.convert",
    name: "Converter em Venda",
    description: "Transformar orçamento em venda",
    module: "quotes",
    category: "Orçamentos",
    sortOrder: 26,
  },

  // =================================================================
  // ORDENS DE SERVIÇO
  // =================================================================
  {
    code: "service_orders.access",
    name: "Acessar Ordens de Serviço",
    description: "Entrar na seção de OS",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 30,
  },
  {
    code: "service_orders.create",
    name: "Criar OS",
    description: "Criar novas ordens de serviço",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 31,
  },
  {
    code: "service_orders.view_own",
    name: "Ver Suas OS",
    description: "Visualizar apenas suas próprias OS",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 32,
  },
  {
    code: "service_orders.view_all",
    name: "Ver Todas OS",
    description: "Visualizar OS de todos",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 33,
  },
  {
    code: "service_orders.edit_own",
    name: "Editar Suas OS",
    description: "Modificar apenas suas próprias OS",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 34,
  },
  {
    code: "service_orders.edit_all",
    name: "Editar Qualquer OS",
    description: "Modificar qualquer ordem de serviço",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 35,
  },
  {
    code: "service_orders.delete",
    name: "Excluir OS",
    description: "Remover ordens de serviço",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 36,
  },
  {
    code: "service_orders.change_status",
    name: "Alterar Status OS",
    description: "Modificar status da ordem de serviço",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 37,
  },

  // =================================================================
  // CAIXA (Cash)
  // =================================================================
  {
    code: "cash.access",
    name: "Acessar Caixa",
    description: "Entrar na tela de gestão de caixa",
    module: "cash",
    category: "Gestão de Caixa",
    sortOrder: 40,
  },
  {
    code: "cash.view_current",
    name: "Ver Posição Atual",
    description: "Consultar saldo do caixa",
    module: "cash",
    category: "Gestão de Caixa",
    sortOrder: 41,
  },
  {
    code: "cash.open",
    name: "Abrir Caixa",
    description: "Iniciar turno de caixa",
    module: "cash",
    category: "Gestão de Caixa",
    sortOrder: 42,
  },
  {
    code: "cash.close",
    name: "Fechar Caixa",
    description: "Encerrar turno de caixa",
    module: "cash",
    category: "Gestão de Caixa",
    sortOrder: 43,
  },
  {
    code: "cash.movements_create",
    name: "Criar Movimentos",
    description: "Registrar sangrias e suprimentos",
    module: "cash",
    category: "Gestão de Caixa",
    sortOrder: 44,
  },
  {
    code: "cash.movements_view",
    name: "Ver Movimentos",
    description: "Consultar movimentações do caixa",
    module: "cash",
    category: "Gestão de Caixa",
    sortOrder: 45,
  },

  // =================================================================
  // CONTAS A RECEBER
  // =================================================================
  {
    code: "receivables.access",
    name: "Acessar Contas a Receber",
    description: "Entrar na seção de recebíveis",
    module: "receivables",
    category: "Contas a Receber",
    sortOrder: 50,
  },
  {
    code: "receivables.view",
    name: "Consultar Contas",
    description: "Visualizar contas a receber",
    module: "receivables",
    category: "Contas a Receber",
    sortOrder: 51,
  },
  {
    code: "receivables.create",
    name: "Incluir Conta",
    description: "Criar nova conta a receber",
    module: "receivables",
    category: "Contas a Receber",
    sortOrder: 52,
  },
  {
    code: "receivables.edit",
    name: "Alterar Conta",
    description: "Modificar conta existente",
    module: "receivables",
    category: "Contas a Receber",
    sortOrder: 53,
  },
  {
    code: "receivables.delete",
    name: "Excluir Conta",
    description: "Remover conta a receber",
    module: "receivables",
    category: "Contas a Receber",
    sortOrder: 54,
  },

  // =================================================================
  // CONTAS A PAGAR
  // =================================================================
  {
    code: "payables.access",
    name: "Acessar Contas a Pagar",
    description: "Entrar na seção de pagamentos",
    module: "payables",
    category: "Contas a Pagar",
    sortOrder: 60,
  },
  {
    code: "payables.view",
    name: "Consultar Contas",
    description: "Visualizar contas a pagar",
    module: "payables",
    category: "Contas a Pagar",
    sortOrder: 61,
  },
  {
    code: "payables.create",
    name: "Incluir Conta",
    description: "Criar nova conta a pagar",
    module: "payables",
    category: "Contas a Pagar",
    sortOrder: 62,
  },
  {
    code: "payables.edit",
    name: "Alterar Conta",
    description: "Modificar conta existente",
    module: "payables",
    category: "Contas a Pagar",
    sortOrder: 63,
  },
  {
    code: "payables.delete",
    name: "Excluir Conta",
    description: "Remover conta a pagar",
    module: "payables",
    category: "Contas a Pagar",
    sortOrder: 64,
  },

  // =================================================================
  // PRODUTOS
  // =================================================================
  {
    code: "products.access",
    name: "Acessar Produtos",
    description: "Entrar na seção de produtos",
    module: "products",
    category: "Produtos",
    sortOrder: 70,
  },
  {
    code: "products.view",
    name: "Consultar Produtos",
    description: "Visualizar lista de produtos",
    module: "products",
    category: "Produtos",
    sortOrder: 71,
  },
  {
    code: "products.create",
    name: "Incluir Produtos",
    description: "Criar novos produtos",
    module: "products",
    category: "Produtos",
    sortOrder: 72,
  },
  {
    code: "products.edit",
    name: "Alterar Dados",
    description: "Modificar produtos existentes",
    module: "products",
    category: "Produtos",
    sortOrder: 73,
  },
  {
    code: "products.delete",
    name: "Excluir Produtos",
    description: "Remover produtos",
    module: "products",
    category: "Produtos",
    sortOrder: 74,
  },
  {
    code: "products.export",
    name: "Exportar Excel",
    description: "Baixar lista de produtos",
    module: "products",
    category: "Produtos",
    sortOrder: 75,
  },
  {
    code: "products.import",
    name: "Importar Excel",
    description: "Upload de produtos em massa",
    module: "products",
    category: "Produtos",
    sortOrder: 76,
  },
  {
    code: "products.barcodes",
    name: "Gerenciar Códigos de Barras",
    description: "Criar e editar códigos de barras",
    module: "products",
    category: "Produtos",
    sortOrder: 77,
  },

  // =================================================================
  // ESTOQUE
  // =================================================================
  {
    code: "stock.access",
    name: "Acessar Estoque",
    description: "Entrar na seção de estoque",
    module: "stock",
    category: "Estoque",
    sortOrder: 80,
  },
  {
    code: "stock.view_position",
    name: "Ver Posição Atual",
    description: "Consultar estoque atual",
    module: "stock",
    category: "Estoque",
    sortOrder: 81,
  },
  {
    code: "stock.movements_view",
    name: "Ver Movimentações",
    description: "Consultar histórico de movimentos",
    module: "stock",
    category: "Estoque",
    sortOrder: 82,
  },
  {
    code: "stock.movements_create",
    name: "Criar Movimento",
    description: "Registrar entrada/saída",
    module: "stock",
    category: "Estoque",
    sortOrder: 83,
  },
  {
    code: "stock.transfer",
    name: "Transferir Entre Filiais",
    description: "Transferir produtos entre filiais",
    module: "stock",
    category: "Estoque",
    sortOrder: 84,
  },
  {
    code: "stock.adjustments_view",
    name: "Ver Ajustes",
    description: "Consultar ajustes de estoque",
    module: "stock",
    category: "Estoque",
    sortOrder: 85,
  },
  {
    code: "stock.adjustments_create",
    name: "Criar Ajuste",
    description: "Solicitar ajuste de estoque",
    module: "stock",
    category: "Estoque",
    sortOrder: 86,
  },
  {
    code: "stock.adjustments_approve",
    name: "Aprovar Ajustes",
    description: "Aprovar/rejeitar ajustes",
    module: "stock",
    category: "Estoque",
    sortOrder: 87,
  },

  // =================================================================
  // CLIENTES
  // =================================================================
  {
    code: "customers.access",
    name: "Acessar Clientes",
    description: "Entrar na seção de clientes",
    module: "customers",
    category: "Clientes",
    sortOrder: 90,
  },
  {
    code: "customers.view",
    name: "Consultar Clientes",
    description: "Visualizar lista de clientes",
    module: "customers",
    category: "Clientes",
    sortOrder: 91,
  },
  {
    code: "customers.create",
    name: "Incluir Clientes",
    description: "Criar novos clientes",
    module: "customers",
    category: "Clientes",
    sortOrder: 92,
  },
  {
    code: "customers.edit",
    name: "Alterar Dados",
    description: "Modificar clientes existentes",
    module: "customers",
    category: "Clientes",
    sortOrder: 93,
  },
  {
    code: "customers.delete",
    name: "Excluir Clientes",
    description: "Remover clientes",
    module: "customers",
    category: "Clientes",
    sortOrder: 94,
  },
  {
    code: "customers.export",
    name: "Exportar Excel",
    description: "Baixar lista de clientes",
    module: "customers",
    category: "Clientes",
    sortOrder: 95,
  },
  {
    code: "customers.import",
    name: "Importar Excel",
    description: "Upload de clientes em massa",
    module: "customers",
    category: "Clientes",
    sortOrder: 96,
  },

  // =================================================================
  // FORNECEDORES
  // =================================================================
  {
    code: "suppliers.access",
    name: "Acessar Fornecedores",
    description: "Entrar na seção de fornecedores",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 100,
  },
  {
    code: "suppliers.view",
    name: "Consultar Fornecedores",
    description: "Visualizar lista",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 101,
  },
  {
    code: "suppliers.create",
    name: "Incluir Fornecedores",
    description: "Criar novos fornecedores",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 102,
  },
  {
    code: "suppliers.edit",
    name: "Alterar Dados",
    description: "Modificar fornecedores",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 103,
  },
  {
    code: "suppliers.delete",
    name: "Excluir Fornecedores",
    description: "Remover fornecedores",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 104,
  },
  {
    code: "suppliers.export",
    name: "Exportar Excel",
    description: "Baixar lista de fornecedores",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 105,
  },
  {
    code: "suppliers.import",
    name: "Importar Excel",
    description: "Upload de fornecedores em massa",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 106,
  },

  // =================================================================
  // USUÁRIOS / FUNCIONÁRIOS
  // =================================================================
  {
    code: "users.access",
    name: "Acessar Usuários",
    description: "Entrar na seção de usuários",
    module: "users",
    category: "Usuários",
    sortOrder: 110,
  },
  {
    code: "users.view",
    name: "Consultar Usuários",
    description: "Visualizar lista de usuários",
    module: "users",
    category: "Usuários",
    sortOrder: 111,
  },
  {
    code: "users.create",
    name: "Incluir Usuários",
    description: "Criar novos usuários",
    module: "users",
    category: "Usuários",
    sortOrder: 112,
  },
  {
    code: "users.edit",
    name: "Alterar Dados",
    description: "Modificar usuários",
    module: "users",
    category: "Usuários",
    sortOrder: 113,
  },
  {
    code: "users.delete",
    name: "Excluir Usuários",
    description: "Remover usuários",
    module: "users",
    category: "Usuários",
    sortOrder: 114,
  },
  {
    code: "users.permissions",
    name: "Gerenciar Permissões",
    description: "Alterar permissões de usuários",
    module: "users",
    category: "Usuários",
    sortOrder: 115,
  },

  // =================================================================
  // RELATÓRIOS
  // =================================================================
  {
    code: "reports.access",
    name: "Acessar Relatórios",
    description: "Entrar na seção de relatórios",
    module: "reports",
    category: "Relatórios",
    sortOrder: 120,
  },
  {
    code: "reports.sales_consolidated",
    name: "Vendas Consolidadas",
    description: "Relatório de vendas consolidadas",
    module: "reports",
    category: "Relatórios",
    sortOrder: 121,
  },
  {
    code: "reports.products_top_sellers",
    name: "Produtos Mais Vendidos",
    description: "Top produtos por venda",
    module: "reports",
    category: "Relatórios",
    sortOrder: 122,
  },
  {
    code: "reports.products_no_movement",
    name: "Produtos Sem Giro",
    description: "Produtos sem movimentação",
    module: "reports",
    category: "Relatórios",
    sortOrder: 123,
  },
  {
    code: "reports.stock_position",
    name: "Posição de Estoque",
    description: "Relatório de estoque atual",
    module: "reports",
    category: "Relatórios",
    sortOrder: 124,
  },
  {
    code: "reports.commissions_own",
    name: "Suas Comissões",
    description: "Ver apenas suas comissões",
    module: "reports",
    category: "Relatórios",
    sortOrder: 125,
  },
  {
    code: "reports.commissions_all",
    name: "Todas Comissões",
    description: "Ver comissões de todos",
    module: "reports",
    category: "Relatórios",
    sortOrder: 126,
  },
  {
    code: "reports.cash_history",
    name: "Histórico de Caixa",
    description: "Relatório de movimentos de caixa",
    module: "reports",
    category: "Relatórios",
    sortOrder: 127,
  },
  {
    code: "reports.receivables",
    name: "Contas a Receber",
    description: "Relatório de recebíveis",
    module: "reports",
    category: "Relatórios",
    sortOrder: 128,
  },
  {
    code: "reports.payables",
    name: "Contas a Pagar",
    description: "Relatório de pagamentos",
    module: "reports",
    category: "Relatórios",
    sortOrder: 129,
  },
  {
    code: "reports.dre",
    name: "DRE Gerencial",
    description: "Demonstrativo de resultado",
    module: "reports",
    category: "Relatórios",
    sortOrder: 130,
  },

  // =================================================================
  // CONFIGURAÇÕES
  // =================================================================
  {
    code: "settings.access",
    name: "Acessar Configurações",
    description: "Entrar nas configurações do sistema",
    module: "settings",
    category: "Configurações",
    sortOrder: 140,
  },
  {
    code: "settings.rules_view",
    name: "Ver Regras",
    description: "Visualizar regras do sistema",
    module: "settings",
    category: "Configurações",
    sortOrder: 141,
  },
  {
    code: "settings.rules_edit",
    name: "Editar Regras",
    description: "Modificar regras do sistema",
    module: "settings",
    category: "Configurações",
    sortOrder: 142,
  },
  {
    code: "settings.branches",
    name: "Gerenciar Filiais",
    description: "Criar e editar filiais",
    module: "settings",
    category: "Configurações",
    sortOrder: 143,
  },

  // =================================================================
  // CASHBACK
  // =================================================================
  {
    code: "cashback.access",
    name: "Acessar Cashback",
    description: "Entrar na seção de cashback",
    module: "cashback",
    category: "Cashback",
    sortOrder: 130,
  },
  {
    code: "cashback.view",
    name: "Ver Cashback",
    description: "Visualizar saldos e movimentações",
    module: "cashback",
    category: "Cashback",
    sortOrder: 131,
  },
  {
    code: "cashback.manage",
    name: "Gerenciar Cashback",
    description: "Ajustar saldos e processar cashback",
    module: "cashback",
    category: "Cashback",
    sortOrder: 132,
  },
  {
    code: "cashback.config",
    name: "Configurar Cashback",
    description: "Alterar configurações do programa",
    module: "cashback",
    category: "Cashback",
    sortOrder: 133,
  },

  // =================================================================
  // LEMBRETES
  // =================================================================
  {
    code: "reminders.access",
    name: "Acessar Lembretes",
    description: "Entrar na seção de lembretes de retorno",
    module: "reminders",
    category: "Lembretes",
    sortOrder: 140,
  },
  {
    code: "reminders.view",
    name: "Ver Lembretes",
    description: "Visualizar lembretes de clientes",
    module: "reminders",
    category: "Lembretes",
    sortOrder: 141,
  },
  {
    code: "reminders.manage",
    name: "Gerenciar Lembretes",
    description: "Criar, editar e excluir lembretes",
    module: "reminders",
    category: "Lembretes",
    sortOrder: 142,
  },
  {
    code: "reminders.config",
    name: "Configurar Lembretes",
    description: "Configurar regras de lembretes automáticos",
    module: "reminders",
    category: "Lembretes",
    sortOrder: 143,
  },

  // =================================================================
  // METAS E PERFORMANCE
  // =================================================================
  {
    code: "goals.access",
    name: "Acessar Metas",
    description: "Entrar na seção de metas",
    module: "goals",
    category: "Metas",
    sortOrder: 150,
  },
  {
    code: "goals.view_own",
    name: "Ver Suas Metas",
    description: "Visualizar apenas suas metas",
    module: "goals",
    category: "Metas",
    sortOrder: 151,
  },
  {
    code: "goals.view_all",
    name: "Ver Todas Metas",
    description: "Visualizar metas de todos",
    module: "goals",
    category: "Metas",
    sortOrder: 152,
  },
];
