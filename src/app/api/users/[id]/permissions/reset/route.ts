import { NextRequest, NextResponse } from "next/server";
import { getCompanyId, requireRole } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { PermissionService } from "@/services/permission.service";

/**
 * DELETE /api/users/[id]/permissions/reset
 * Reseta permissões do usuário para o padrão do role
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCompanyId(); // Valida autenticação
    await requireRole(["ADMIN"]); // Apenas ADMIN pode gerenciar permissões

    const { id: userId } = await params;
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
