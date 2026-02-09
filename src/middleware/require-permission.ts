import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { PermissionService } from "@/services/permission.service";

/**
 * Middleware para proteger rotas baseado em permissões
 *
 * Uso:
 * ```ts
 * export async function POST(request: NextRequest) {
 *   await requirePermission(request, "sales.cancel");
 *
 *   // ... resto do código
 * }
 * ```
 */
export async function requirePermission(
  request: NextRequest,
  permissionCode: string
): Promise<void> {
  // 1. Verificar autenticação
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Não autenticado");
  }

  // 2. Verificar permissão
  const service = new PermissionService();
  const hasPermission = await service.userHasPermission(
    session.user.id,
    permissionCode
  );

  if (!hasPermission) {
    throw new Error(
      `Sem permissão: ${permissionCode}. Entre em contato com o administrador.`
    );
  }
}

/**
 * Helper para criar response de erro 403
 */
export function forbiddenResponse(message?: string) {
  return NextResponse.json(
    {
      error: message || "Você não tem permissão para realizar esta ação",
      code: "FORBIDDEN",
    },
    { status: 403 }
  );
}

/**
 * Verifica múltiplas permissões (precisa ter TODAS)
 */
export async function requireAllPermissions(
  request: NextRequest,
  permissions: string[]
): Promise<void> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Não autenticado");
  }

  const service = new PermissionService();
  const { effectivePermissions } =
    await service.getUserEffectivePermissions(session.user.id);

  const hasAll = permissions.every((perm) =>
    effectivePermissions.includes(perm)
  );

  if (!hasAll) {
    throw new Error("Sem permissão para realizar esta ação");
  }
}

/**
 * Verifica múltiplas permissões (precisa ter PELO MENOS UMA)
 */
export async function requireAnyPermission(
  request: NextRequest,
  permissions: string[]
): Promise<void> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Não autenticado");
  }

  const service = new PermissionService();
  const { effectivePermissions } =
    await service.getUserEffectivePermissions(session.user.id);

  const hasAny = permissions.some((perm) =>
    effectivePermissions.includes(perm)
  );

  if (!hasAny) {
    throw new Error("Sem permissão para realizar esta ação");
  }
}
