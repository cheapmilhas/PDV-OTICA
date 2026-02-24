import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { z } from "zod";

const updateAdminSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "SUPPORT", "BILLING"]).optional(),
  active: z.boolean().optional(),
});

/**
 * PATCH /api/admin/users/[id]
 * Atualiza um usuário admin
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Apenas SUPER_ADMIN pode editar usuários admin" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const data = updateAdminSchema.parse(body);

    const existing = await prisma.adminUser.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Admin não encontrado" }, { status: 404 });
    }

    // Impedir que SUPER_ADMIN se desative
    if (id === admin.id && data.active === false) {
      return NextResponse.json({ error: "Você não pode desativar sua própria conta" }, { status: 400 });
    }

    const updated = await prisma.adminUser.update({
      where: { id },
      data,
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

    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        action: "ADMIN_USER_UPDATED",
        metadata: { targetAdminId: id, targetAdminEmail: existing.email, changes: data, adminEmail: admin.email },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos", details: error.issues }, { status: 400 });
    }
    console.error("[ADMIN-USERS] Erro ao atualizar admin:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Desativa um admin (soft delete via active = false)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Apenas SUPER_ADMIN pode remover usuários admin" }, { status: 403 });
  }

  const { id } = await params;

  if (id === admin.id) {
    return NextResponse.json({ error: "Você não pode desativar sua própria conta" }, { status: 400 });
  }

  const existing = await prisma.adminUser.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Admin não encontrado" }, { status: 404 });
  }

  await prisma.adminUser.update({
    where: { id },
    data: { active: false },
  });

  await prisma.globalAudit.create({
    data: {
      actorType: "ADMIN_USER",
      actorId: admin.id,
      action: "ADMIN_USER_DEACTIVATED",
      metadata: { targetAdminId: id, targetAdminEmail: existing.email, adminEmail: admin.email },
    },
  });

  return NextResponse.json({ message: "Admin desativado com sucesso" });
}
