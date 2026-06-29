import { NextRequest, NextResponse } from "next/server";
import { getCompanyId, requireRole } from "@/lib/auth-helpers";
import { handleApiError, notFoundError } from "@/lib/error-handler";
import { PermissionService } from "@/services/permission.service";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/users/[id]/permissions/reset
 * Reseta permissões do usuário para o padrão do role
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCompanyId(); // Valida autenticação
    await requireRole(["ADMIN"]); // Apenas ADMIN pode gerenciar permissões

    const { id: userId } = await params;

    // IDOR: garantir que o usuário alvo pertence ao mesmo tenant da sessão.
    // Sem isso, um ADMIN da empresa A poderia resetar permissões de usuário
    // da empresa B se conhecesse (ou enumerasse) o ID.
    const target = await prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { id: true },
    });
    if (!target) {
      throw notFoundError("Usuário não encontrado");
    }

    const service = new PermissionService();

    await service.resetUserPermissionsToDefault(userId);

    return NextResponse.json({
      success: true,
      message: "Permissões resetadas para o padrão do role",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
