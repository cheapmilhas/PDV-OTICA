import { auth } from "@/auth";
import { UserRole } from "@prisma/client";
import { unauthorizedError, forbiddenError } from "./error-handler";
import type { Session } from "next-auth";

/**
 * Requer que o usuário esteja autenticado
 *
 * @throws {AppError} 401 se não autenticado
 * @returns Session do usuário
 *
 * @example
 * ```ts
 * export async function GET(request: Request) {
 *   const session = await requireAuth()
 *   // session.user.id, session.user.role, etc.
 * }
 * ```
 */
export async function requireAuth(): Promise<Session> {
  const session = await auth();

  if (!session || !session.user) {
    throw unauthorizedError("Você precisa estar autenticado para acessar este recurso");
  }

  return session;
}

/**
 * Requer que o usuário tenha uma das roles permitidas
 *
 * @param allowedRoles Array de roles permitidas
 * @throws {AppError} 401 se não autenticado
 * @throws {AppError} 403 se não autorizado
 *
 * @example
 * ```ts
 * export async function DELETE(request: Request) {
 *   await requireRole(['ADMIN', 'GERENTE'])
 *   // Apenas ADMIN e GERENTE chegam aqui
 * }
 * ```
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<void> {
  const session = await requireAuth();

  if (!allowedRoles.includes(session.user.role)) {
    throw forbiddenError(
      `Esta ação requer uma das seguintes permissões: ${allowedRoles.join(", ")}`
    );
  }
}

/**
 * Retorna o companyId do usuário autenticado
 *
 * @throws {AppError} 401 se não autenticado
 * @returns companyId do usuário
 *
 * @example
 * ```ts
 * export async function GET(request: Request) {
 *   const companyId = await getCompanyId()
 *
 *   const customers = await prisma.customer.findMany({
 *     where: { companyId }
 *   })
 * }
 * ```
 */
export async function getCompanyId(): Promise<string> {
  const session = await requireAuth();

  if (!session.user.companyId) {
    console.error("Session missing companyId:", JSON.stringify(session.user, null, 2));
    throw unauthorizedError(
      "Sessão inválida: companyId não encontrado. Por favor, faça logout e login novamente."
    );
  }

  return session.user.companyId;
}

/**
 * Retorna o branchId do usuário autenticado
 *
 * @throws {AppError} 401 se não autenticado
 * @returns branchId do usuário
 */
export async function getBranchId(): Promise<string> {
  const session = await requireAuth();

  if (!session.user.branchId) {
    console.error("Session missing branchId:", JSON.stringify(session.user, null, 2));
    throw unauthorizedError(
      "Sessão inválida: branchId não encontrado. Por favor, faça logout e login novamente."
    );
  }

  return session.user.branchId;
}

/**
 * Retorna o userId do usuário autenticado
 *
 * @throws {AppError} 401 se não autenticado
 * @returns userId do usuário
 */
export async function getUserId(): Promise<string> {
  const session = await requireAuth();

  if (!session.user.id) {
    console.error("Session missing id:", JSON.stringify(session.user, null, 2));
    throw unauthorizedError(
      "Sessão inválida: userId não encontrado. Por favor, faça logout e login novamente."
    );
  }

  return session.user.id;
}

/**
 * Retorna a session completa do usuário (se autenticado)
 * ou null (se não autenticado)
 *
 * Diferente de requireAuth(), não lança erro
 *
 * @example
 * ```ts
 * export async function GET(request: Request) {
 *   const session = await getUserSession()
 *
 *   if (session) {
 *     // Usuário logado
 *   } else {
 *     // Usuário não logado
 *   }
 * }
 * ```
 */
export async function getUserSession(): Promise<Session | null> {
  return await auth();
}

/**
 * Verifica se o usuário tem a permissão especificada
 * Não lança erro, retorna boolean
 *
 * @param allowedRoles Array de roles permitidas
 * @returns true se usuário tem permissão, false caso contrário
 *
 * @example
 * ```ts
 * const canDelete = await checkPermission(['ADMIN', 'GERENTE'])
 * if (canDelete) {
 *   // Mostrar botão de deletar
 * }
 * ```
 */
export async function checkPermission(allowedRoles: UserRole[]): Promise<boolean> {
  const session = await getUserSession();

  if (!session || !session.user) {
    return false;
  }

  return allowedRoles.includes(session.user.role);
}

/**
 * Helper para verificar se usuário é ADMIN
 */
export async function isAdmin(): Promise<boolean> {
  return checkPermission(["ADMIN"]);
}

/**
 * Helper para verificar se usuário é ADMIN ou GERENTE
 */
export async function isAdminOrManager(): Promise<boolean> {
  return checkPermission(["ADMIN", "GERENTE"]);
}

/**
 * Requer que o usuário tenha uma permissão específica (do sistema de permissões)
 * Wrapper para compatibilidade - redireciona para auth-permissions.ts
 */
export { requirePermission } from "./auth-permissions";
