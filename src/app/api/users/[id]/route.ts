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
