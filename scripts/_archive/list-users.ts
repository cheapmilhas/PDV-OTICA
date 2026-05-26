/**
 * Script para listar todos os usuários do sistema
 * Execute: npx tsx scripts/list-users.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n📋 Listando usuários do sistema...\n");

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      company: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      role: "asc",
    },
  });

  if (users.length === 0) {
    console.log("❌ Nenhum usuário encontrado no banco de dados");
    console.log("\n💡 Execute o seed para criar usuários:");
    console.log("   npx prisma db seed\n");
    return;
  }

  console.log(`✅ ${users.length} usuário(s) encontrado(s):\n`);

  // Agrupar por role
  const byRole = users.reduce((acc, user) => {
    if (!acc[user.role]) acc[user.role] = [];
    acc[user.role].push(user);
    return acc;
  }, {} as Record<string, typeof users>);

  // Mostrar por role
  Object.entries(byRole).forEach(([role, roleUsers]) => {
    console.log(`\n🔹 ${role} (${roleUsers.length}):`);
    roleUsers.forEach((user) => {
      const status = user.active ? "✅ Ativo" : "❌ Inativo";
      console.log(`   • ${user.name}`);
      console.log(`     Email: ${user.email}`);
      console.log(`     Status: ${status}`);
      console.log(`     Empresa: ${user.company?.name || "N/A"}`);
      console.log();
    });
  });

  console.log("\n📝 Credenciais padrão (se criadas pelo seed):");
  console.log("   ADMIN:     admin@pdvotica.com / admin123");
  console.log("   GERENTE:   gerente@pdvotica.com / gerente123");
  console.log("   VENDEDOR:  vendedor@pdvotica.com / vendedor123");
  console.log("   CAIXA:     caixa@pdvotica.com / caixa123");
  console.log("   ATENDENTE: atendente@pdvotica.com / atendente123\n");
}

main()
  .then(() => {
    console.log("✅ Listagem concluída!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Erro:", error);
    process.exit(1);
  });
