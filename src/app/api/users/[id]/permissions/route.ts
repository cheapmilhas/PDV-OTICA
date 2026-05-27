import { NextRequest, NextResponse } from "next/server";
import { getCompanyId, requireRole } from "@/lib/auth-helpers";
import { handleApiError, forbiddenError, notFoundError } from "@/lib/error-handler";
import { PermissionService } from "@/services/permission.service";
import { prisma } from "@/lib/prisma";

/**
 * Garante que o `userId` alvo pertence ao mesmo tenant da sessão.
 * Sem isso, um ADMIN da empresa A poderia ler/alterar permissões de
 * usuário da empresa B se conhecesse (ou enumerasse) o ID — IDOR.
 */
async function assertUserBelongsToCompany(userId: string, companyId: string) {
  const target = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true },
  });
  if (!target) {
    throw notFoundError("Usuário não encontrado");
  }
}

/**
 * GET /api/users/[id]/permissions
 * Retorna permissões efetivas do usuário
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCompanyId();

    const { id: userId } = await params;
    await assertUserBelongsToCompany(userId, companyId);

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
    const companyId = await getCompanyId();
    await requireRole(["ADMIN"]); // Apenas ADMIN pode gerenciar permissões

    const { id: userId } = await params;
    await assertUserBelongsToCompany(userId, companyId);

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
    const companyId = await getCompanyId();
    await requireRole(["ADMIN"]); // Apenas ADMIN pode gerenciar permissões

    const { id: userId } = await params;
    await assertUserBelongsToCompany(userId, companyId);

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
