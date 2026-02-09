import { NextRequest, NextResponse } from "next/server";
import { getCompanyId, requireRole } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { PermissionService } from "@/services/permission.service";

/**
 * GET /api/users/[id]/permissions
 * Retorna permissões efetivas do usuário
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCompanyId(); // Valida autenticação

    const { id: userId } = await params;
    const service = new PermissionService();

    const permissions = await service.getUserEffectivePermissions(userId);

    return NextResponse.json(permissions);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/users/[id]/permissions
 * Adiciona ou remove permissão customizada
 *
 * Body: { code: string, granted: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCompanyId(); // Valida autenticação
    await requireRole(["ADMIN"]); // Apenas ADMIN pode gerenciar permissões

    const { id: userId } = await params;
    const body = await request.json();

    const { code, granted } = body;

    if (!code || typeof granted !== "boolean") {
      return NextResponse.json(
        { error: "Campos 'code' e 'granted' são obrigatórios" },
        { status: 400 }
      );
    }

    const service = new PermissionService();
    await service.setUserPermission(userId, code, granted);

    return NextResponse.json({
      success: true,
      message: granted
        ? "Permissão adicionada com sucesso"
        : "Permissão removida com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/users/[id]/permissions
 * Atualiza múltiplas permissões de uma vez
 *
 * Body: { permissions: Array<{ code: string, granted: boolean }> }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCompanyId(); // Valida autenticação
    await requireRole(["ADMIN"]); // Apenas ADMIN pode gerenciar permissões

    const { id: userId } = await params;
    const body = await request.json();

    const { permissions } = body;

    if (!Array.isArray(permissions)) {
      return NextResponse.json(
        { error: "Campo 'permissions' deve ser um array" },
        { status: 400 }
      );
    }

    const service = new PermissionService();
    await service.setMultipleUserPermissions(userId, permissions);

    return NextResponse.json({
      success: true,
      message: "Permissões atualizadas com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
