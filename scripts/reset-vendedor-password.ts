/**
 * Script para resetar a senha do vendedor
 * Execute: npx tsx scripts/reset-vendedor-password.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("\n🔧 Resetando senha do vendedor...\n");

  // Buscar vendedor
  const vendedor = await prisma.user.findUnique({
    where: { email: "vendedor@pdvotica.com" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  if (!vendedor) {
    console.log("❌ Vendedor não encontrado!");
    console.log("\n💡 Certifique-se de que existe um usuário com email: vendedor@pdvotica.com\n");
    return;
  }

  console.log("✅ Vendedor encontrado:");
  console.log(`   Nome: ${vendedor.name}`);
  console.log(`   Email: ${vendedor.email}`);
  console.log(`   Role: ${vendedor.role}\n`);

  // Nova senha
  const novaSenha = "vendedor123";
  const passwordHash = await bcrypt.hash(novaSenha, 10);

  // Atualizar senha
  await prisma.user.update({
    where: { id: vendedor.id },
    data: { passwordHash },
  });

  console.log("✅ Senha resetada com sucesso!\n");
  console.log("📝 Credenciais do VENDEDOR:");
  console.log(`   Email: ${vendedor.email}`);
  console.log(`   Senha: ${novaSenha}\n`);

  console.log("🧪 Teste agora:");
  console.log("   1. Acesse: http://localhost:3000/api/auth/clear-session");
  console.log("   2. Faça logout completo");
  console.log(`   3. Faça login com: ${vendedor.email} / ${novaSenha}`);
  console.log("   4. Verifique se logou como VENDEDOR\n");
}

main()
  .then(() => {
    console.log("✅ Concluído!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Erro:", error);
    process.exit(1);
  });
