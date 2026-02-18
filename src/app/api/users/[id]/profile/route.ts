import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const profileSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, "Senha deve ter pelo menos 6 caracteres").optional(),
});

/**
 * PATCH /api/users/[id]/profile
 * Permite que o próprio usuário atualize seu nome e senha
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Não autenticado" } }, { status: 401 });
    }

    const companyId = await getCompanyId();
    const { id } = await params;

    // Usuário só pode editar o próprio perfil (exceto ADMIN que pode editar qualquer um)
    if (session.user.id !== id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Sem permissão para editar este perfil" } }, { status: 403 });
    }

    const body = await request.json();
    const data = profileSchema.parse(body);

    // Buscar usuário atual
    const user = await prisma.user.findFirst({
      where: { id, companyId },
      select: { id: true, passwordHash: true, name: true },
    });

    if (!user) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Usuário não encontrado" } }, { status: 404 });
    }

    // Montar dados de update
    const updateData: Record<string, unknown> = { name: data.name };

    // Se quer trocar a senha
    if (data.newPassword) {
      if (!data.currentPassword) {
        return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Informe a senha atual para alterar a senha" } }, { status: 400 });
      }

      const isValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
      if (!isValid) {
        return NextResponse.json({ error: { code: "INVALID_PASSWORD", message: "Senha atual incorreta" } }, { status: 400 });
      }

      updateData.passwordHash = await bcrypt.hash(data.newPassword, 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true },
    });

    return successResponse(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
