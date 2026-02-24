import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/seed
 * Cria o admin user padrão se não existir.
 * REMOVER EM PRODUÇÃO após uso.
 */
export async function POST() {
  try {
    const email = "admin@pdvotica.com.br";
    const password = "admin123";

    const existing = await prisma.adminUser.findUnique({ where: { email } });

    if (existing) {
      // Resetar a senha para admin123
      const hash = await bcrypt.hash(password, 10);
      await prisma.adminUser.update({
        where: { email },
        data: { password: hash, active: true },
      });
      return NextResponse.json({
        message: "Admin já existia — senha resetada para admin123",
        email,
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const admin = await prisma.adminUser.create({
      data: {
        email,
        name: "Administrador",
        password: hash,
        role: "SUPER_ADMIN",
        active: true,
      },
    });

    return NextResponse.json({
      message: "Admin criado com sucesso",
      email: admin.email,
      role: admin.role,
    }, { status: 201 });
  } catch (error) {
    console.error("[ADMIN-SEED] Erro:", error);
    return NextResponse.json({ error: "Erro ao criar admin" }, { status: 500 });
  }
}
