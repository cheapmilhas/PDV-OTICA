import { NextResponse } from "next/server";
import { userService } from "@/services/user.service";
import {
  updateUserSchema,
  sanitizeUserDTO,
  type UpdateUserDTO,
} from "@/lib/validations/user.schema";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/users/[id]
 * Retorna detalhes de um usuário específico
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    // Incluir usuários inativos também
    const user = await userService.getById(id, companyId, true);

    return successResponse(user);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/users/[id]
 * Atualiza um usuário
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("users.edit");
    const { id } = await params;

    const body = await request.json();
    const data = updateUserSchema.parse(body);
    const sanitizedData = sanitizeUserDTO(data) as UpdateUserDTO;

    const user = await userService.update(
      id,
      sanitizedData,
      companyId
    );

    return successResponse(user);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/users/[id]
 * Altera a senha de um usuário
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requirePermission("users.edit");
    const companyId = await getCompanyId();
    const { id } = await params;

    const body = await request.json();
    const { password } = body;

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: { message: "Senha deve ter pelo menos 8 caracteres" } },
        { status: 400 }
      );
    }

    // Verificar se user pertence à empresa
    const user = await prisma.user.findFirst({ where: { id, companyId } });
    if (!user) {
      return NextResponse.json(
        { error: { message: "Usuário não encontrado" } },
        { status: 404 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return successResponse({ message: "Senha alterada com sucesso" });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/users/[id]
 * Desativa (soft delete) um usuário
 * Se ?permanent=true, deleta permanentemente do banco de dados
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("users.delete");
    const { id } = await params;

    // Verifica se é delete permanente
    const { searchParams } = new URL(request.url);
    const isPermanent = searchParams.get("permanent") === "true";

    if (isPermanent) {
      await userService.hardDelete(id, companyId);
      return successResponse({ message: "Usuário excluído permanentemente" });
    } else {
      await userService.delete(id, companyId);
      return successResponse({ message: "Usuário desativado com sucesso" });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
