"use client";

import { useSession } from "next-auth/react";
import { UserRole } from "@prisma/client";
import type { ReactNode } from "react";

interface CanProps {
  /**
   * Roles permitidas para visualizar o conteúdo
   * Se não especificado, apenas verifica se usuário está autenticado
   */
  roles?: UserRole[];

  /**
   * Conteúdo a ser renderizado se usuário tiver permissão
   */
  children: ReactNode;

  /**
   * Conteúdo alternativo a ser renderizado se usuário NÃO tiver permissão
   */
  fallback?: ReactNode;

  /**
   * Renderizar mesmo se não autenticado (default: false)
   */
  allowUnauthenticated?: boolean;
}

/**
 * Componente para controle de acesso baseado em roles (RBAC)
 *
 * @example
 * ```tsx
 * // Mostrar botão apenas para ADMIN e GERENTE
 * <Can roles={['ADMIN', 'GERENTE']}>
 *   <Button onClick={handleDelete}>Deletar</Button>
 * </Can>
 *
 * // Com fallback
 * <Can roles={['ADMIN']} fallback={<p>Sem permissão</p>}>
 *   <AdminPanel />
 * </Can>
 *
 * // Apenas verificar se está autenticado
 * <Can>
 *   <UserMenu />
 * </Can>
 * ```
 */
export function Can({
  roles,
  children,
  fallback = null,
  allowUnauthenticated = false,
}: CanProps) {
  const { data: session, status } = useSession();

  // Loading state
  if (status === "loading") {
    return null;
  }

  // Não autenticado
  if (!session?.user && !allowUnauthenticated) {
    return <>{fallback}</>;
  }

  // Se não especificou roles, apenas verifica autenticação
  if (!roles) {
    return session?.user ? <>{children}</> : <>{fallback}</>;
  }

  // Verifica se usuário tem uma das roles permitidas
  const userRole = session?.user?.role;
  const hasPermission = userRole && roles.includes(userRole);

  if (hasPermission) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * Hook para verificar permissões
 *
 * @example
 * ```tsx
 * const { can, isAdmin, isAdminOrManager } = usePermissions()
 *
 * if (can(['ADMIN', 'GERENTE'])) {
 *   // Usuário tem permissão
 * }
 *
 * if (isAdmin) {
 *   // Usuário é ADMIN
 * }
 * ```
 */
export function usePermissions() {
  const { data: session } = useSession();
  const userRole = session?.user?.role;

  const can = (roles: UserRole[]): boolean => {
    return userRole ? roles.includes(userRole) : false;
  };

  const isAdmin = userRole === "ADMIN";
  const isAdminOrManager = can(["ADMIN", "GERENTE"]);

  return {
    can,
    isAdmin,
    isAdminOrManager,
    userRole,
  };
}
