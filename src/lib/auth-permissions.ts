import { auth } from "@/auth";
import { Permission, hasPermission, UserRole } from "./permissions";

/**
 * Verifica se o usuário autenticado tem uma permissão específica
 * @throws Error se não estiver autenticado ou não tiver permissão
 */
export async function requirePermission(permission: Permission) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Usuário não autenticado");
  }

  const userRole = session.user.role as UserRole;

  if (!hasPermission(userRole, permission)) {
    throw new Error("Você não tem permissão para realizar esta ação");
  }

  return session;
}

/**
 * Verifica se o usuário autenticado tem todas as permissões especificadas
 * @throws Error se não estiver autenticado ou não tiver todas as permissões
 */
export async function requireAllPermissions(permissions: Permission[]) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Usuário não autenticado");
  }

  const userRole = session.user.role as UserRole;

  for (const permission of permissions) {
    if (!hasPermission(userRole, permission)) {
      throw new Error("Você não tem permissão para realizar esta ação");
    }
  }

  return session;
}

/**
 * Verifica se o usuário autenticado tem pelo menos uma das permissões especificadas
 * @throws Error se não estiver autenticado ou não tiver nenhuma das permissões
 */
export async function requireAnyPermission(permissions: Permission[]) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Usuário não autenticado");
  }

  const userRole = session.user.role as UserRole;

  const hasAnyPermission = permissions.some(permission =>
    hasPermission(userRole, permission)
  );

  if (!hasAnyPermission) {
    throw new Error("Você não tem permissão para realizar esta ação");
  }

  return session;
}

/**
 * Retorna a session se o usuário estiver autenticado e tiver a permissão
 * Retorna null se não tiver permissão (sem lançar erro)
 */
export async function checkPermission(permission: Permission) {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;

    const userRole = session.user.role as UserRole;
    return hasPermission(userRole, permission) ? session : null;
  } catch {
    return null;
  }
}
