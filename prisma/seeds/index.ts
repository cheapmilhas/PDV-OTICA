/**
 * =========================================================
 * SEED PRINCIPAL - SISTEMA DE PERMISSÕES
 * =========================================================
 *
 * Executa todos os seeds de permissões na ordem correta:
 * 1. Catálogo de Permissões
 * 2. Permissões padrão por Role
 */

import { seedPermissions } from "./permissions.seed";
import { seedRolePermissions } from "./role-permissions.seed";

async function main() {
  console.log("🚀 Iniciando seed do sistema de permissões...\n");

  try {
    // 1. Popular catálogo de permissões
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("ETAPA 1: Catálogo de Permissões");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    await seedPermissions();

    // 2. Popular permissões padrão por role
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("ETAPA 2: Permissões Padrão por Role");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    await seedRolePermissions();

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ SEED COMPLETO!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("📋 Próximos passos:");
    console.log("   1. Execute: npm run seed:permissions");
    console.log("   2. Acesse: /dashboard/configuracoes/permissoes");
    console.log("   3. Customize permissões individuais em /dashboard/funcionarios/[id]/permissoes\n");
  } catch (error) {
    console.error("❌ Erro durante o seed:", error);
    throw error;
  }
}

main()
  .then(() => {
    console.log("🎉 Processo finalizado com sucesso!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Falha no processo de seed:", error);
    process.exit(1);
  });
