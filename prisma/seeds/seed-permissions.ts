import { prisma } from "../../src/lib/prisma";
import { PERMISSIONS_CATALOG } from "./permissions-catalog";
import { ROLE_PERMISSIONS_MAP } from "./role-permissions-map";

async function seedPermissions() {
  console.log("🌱 Iniciando seed de permissões...\n");

  try {
    // 1. Limpar dados existentes
    console.log("🗑️  Limpando permissões existentes...");
    await prisma.userPermission.deleteMany({});
    await prisma.rolePermission.deleteMany({});
    await prisma.permission.deleteMany({});
    console.log("✅ Dados limpos\n");

    // 2. Criar catálogo de permissões
    console.log(`📋 Criando catálogo de ${PERMISSIONS_CATALOG.length} permissões...`);

    const permissionsCreated = await prisma.permission.createMany({
      data: PERMISSIONS_CATALOG.map((perm) => ({
        code: perm.code,
        name: perm.name,
        description: perm.description || null,
        module: perm.module,
        category: perm.category,
        sortOrder: perm.sortOrder,
        isActive: true,
      })),
    });

    console.log(`✅ ${permissionsCreated.count} permissões criadas\n`);

    // 3. Buscar todas as permissões criadas
    const allPermissions = await prisma.permission.findMany({
      select: { id: true, code: true },
    });

    const permissionMap = new Map(
      allPermissions.map((p) => [p.code, p.id])
    );

    // 4. Criar permissões padrão por role
    console.log("👥 Criando permissões padrão por role...");

    const roleNames = Object.keys(ROLE_PERMISSIONS_MAP);
    let totalRolePermissions = 0;

    for (const role of roleNames) {
      const permissionCodes = ROLE_PERMISSIONS_MAP[role];
      const rolePermissionsData = [];

      for (const code of permissionCodes) {
        const permissionId = permissionMap.get(code);
        if (permissionId) {
          rolePermissionsData.push({
            role,
            permissionId,
            granted: true,
          });
        } else {
          console.warn(`⚠️  Permissão não encontrada: ${code}`);
        }
      }

      if (rolePermissionsData.length > 0) {
        await prisma.rolePermission.createMany({
          data: rolePermissionsData,
        });

        totalRolePermissions += rolePermissionsData.length;
        console.log(`  ✓ ${role}: ${rolePermissionsData.length} permissões`);
      }
    }

    console.log(`✅ ${totalRolePermissions} permissões de role criadas\n`);

    // 5. Resumo
    console.log("📊 Resumo:");
    console.log(`  • ${permissionsCreated.count} permissões no catálogo`);
    console.log(`  • ${roleNames.length} roles configurados`);
    console.log(`  • ${totalRolePermissions} permissões padrão por role`);

    console.log("\n🎉 Seed concluído com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao executar seed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedPermissions()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
