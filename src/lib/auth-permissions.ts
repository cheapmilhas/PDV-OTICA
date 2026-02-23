import { auth } from "@/auth";
import { Permission } from "./permissions";
import { unauthorizedError, forbiddenError } from "./error-handler";
import { PermissionService } from "@/services/permission.service";

const permissionService = new PermissionService();

/**
 * Verifica se o usuário autenticado tem uma permissão específica.
 * Consulta o BANCO (RolePermission + UserPermission overrides).
 * ADMIN sempre passa.
 *
 * @throws AppError 401 se não autenticado
 * @throws AppError 403 se não tiver permissão
 */
export async function requirePermission(permission: Permission | string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw unauthorizedError("Usuário não autenticado");
  }

  // ADMIN sempre tem todas as permissões
  if (session.user.role === "ADMIN") {
    return session;
  }

  const hasIt = await permissionService.userHasPermission(
    session.user.id,
    permission as string
  );

  if (!hasIt) {
    throw forbiddenError(
      `Sem permissão: ${permission}`
    );
  }

  return session;
}

/**
 * Verifica se o usuário autenticado tem todas as permissões especificadas
 * @throws AppError 401 se não autenticado
 * @throws AppError 403 se não tiver todas as permissões
 */
export async function requireAllPermissions(permissions: (Permission | string)[]) {
  const session = await auth();

  if (!session?.user?.id) {
    throw unauthorizedError("Usuário não autenticado");
  }

  if (session.user.role === "ADMIN") {
    return session;
  }

  const { effectivePermissions } =
    await permissionService.getUserEffectivePermissions(session.user.id);

  for (const permission of permissions) {
    if (!effectivePermissions.includes(permission as string)) {
      throw forbiddenError(
        `Sem permissão: ${permission}`
      );
    }
  }

  return session;
}

/**
 * Verifica se o usuário autenticado tem pelo menos uma das permissões especificadas
 * @throws AppError 401 se não autenticado
 * @throws AppError 403 se não tiver nenhuma das permissões
 */
export async function requireAnyPermission(permissions: (Permission | string)[]) {
  const session = await auth();

  if (!session?.user?.id) {
    throw unauthorizedError("Usuário não autenticado");
  }

  if (session.user.role === "ADMIN") {
    return session;
  }

  const { effectivePermissions } =
    await permissionService.getUserEffectivePermissions(session.user.id);

  const hasAny = permissions.some((p) =>
    effectivePermissions.includes(p as string)
  );

  if (!hasAny) {
    throw forbiddenError(
      `Sem permissão para nenhuma de: ${permissions.join(", ")}`
    );
  }

  return session;
}

/**
 * Retorna a session se o usuário estiver autenticado e tiver a permissão.
 * Retorna null se não tiver (sem lançar erro).
 */
export async function checkPermissionFromDB(permission: Permission | string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;

    if (session.user.role === "ADMIN") return session;

    const hasIt = await permissionService.userHasPermission(
      session.user.id,
      permission as string
    );

    return hasIt ? session : null;
  } catch {
    return null;
  }
}
