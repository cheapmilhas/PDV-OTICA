"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

/**
 * Hook para verificar permissões do usuário logado
 *
 * @example
 * ```tsx
 * const { hasPermission, isLoading } = usePermissions();
 *
 * if (hasPermission('sales.create')) {
 *   // Mostrar botão criar venda
 * }
 * ```
 */
export function usePermissions() {
  const { data: session, status } = useSession();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPermissions() {
      if (status === "authenticated" && session?.user?.id) {
        try {
          const res = await fetch(`/api/users/${session.user.id}/permissions`);
          if (res.ok) {
            const data = await res.json();
            setPermissions(data.effectivePermissions || []);
          }
        } catch (error) {
          console.error("Erro ao carregar permissões:", error);
        } finally {
          setLoading(false);
        }
      } else if (status === "unauthenticated") {
        setLoading(false);
      }
    }

    loadPermissions();
  }, [session?.user?.id, status]);

  /**
   * Verifica se usuário tem uma permissão específica
   */
  const hasPermission = (permission: string): boolean => {
    // ADMIN tem todas as permissões
    if (session?.user?.role === "ADMIN") {
      return true;
    }

    return permissions.includes(permission);
  };

  /**
   * Verifica se usuário tem TODAS as permissões listadas
   */
  const hasAllPermissions = (permissionList: string[]): boolean => {
    // ADMIN tem todas as permissões
    if (session?.user?.role === "ADMIN") {
      return true;
    }

    return permissionList.every((p) => permissions.includes(p));
  };

  /**
   * Verifica se usuário tem ALGUMA das permissões listadas
   */
  const hasAnyPermission = (permissionList: string[]): boolean => {
    // ADMIN tem todas as permissões
    if (session?.user?.role === "ADMIN") {
      return true;
    }

    return permissionList.some((p) => permissions.includes(p));
  };

  return {
    permissions,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    isLoading: loading,
    isAdmin: session?.user?.role === "ADMIN",
  };
}
