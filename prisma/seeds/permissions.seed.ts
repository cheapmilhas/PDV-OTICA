/**
 * =========================================================
 * SEED: CATÁLOGO DE PERMISSÕES DO SISTEMA
 * =========================================================
 *
 * Este arquivo popula a tabela Permission com todas as
 * permissões disponíveis no PDV Ótica, organizadas por módulo.
 *
 * IMPORTANTE: Apenas permissões de funcionalidades que EXISTEM
 * no código devem ser criadas aqui.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Estrutura de Permissões
 * - code: identificador único (ex: "sales.create")
 * - name: nome amigável (ex: "Criar vendas")
 * - description: descrição detalhada (opcional)
 * - module: identificador do módulo (ex: "sales")
 * - category: categoria de exibição (ex: "Vendas")
 * - sortOrder: ordem de exibição
 */

interface PermissionSeed {
  code: string;
  name: string;
  description?: string;
  module: string;
  category: string;
  sortOrder: number;
}

// =========================================================
// CATÁLOGO DE PERMISSÕES (baseado nas funcionalidades reais)
// =========================================================

const PERMISSIONS: PermissionSeed[] = [
  // ========== MÓDULO: VENDAS ==========
  {
    code: "sales.view",
    name: "Visualizar vendas",
    description: "Permite visualizar a lista de vendas e detalhes de cada venda",
    module: "sales",
    category: "Vendas",
    sortOrder: 1,
  },
  {
    code: "sales.create",
    name: "Criar vendas",
    description: "Permite criar novas vendas no PDV",
    module: "sales",
    category: "Vendas",
    sortOrder: 2,
  },
  {
    code: "sales.edit",
    name: "Editar vendas",
    description: "Permite editar vendas existentes (vendedor, produtos, etc)",
    module: "sales",
    category: "Vendas",
    sortOrder: 3,
  },
  {
    code: "sales.cancel",
    name: "Cancelar vendas",
    description: "Permite cancelar vendas já finalizadas",
    module: "sales",
    category: "Vendas",
    sortOrder: 4,
  },
  {
    code: "sales.reactivate",
    name: "Reativar vendas canceladas",
    description: "Permite reativar vendas que foram canceladas",
    module: "sales",
    category: "Vendas",
    sortOrder: 5,
  },
  {
    code: "sales.apply_discount",
    name: "Aplicar descontos",
    description: "Permite aplicar descontos em vendas",
    module: "sales",
    category: "Vendas",
    sortOrder: 6,
  },
  {
    code: "sales.view_cost",
    name: "Ver custo dos produtos",
    description: "Permite visualizar o custo de custo dos produtos nas vendas",
    module: "sales",
    category: "Vendas",
    sortOrder: 7,
  },
  {
    code: "sales.change_seller",
    name: "Alterar vendedor",
    description: "Permite alterar o vendedor de uma venda",
    module: "sales",
    category: "Vendas",
    sortOrder: 8,
  },

  // ========== MÓDULO: CAIXA ==========
  {
    code: "cash.view",
    name: "Visualizar caixa",
    description: "Permite visualizar movimentações e status do caixa",
    module: "cash",
    category: "Caixa",
    sortOrder: 1,
  },
  {
    code: "cash.open",
    name: "Abrir caixa",
    description: "Permite abrir um novo turno de caixa",
    module: "cash",
    category: "Caixa",
    sortOrder: 2,
  },
  {
    code: "cash.close",
    name: "Fechar caixa",
    description: "Permite fechar um turno de caixa",
    module: "cash",
    category: "Caixa",
    sortOrder: 3,
  },
  {
    code: "cash.supply",
    name: "Fazer sangria/suprimento",
    description: "Permite adicionar ou retirar dinheiro do caixa",
    module: "cash",
    category: "Caixa",
    sortOrder: 4,
  },
  {
    code: "cash.view_history",
    name: "Ver histórico de caixas",
    description: "Permite visualizar histórico de turnos de caixa fechados",
    module: "cash",
    category: "Caixa",
    sortOrder: 5,
  },
  {
    code: "cash.view_reports",
    name: "Ver relatórios de caixa",
    description: "Permite visualizar relatórios detalhados de caixa",
    module: "cash",
    category: "Caixa",
    sortOrder: 6,
  },

  // ========== MÓDULO: PRODUTOS ==========
  {
    code: "products.view",
    name: "Visualizar produtos",
    description: "Permite visualizar a lista de produtos e seus detalhes",
    module: "products",
    category: "Produtos",
    sortOrder: 1,
  },
  {
    code: "products.create",
    name: "Criar produtos",
    description: "Permite cadastrar novos produtos",
    module: "products",
    category: "Produtos",
    sortOrder: 2,
  },
  {
    code: "products.edit",
    name: "Editar produtos",
    description: "Permite editar produtos existentes",
    module: "products",
    category: "Produtos",
    sortOrder: 3,
  },
  {
    code: "products.delete",
    name: "Excluir produtos",
    description: "Permite excluir produtos do sistema",
    module: "products",
    category: "Produtos",
    sortOrder: 4,
  },
  {
    code: "products.view_cost",
    name: "Ver custo dos produtos",
    description: "Permite visualizar o preço de custo dos produtos",
    module: "products",
    category: "Produtos",
    sortOrder: 5,
  },
  {
    code: "products.import",
    name: "Importar produtos",
    description: "Permite importar produtos via planilha",
    module: "products",
    category: "Produtos",
    sortOrder: 6,
  },
  {
    code: "products.export",
    name: "Exportar produtos",
    description: "Permite exportar produtos para planilha",
    module: "products",
    category: "Produtos",
    sortOrder: 7,
  },

  // ========== MÓDULO: CLIENTES ==========
  {
    code: "customers.view",
    name: "Visualizar clientes",
    description: "Permite visualizar a lista de clientes e seus detalhes",
    module: "customers",
    category: "Clientes",
    sortOrder: 1,
  },
  {
    code: "customers.create",
    name: "Criar clientes",
    description: "Permite cadastrar novos clientes",
    module: "customers",
    category: "Clientes",
    sortOrder: 2,
  },
  {
    code: "customers.edit",
    name: "Editar clientes",
    description: "Permite editar dados de clientes existentes",
    module: "customers",
    category: "Clientes",
    sortOrder: 3,
  },
  {
    code: "customers.delete",
    name: "Excluir clientes",
    description: "Permite excluir clientes do sistema",
    module: "customers",
    category: "Clientes",
    sortOrder: 4,
  },
  {
    code: "customers.import",
    name: "Importar clientes",
    description: "Permite importar clientes via planilha",
    module: "customers",
    category: "Clientes",
    sortOrder: 5,
  },
  {
    code: "customers.export",
    name: "Exportar clientes",
    description: "Permite exportar clientes para planilha",
    module: "customers",
    category: "Clientes",
    sortOrder: 6,
  },

  // ========== MÓDULO: ESTOQUE ==========
  {
    code: "stock.view",
    name: "Visualizar estoque",
    description: "Permite visualizar posição de estoque dos produtos",
    module: "stock",
    category: "Estoque",
    sortOrder: 1,
  },
  {
    code: "stock.adjust",
    name: "Ajustar estoque",
    description: "Permite criar ajustes de estoque (quebra, perda, etc)",
    module: "stock",
    category: "Estoque",
    sortOrder: 2,
  },
  {
    code: "stock.approve_adjustment",
    name: "Aprovar ajustes de estoque",
    description: "Permite aprovar ou rejeitar ajustes de estoque pendentes",
    module: "stock",
    category: "Estoque",
    sortOrder: 3,
  },
  {
    code: "stock.transfer",
    name: "Transferir estoque",
    description: "Permite transferir produtos entre filiais",
    module: "stock",
    category: "Estoque",
    sortOrder: 4,
  },
  {
    code: "stock.view_movements",
    name: "Ver movimentações",
    description: "Permite visualizar histórico de movimentações de estoque",
    module: "stock",
    category: "Estoque",
    sortOrder: 5,
  },

  // ========== MÓDULO: ORÇAMENTOS ==========
  {
    code: "quotes.view",
    name: "Visualizar orçamentos",
    description: "Permite visualizar a lista de orçamentos",
    module: "quotes",
    category: "Orçamentos",
    sortOrder: 1,
  },
  {
    code: "quotes.create",
    name: "Criar orçamentos",
    description: "Permite criar novos orçamentos",
    module: "quotes",
    category: "Orçamentos",
    sortOrder: 2,
  },
  {
    code: "quotes.edit",
    name: "Editar orçamentos",
    description: "Permite editar orçamentos existentes",
    module: "quotes",
    category: "Orçamentos",
    sortOrder: 3,
  },
  {
    code: "quotes.cancel",
    name: "Cancelar orçamentos",
    description: "Permite cancelar orçamentos",
    module: "quotes",
    category: "Orçamentos",
    sortOrder: 4,
  },
  {
    code: "quotes.convert",
    name: "Converter orçamentos em vendas",
    description: "Permite converter orçamentos aprovados em vendas",
    module: "quotes",
    category: "Orçamentos",
    sortOrder: 5,
  },

  // ========== MÓDULO: ORDENS DE SERVIÇO ==========
  {
    code: "service_orders.view",
    name: "Visualizar ordens de serviço",
    description: "Permite visualizar a lista de ordens de serviço",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 1,
  },
  {
    code: "service_orders.create",
    name: "Criar ordens de serviço",
    description: "Permite criar novas ordens de serviço",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 2,
  },
  {
    code: "service_orders.edit",
    name: "Editar ordens de serviço",
    description: "Permite editar ordens de serviço existentes",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 3,
  },
  {
    code: "service_orders.change_status",
    name: "Alterar status da OS",
    description: "Permite alterar o status de ordens de serviço",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 4,
  },
  {
    code: "service_orders.cancel",
    name: "Cancelar ordens de serviço",
    description: "Permite cancelar ordens de serviço",
    module: "service_orders",
    category: "Ordens de Serviço",
    sortOrder: 5,
  },

  // ========== MÓDULO: FORNECEDORES ==========
  {
    code: "suppliers.view",
    name: "Visualizar fornecedores",
    description: "Permite visualizar a lista de fornecedores",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 1,
  },
  {
    code: "suppliers.create",
    name: "Criar fornecedores",
    description: "Permite cadastrar novos fornecedores",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 2,
  },
  {
    code: "suppliers.edit",
    name: "Editar fornecedores",
    description: "Permite editar fornecedores existentes",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 3,
  },
  {
    code: "suppliers.delete",
    name: "Excluir fornecedores",
    description: "Permite excluir fornecedores do sistema",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 4,
  },
  {
    code: "suppliers.import",
    name: "Importar fornecedores",
    description: "Permite importar fornecedores via planilha",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 5,
  },
  {
    code: "suppliers.export",
    name: "Exportar fornecedores",
    description: "Permite exportar fornecedores para planilha",
    module: "suppliers",
    category: "Fornecedores",
    sortOrder: 6,
  },

  // ========== MÓDULO: FINANCEIRO ==========
  {
    code: "financial.view_receivables",
    name: "Ver contas a receber",
    description: "Permite visualizar contas a receber",
    module: "financial",
    category: "Financeiro",
    sortOrder: 1,
  },
  {
    code: "financial.receive_payment",
    name: "Receber pagamentos",
    description: "Permite dar baixa em contas a receber",
    module: "financial",
    category: "Financeiro",
    sortOrder: 2,
  },
  {
    code: "financial.view_payables",
    name: "Ver contas a pagar",
    description: "Permite visualizar contas a pagar",
    module: "financial",
    category: "Financeiro",
    sortOrder: 3,
  },
  {
    code: "financial.create_payable",
    name: "Criar contas a pagar",
    description: "Permite criar novas contas a pagar",
    module: "financial",
    category: "Financeiro",
    sortOrder: 4,
  },
  {
    code: "financial.pay_bill",
    name: "Pagar contas",
    description: "Permite dar baixa em contas a pagar",
    module: "financial",
    category: "Financeiro",
    sortOrder: 5,
  },

  // ========== MÓDULO: RELATÓRIOS ==========
  {
    code: "reports.view_sales",
    name: "Ver relatório de vendas",
    description: "Permite visualizar relatórios de vendas",
    module: "reports",
    category: "Relatórios",
    sortOrder: 1,
  },
  {
    code: "reports.view_products",
    name: "Ver relatório de produtos",
    description: "Permite visualizar relatórios de produtos vendidos",
    module: "reports",
    category: "Relatórios",
    sortOrder: 2,
  },
  {
    code: "reports.view_stock",
    name: "Ver relatório de estoque",
    description: "Permite visualizar relatórios de posição de estoque",
    module: "reports",
    category: "Relatórios",
    sortOrder: 3,
  },
  {
    code: "reports.view_commissions",
    name: "Ver relatório de comissões",
    description: "Permite visualizar relatórios de comissões",
    module: "reports",
    category: "Relatórios",
    sortOrder: 4,
  },
  {
    code: "reports.view_cash_history",
    name: "Ver histórico de caixas",
    description: "Permite visualizar relatório de histórico de caixas",
    module: "reports",
    category: "Relatórios",
    sortOrder: 5,
  },
  {
    code: "reports.view_dre",
    name: "Ver DRE",
    description: "Permite visualizar relatório DRE (Demonstrativo de Resultados)",
    module: "reports",
    category: "Relatórios",
    sortOrder: 6,
  },
  {
    code: "reports.view_receivables",
    name: "Ver relatório de contas a receber",
    description: "Permite visualizar relatório de contas a receber",
    module: "reports",
    category: "Relatórios",
    sortOrder: 7,
  },
  {
    code: "reports.view_payables",
    name: "Ver relatório de contas a pagar",
    description: "Permite visualizar relatório de contas a pagar",
    module: "reports",
    category: "Relatórios",
    sortOrder: 8,
  },

  // ========== MÓDULO: FUNCIONÁRIOS ==========
  {
    code: "users.view",
    name: "Visualizar funcionários",
    description: "Permite visualizar a lista de funcionários",
    module: "users",
    category: "Funcionários",
    sortOrder: 1,
  },
  {
    code: "users.create",
    name: "Criar funcionários",
    description: "Permite cadastrar novos funcionários",
    module: "users",
    category: "Funcionários",
    sortOrder: 2,
  },
  {
    code: "users.edit",
    name: "Editar funcionários",
    description: "Permite editar dados de funcionários",
    module: "users",
    category: "Funcionários",
    sortOrder: 3,
  },
  {
    code: "users.delete",
    name: "Excluir funcionários",
    description: "Permite excluir funcionários do sistema",
    module: "users",
    category: "Funcionários",
    sortOrder: 4,
  },
  {
    code: "users.manage_permissions",
    name: "Gerenciar permissões",
    description: "Permite alterar permissões individuais de funcionários",
    module: "users",
    category: "Funcionários",
    sortOrder: 5,
  },

  // ========== MÓDULO: CONFIGURAÇÕES ==========
  {
    code: "settings.view",
    name: "Visualizar configurações",
    description: "Permite visualizar configurações do sistema",
    module: "settings",
    category: "Configurações",
    sortOrder: 1,
  },
  {
    code: "settings.edit_company",
    name: "Editar dados da empresa",
    description: "Permite editar dados da empresa (nome, CNPJ, logo, etc)",
    module: "settings",
    category: "Configurações",
    sortOrder: 2,
  },
  {
    code: "settings.edit_rules",
    name: "Editar regras do sistema",
    description: "Permite editar regras de negócio do sistema",
    module: "settings",
    category: "Configurações",
    sortOrder: 3,
  },
  {
    code: "settings.edit_cashback",
    name: "Configurar cashback",
    description: "Permite configurar regras de cashback",
    module: "settings",
    category: "Configurações",
    sortOrder: 4,
  },
  {
    code: "settings.edit_commissions",
    name: "Configurar comissões",
    description: "Permite configurar regras de comissões",
    module: "settings",
    category: "Configurações",
    sortOrder: 5,
  },
  {
    code: "settings.edit_reminders",
    name: "Configurar lembretes",
    description: "Permite configurar regras de lembretes automáticos",
    module: "settings",
    category: "Configurações",
    sortOrder: 6,
  },

  // ========== MÓDULO: CASHBACK ==========
  {
    code: "cashback.view",
    name: "Visualizar cashback",
    description: "Permite visualizar saldos e movimentações de cashback",
    module: "cashback",
    category: "Cashback",
    sortOrder: 1,
  },
  {
    code: "cashback.adjust",
    name: "Ajustar cashback",
    description: "Permite fazer ajustes manuais de cashback",
    module: "cashback",
    category: "Cashback",
    sortOrder: 2,
  },

  // ========== MÓDULO: LEMBRETES ==========
  {
    code: "reminders.view",
    name: "Visualizar lembretes",
    description: "Permite visualizar lembretes de clientes",
    module: "reminders",
    category: "Lembretes",
    sortOrder: 1,
  },
  {
    code: "reminders.execute",
    name: "Executar lembretes",
    description: "Permite marcar lembretes como executados/concluídos",
    module: "reminders",
    category: "Lembretes",
    sortOrder: 2,
  },

  // ========== MÓDULO: METAS ==========
  {
    code: "goals.view",
    name: "Visualizar metas",
    description: "Permite visualizar metas de vendas",
    module: "goals",
    category: "Metas",
    sortOrder: 1,
  },
  {
    code: "goals.create",
    name: "Criar metas",
    description: "Permite criar e editar metas de vendas",
    module: "goals",
    category: "Metas",
    sortOrder: 2,
  },
];

// =========================================================
// FUNÇÃO DE SEED
// =========================================================

export async function seedPermissions() {
  console.log("🔐 Iniciando seed de permissões...");

  let created = 0;
  let updated = 0;

  for (const perm of PERMISSIONS) {
    const existing = await prisma.permission.findUnique({
      where: { code: perm.code },
    });

    if (existing) {
      // Atualizar se já existir
      await prisma.permission.update({
        where: { code: perm.code },
        data: {
          name: perm.name,
          description: perm.description,
          module: perm.module,
          category: perm.category,
          sortOrder: perm.sortOrder,
        },
      });
      updated++;
    } else {
      // Criar se não existir
      await prisma.permission.create({
        data: perm,
      });
      created++;
    }
  }

  console.log(`✅ Seed concluído: ${created} criadas, ${updated} atualizadas`);
  console.log(`📊 Total de permissões no catálogo: ${PERMISSIONS.length}`);
}

// Executar se chamado diretamente
if (require.main === module) {
  seedPermissions()
    .then(() => {
      console.log("✅ Seed finalizado com sucesso!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Erro no seed:", error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
