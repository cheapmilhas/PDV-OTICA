/**
 * Reset de senha de um AdminUser (super-admin do SaaS).
 *
 * NÃO guarda nem imprime a senha; gera o hash bcrypt (mesma lib do login,
 * bcryptjs) e atualiza o registro. Use variáveis de ambiente para não deixar a
 * senha no histórico do shell.
 *
 * Uso:
 *   ADMIN_EMAIL="voce@exemplo.com" ADMIN_NEW_PASSWORD="suaNovaSenhaForte" \
 *     npx tsx scripts/reset-admin-password.ts
 *
 * Sem ADMIN_EMAIL, lista os admins existentes (e-mail, nome, papel, ativo) para
 * você descobrir qual resetar — nunca mostra hash nem senha.
 *
 * Requer DATABASE_URL apontando para o banco alvo (produção = o mesmo da app).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const newPassword = process.env.ADMIN_NEW_PASSWORD;

  if (!email) {
    const admins = await prisma.adminUser.findMany({
      select: { email: true, name: true, role: true, active: true, lastLoginAt: true },
      orderBy: { createdAt: "asc" },
    });
    if (admins.length === 0) {
      console.log("Nenhum AdminUser cadastrado. (Para criar o primeiro, use o script de criação.)");
    } else {
      console.log(`AdminUsers cadastrados (${admins.length}):`);
      for (const a of admins) {
        console.log(
          `  - ${a.email} · ${a.name} · ${a.role} · ${a.active ? "ativo" : "inativo"}` +
            (a.lastLoginAt ? ` · último login ${a.lastLoginAt.toISOString()}` : " · nunca logou")
        );
      }
      console.log("\nRode de novo com ADMIN_EMAIL e ADMIN_NEW_PASSWORD para resetar.");
    }
    return;
  }

  if (!newPassword || newPassword.length < 8) {
    console.error("ADMIN_NEW_PASSWORD ausente ou curta (mínimo 8 caracteres).");
    process.exitCode = 1;
    return;
  }

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) {
    console.error(`Nenhum AdminUser com e-mail "${email}". Rode sem ADMIN_EMAIL para listar.`);
    process.exitCode = 1;
    return;
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.adminUser.update({
    where: { email },
    data: { password: hash, active: true },
  });

  console.log(`✅ Senha redefinida para ${admin.email} (${admin.role}). Conta marcada como ativa.`);
  console.log("   Faça login em /admin/login com a nova senha. (A senha não foi registrada em lugar nenhum.)");
}

main()
  .catch((e) => {
    console.error("Erro:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
