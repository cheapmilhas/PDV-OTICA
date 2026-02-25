import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Params = { params: Promise<{ id: string; userId: string }> };

/**
 * GET /api/admin/companies/[id]/users/[userId]
 * Retorna dados completos de um usuário
 */
export async function GET(request: NextRequest, context: Params) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId, userId } = await context.params;

  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      branches: {
        select: {
          branch: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    ...user,
    branches: user.branches.map((ub) => ub.branch),
  });
}

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(["ADMIN", "GERENTE", "VENDEDOR", "CAIXA", "ATENDENTE"]).optional(),
  active: z.boolean().optional(),
  branchId: z.string().optional(),
});

/**
 * PATCH /api/admin/companies/[id]/users/[userId]
 * Atualiza dados de um usuário
 */
export async function PATCH(request: NextRequest, context: Params) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId, userId } = await context.params;

  // Verificar que o usuário pertence à empresa
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name, email, role, active, branchId } = parsed.data;

  // Verificar email duplicado se alterando
  if (email && email !== user.email) {
    const existing = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), id: { not: userId } },
    });
    if (existing) {
      return NextResponse.json({ error: "Email já em uso" }, { status: 400 });
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          ...(name && { name: name.trim() }),
          ...(email && { email: email.toLowerCase().trim() }),
          ...(role && { role: role as any }),
          ...(active !== undefined && { active }),
        },
      });

      // Se alterando branch, atualizar UserBranch
      if (branchId) {
        // Remover vínculos anteriores
        await tx.userBranch.deleteMany({ where: { userId } });
        await tx.userBranch.create({
          data: { userId, branchId },
        });
      }

      // Auditoria
      await tx.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: admin.id,
          companyId,
          action: active === false ? "USER_DEACTIVATED" : "USER_UPDATED",
          metadata: {
            userId,
            changes: parsed.data,
            source: "admin_portal",
          },
        },
      });

      return updatedUser;
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        active: updated.active,
      },
    });
  } catch (error: any) {
    console.error("[UPDATE_USER]", error);
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Email já em uso" }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao atualizar usuário" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/companies/[id]/users/[userId]
 * Desativa o usuário (soft delete)
 */
export async function DELETE(request: NextRequest, context: Params) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId, userId } = await context.params;

  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { active: false },
    });

    await tx.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        companyId,
        action: "USER_DEACTIVATED",
        metadata: {
          userId,
          userEmail: user.email,
          source: "admin_portal",
        },
      },
    });
  });

  return NextResponse.json({ success: true });
}
