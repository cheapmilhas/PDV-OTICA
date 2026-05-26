/**
 * Script para testar login de um usuário
 * Execute: npx tsx scripts/test-login.ts vendedor@pdvotica.com vendedor123
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || "vendedor@pdvotica.com";
  const password = process.argv[3] || "vendedor123";

  console.log(`\n🔐 Testando login...`);
  console.log(`   Email: ${email}`);
  console.log(`   Senha: ${password}\n`);

  // Buscar usuário
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
      active: true,
    },
  });

  if (!user) {
    console.log(`❌ Usuário não encontrado com email: ${email}\n`);
    return;
  }

  console.log(`✅ Usuário encontrado:`);
  console.log(`   Nome: ${user.name}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Role: ${user.role}`);
  console.log(`   Ativo: ${user.active ? "Sim" : "Não"}\n`);

  // Testar senha
  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (isValid) {
    console.log(`✅ SENHA CORRETA!`);
    console.log(`\n🎉 Login bem-sucedido!`);
    console.log(`   Você logaria como: ${user.name} (${user.role})\n`);
  } else {
    console.log(`❌ SENHA INCORRETA!`);
    console.log(`\n💡 A senha "${password}" não está correta para este usuário.`);
    console.log(`   Tente resetar a senha executando:`);
    console.log(`   npx tsx scripts/reset-vendedor-password.ts\n`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Erro:", error);
    process.exit(1);
  });
