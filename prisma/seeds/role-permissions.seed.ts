/**
 * =========================================================
 * SEED: PERMISSÕES PADRÃO POR ROLE (PERFIL)
 * =========================================================
 *
 * Define quais permissões cada role (ADMIN, GERENTE, VENDEDOR,
 * CAIXA, ATENDENTE) deve ter por padrão.
 *
 * Hierarquia de Roles:
 * - ADMIN: Acesso total a tudo
 * - GERENTE: Acesso amplo (exceto configurações críticas)
 * - VENDEDOR: Foco em vendas, orçamentos e clientes
 * - CAIXA: Foco em caixa e recebimentos
 * - ATENDENTE: Foco em atendimento básico
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// =========================================================
// DEFINIÇÃO DE PERMISSÕES POR ROLE
// =========================================================

const ROLE_PERMISSIONS_MAP = {
  // ========== ADMIN: ACESSO TOTAL ==========
  ADMIN: [
    // Todos os módulos - acesso completo
    "sales.view",
    "sales.create",
    "sales.edit",
    "sales.cancel",
    "sales.reactivate",
    "sales.apply_discount",
    "sales.view_cost",
    "sales.change_seller",
    "cash.view",
    "cash.open",
    "cash.close",
    "cash.supply",
    "cash.view_history",
    "cash.view_reports",
    "products.view",
    "products.create",
    "products.edit",
    "products.delete",
    "products.view_cost",
    "products.import",
    "products.export",
    "customers.view",
    "customers.create",
    "customers.edit",
    "customers.delete",
    "customers.import",
    "customers.export",
    "stock.view",
    "stock.adjust",
    "stock.approve_adjustment",
    "stock.transfer",
    "stock.view_movements",
    "quotes.view",
    "quotes.create",
    "quotes.edit",
    "quotes.cancel",
    "quotes.convert",
    "service_orders.view",
    "service_orders.create",
    "service_orders.edit",
    "service_orders.change_status",
    "service_orders.cancel",
    "suppliers.view",
    "suppliers.create",
    "suppliers.edit",
    "suppliers.delete",
    "suppliers.import",
    "suppliers.export",
    "financial.view_receivables",
    "financial.receive_payment",
    "financial.view_payables",
    "financial.create_payable",
    "financial.pay_bill",
    "reports.view_sales",
    "reports.view_products",
    "reports.view_stock",
    "reports.view_commissions",
    "reports.view_cash_history",
    "reports.view_dre",
    "reports.view_receivables",
    "reports.view_payables",
    "users.view",
    "users.create",
    "users.edit",
    "users.delete",
    "users.manage_permissions",
    "settings.view",
    "settings.edit_company",
    "settings.edit_rules",
    "settings.edit_cashback",
    "settings.edit_commissions",
    "settings.edit_reminders",
    "cashback.view",
    "cashback.adjust",
    "reminders.view",
    "reminders.execute",
    "goals.view",
    "goals.create",
  ],

  // ========== GERENTE: ACESSO AMPLO (sem configurações críticas) ==========
  GERENTE: [
    "sales.view",
    "sales.create",
    "sales.edit",
    "sales.cancel",
    "sales.apply_discount",
    "sales.view_cost",
    "sales.change_seller",
    "cash.view",
    "cash.open",
    "cash.close",
    "cash.supply",
    "cash.view_history",
    "cash.view_reports",
    "products.view",
    "products.create",
    "products.edit",
    "products.view_cost",
    "products.import",
    "products.export",
    "customers.view",
    "customers.create",
    "customers.edit",
    "customers.import",
    "customers.export",
    "stock.view",
    "stock.adjust",
    "stock.approve_adjustment",
    "stock.transfer",
    "stock.view_movements",
    "quotes.view",
    "quotes.create",
    "quotes.edit",
    "quotes.cancel",
    "quotes.convert",
    "service_orders.view",
    "service_orders.create",
    "service_orders.edit",
    "service_orders.change_status",
    "service_orders.cancel",
    "suppliers.view",
    "suppliers.create",
    "suppliers.edit",
    "financial.view_receivables",
    "financial.receive_payment",
    "financial.view_payables",
    "financial.create_payable",
    "financial.pay_bill",
    "reports.view_sales",
    "reports.view_products",
    "reports.view_stock",
    "reports.view_commissions",
    "reports.view_cash_history",
    "reports.view_dre",
    "reports.view_receivables",
    "reports.view_payables",
    "users.view",
    "settings.view",
    "cashback.view",
    "cashback.adjust",
    "reminders.view",
    "reminders.execute",
    "goals.view",
    "goals.create",
  ],

  // ========== VENDEDOR: FOCO EM VENDAS ==========
  VENDEDOR: [
    "sales.view",
    "sales.create",
    "sales.apply_discount", // Desconto limitado
    "products.view",
    "customers.view",
    "customers.create",
    "customers.edit",
    "stock.view",
    "quotes.view",
    "quotes.create",
    "quotes.edit",
    "quotes.convert",
    "service_orders.view",
    "service_orders.create",
    "service_orders.edit",
    "cashback.view",
    "reminders.view",
    "reminders.execute",
    "goals.view",
  ],

  // ========== CAIXA: FOCO EM CAIXA E RECEBIMENTOS ==========
  CAIXA: [
    "sales.view",
    "sales.create",
    "cash.view",
    "cash.open",
    "cash.close",
    "cash.supply",
    "products.view",
    "customers.view",
    "customers.create",
    "financial.view_receivables",
    "financial.receive_payment",
    "cashback.view",
  ],

  // ========== ATENDENTE: FOCO EM ATENDIMENTO BÁSICO ==========
  ATENDENTE: [
    "sales.view",
    "products.view",
    "customers.view",
    "customers.create",
    "quotes.view",
    "quotes.create",
    "service_orders.view",
    "service_orders.create",
    "reminders.view",
    "reminders.execute",
  ],
};

// =========================================================
// FUNÇÃO DE SEED
// =========================================================

export async function seedRolePermissions() {
  console.log("🔐 Iniciando seed de permissões por role...");

  // Primeiro, limpar permissões existentes
  await prisma.rolePermission.deleteMany();
  console.log("🗑️  Permissões de roles antigas removidas");

  let totalCreated = 0;

  for (const [role, permissionCodes] of Object.entries(ROLE_PERMISSIONS_MAP)) {
    console.log(`\n📝 Configurando role: ${role} (${permissionCodes.length} permissões)`);

    for (const code of permissionCodes) {
      // Buscar permissão no catálogo
      const permission = await prisma.permission.findUnique({
        where: { code },
      });

      if (!permission) {
        console.warn(`⚠️  Permissão não encontrada: ${code} (ignorando)`);
        continue;
      }

      // Criar RolePermission
      await prisma.rolePermission.create({
        data: {
          role,
          permissionId: permission.id,
          granted: true,
        },
      });

      totalCreated++;
    }

    console.log(`✅ ${role}: ${permissionCodes.length} permissões configuradas`);
  }

  console.log(`\n✅ Seed concluído: ${totalCreated} permissões de roles criadas`);
}

// Executar se chamado diretamente
if (require.main === module) {
  seedRolePermissions()
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
