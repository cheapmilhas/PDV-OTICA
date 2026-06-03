import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding mock data for development...");

  // 1. Criar Company
  const company = await prisma.company.upsert({
    where: { id: "mock-company-id" },
    update: {},
    create: {
      id: "mock-company-id",
      name: "Ótica Mock (Dev)",
      tradeName: "Ótica Mock",
      cnpj: "00000000000000",
      phone: "(85) 0000-0000",
      email: "contato@oticamock.com",
    },
  });

  console.log("✅ Company created:", company.name);

  // 2. Criar Branch
  const branch = await prisma.branch.upsert({
    where: { id: "mock-branch-id" },
    update: {},
    create: {
      id: "mock-branch-id",
      companyId: company.id,
      name: "Filial Principal (Mock)",
      code: "MOCK01",
      address: "Rua Mock, 123",
      city: "Fortaleza",
      state: "CE",
      zipCode: "60000-000",
      phone: "(85) 0000-0000",
      active: true,
    },
  });

  console.log("✅ Branch created:", branch.name);

  // 3. Criar User (senha: admin123)
  const passwordHash = await bcrypt.hash("admin123", 10);

  // email deixou de ser @unique global (Q8.4) → não dá pra upsert por email.
  // Busca por (companyId,email) e cria/atualiza por id.
  const existing = await prisma.user.findFirst({
    where: { companyId: company.id, email: "admin@pdvotica.com" },
    select: { id: true },
  });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash, // Atualiza a senha se o usuário já existe
          name: "Admin Mock",
          role: "ADMIN",
          active: true,
        },
      })
    : await prisma.user.create({
        data: {
          id: "mock-user-id",
          companyId: company.id,
          name: "Admin Mock",
          email: "admin@pdvotica.com",
          passwordHash,
          role: "ADMIN",
          active: true,
        },
      });

  console.log("✅ User created:", user.name);

  // 4. Vincular User ao Branch
  await prisma.userBranch.upsert({
    where: {
      userId_branchId: {
        userId: user.id,
        branchId: branch.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      branchId: branch.id,
    },
  });

  console.log("✅ User linked to Branch");

  console.log("\n🎉 Mock data seeded successfully!");
  console.log("📧 Email: admin@pdvotica.com");
  console.log("🔑 Password: admin123");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
