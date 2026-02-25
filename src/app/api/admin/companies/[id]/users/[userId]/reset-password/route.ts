import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";

const resetSchema = z.object({
  newPassword: z.string().min(8, "Senha deve ter no mínimo 8 caracteres").optional(),
});

/**
 * POST /api/admin/companies/[id]/users/[userId]/reset-password
 * Reseta a senha de um usuário. Gera senha automática se não fornecida.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId, userId } = await context.params;

  // Verificar que o usuário pertence à empresa
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Gerar senha automática se não fornecida
  let password = parsed.data?.newPassword;
  if (!password) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    password = "Otica@";
    for (let i = 0; i < 4; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await tx.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        companyId,
        action: "USER_PASSWORD_RESET",
        metadata: {
          userId,
          userEmail: user.email,
          source: "admin_portal",
        },
      },
    });
  });

  return NextResponse.json({
    success: true,
    temporaryPassword: password,
  });
}
