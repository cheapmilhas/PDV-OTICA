/**
 * Verifica login no PDV (model User) e no painel admin (AdminUser).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const login = process.argv[2];
  const password = process.argv[3];

  console.log(`\n=== USER (login do PDV) ===`);
  const users = await prisma.user.findMany({
    where: { OR: [{ email: login }, { email: `${login.toLowerCase()}@login` }] },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      passwordHash: true,
      company: { select: { name: true } },
    },
  });
  if (users.length === 0) console.log("  (nenhum)");
  for (const u of users) {
    console.log(`  ${u.name} <${u.email}> role=${u.role} active=${u.active} hash=${!!u.passwordHash} company=${u.company?.name}`);
    if (password && u.passwordHash) {
      const ok = await bcrypt.compare(password, u.passwordHash);
      console.log(`  senha → ${ok ? "✅ OK" : "❌ NAO"}`);
    }
  }

  console.log(`\n=== ADMIN USER (painel /admin) ===`);
  try {
    const admins = await prisma.adminUser.findMany({
      where: { email: login },
      select: { id: true, name: true, email: true, role: true, active: true, passwordHash: true },
    });
    if (admins.length === 0) console.log("  (nenhum)");
    for (const a of admins) {
      console.log(`  ${a.name} <${a.email}> role=${a.role} active=${a.active} hash=${!!a.passwordHash}`);
      if (password && a.passwordHash) {
        const ok = await bcrypt.compare(password, a.passwordHash);
        console.log(`  senha → ${ok ? "✅ OK" : "❌ NAO"}`);
      }
    }
  } catch (e) {
    console.log("  (model AdminUser não existe:", (e as Error).message.slice(0, 80), ")");
  }

  console.log(`\n=== SUGESTÃO: primeiros 5 admins ativos ===`);
  const sugest = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { name: true, email: true, company: { select: { name: true } } },
    take: 5,
  });
  for (const u of sugest) {
    console.log(`  ${u.name} <${u.email}> (${u.company?.name})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
