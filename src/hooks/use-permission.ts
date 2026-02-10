"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";

interface UsePermissionResult {
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  permissions: string[];
  isLoading: boolean;
  role: string | null;
  refetch: () => void;
}

export function usePermission(): UsePermissionResult {
  const { data: session, status } = useSession();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (status === "loading") {
      setIsLoading(true);
      return;
    }

    if (!session?.user?.id) {
      console.log("🔐 [usePermission] Sem sessão, limpando permissões");
      setPermissions([]);
      setIsLoading(false);
      return;
    }

    // ADMIN sempre tem todas as permissões
    if (session.user.role === "ADMIN") {
      console.log("🔐 [usePermission] ADMIN - todas as permissões");
      setPermissions(["*"]); // Símbolo especial para "todas"
      setIsLoading(false);
      return;
    }

    try {
      console.log(`🔐 [usePermission] Buscando permissões para: ${session.user.email}`);

      const response = await fetch(`/api/users/${session.user.id}/permissions`, {
        cache: 'no-store' // Sempre buscar dados frescos
      });

      if (!response.ok) {
        console.error("🔐 [usePermission] Erro na API:", response.status);
        setPermissions([]);
        setIsLoading(false);
        return;
      }

      const data = await response.json();

      // Extrair códigos das permissões efetivas
      const permCodes = data.effectivePermissions || [];

      console.log("🔐 [usePermission] Role:", data.role);
      console.log("🔐 [usePermission] Permissões efetivas:", permCodes.length);
      console.log("🔐 [usePermission] Lista:", permCodes);

      setPermissions(permCodes);
    } catch (error) {
      console.error("🔐 [usePermission] Erro ao buscar permissões:", error);
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id, session?.user?.email, session?.user?.role, status]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = useCallback((permission: string): boolean => {
    // ADMIN tem tudo
    if (session?.user?.role === "ADMIN") {
      console.log(`🔐 [hasPermission] "${permission}" → TRUE (ADMIN)`);
      return true;
    }

    const has = permissions.includes(permission);
    console.log(`🔐 [hasPermission] "${permission}" → ${has}`);
    return has;
  }, [permissions, session?.user?.role]);

  const hasAnyPermission = useCallback((perms: string[]): boolean => {
    if (session?.user?.role === "ADMIN") return true;
    return perms.some(p => permissions.includes(p));
  }, [permissions, session?.user?.role]);

  const hasAllPermissions = useCallback((perms: string[]): boolean => {
    if (session?.user?.role === "ADMIN") return true;
    return perms.every(p => permissions.includes(p));
  }, [permissions, session?.user?.role]);

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    permissions,
    isLoading,
    role: session?.user?.role || null,
    refetch: fetchPermissions,
  };
}
