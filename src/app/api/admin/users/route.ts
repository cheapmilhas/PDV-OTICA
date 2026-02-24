import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { z } from "zod";
import bcrypt from "bcryptjs";

const createAdminSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "SUPPORT", "BILLING"]),
});

/**
 * GET /api/admin/users
 * Lista todos os usuários admin
 */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: admins });
}

/**
 * POST /api/admin/users
 * Cria um novo usuário admin (apenas SUPER_ADMIN)
 */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Apenas SUPER_ADMIN pode criar usuários admin" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const data = createAdminSchema.parse(body);

    const existing = await prisma.adminUser.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json({ error: "Já existe um admin com este email" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const newAdmin = await prisma.adminUser.create({
      data: {
        name: data.name,
        email: data.email,
        password: passwordHash,
        role: data.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        action: "ADMIN_USER_CREATED",
        metadata: { newAdminEmail: newAdmin.email, newAdminRole: newAdmin.role, adminEmail: admin.email },
      },
    });

    return NextResponse.json({ data: newAdmin }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos", details: error.issues }, { status: 400 });
    }
    console.error("[ADMIN-USERS] Erro ao criar admin:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
