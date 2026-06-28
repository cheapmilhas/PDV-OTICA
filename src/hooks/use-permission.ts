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
  // Perf: estado de carregamento de PERMISSÕES CUSTOM (busca no banco). NÃO
  // bloqueia ADMIN nem sessão não-autenticada — essas resolvem sincronamente
  // a partir da própria sessão, sem esperar fetch. Só fica "carregando" quando
  // a sessão ainda está resolvendo OU quando um não-ADMIN precisa buscar o
  // array de overrides. Isso elimina o "Verificando permissões" do ADMIN.
  const [fetchingCustom, setFetchingCustom] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";
  const isLoading =
    status === "loading" || (status === "authenticated" && !isAdmin && fetchingCustom);

  const fetchPermissions = useCallback(async () => {
    if (status === "loading") return;
    if (!session?.user?.id) {
      setPermissions([]);
      return;
    }
    // ADMIN tem tudo — sem rede.
    if (session.user.role === "ADMIN") {
      setPermissions(["*"]);
      return;
    }

    setFetchingCustom(true);
    try {
      const response = await fetch(`/api/users/${session.user.id}/permissions`, {
        cache: "no-store", // permissões custom sempre frescas (revogação dinâmica)
      });
      if (!response.ok) {
        setPermissions([]);
        return;
      }
      const data = await response.json();
      setPermissions(data.effectivePermissions || []);
    } catch {
      setPermissions([]);
    } finally {
      setFetchingCustom(false);
    }
  }, [session?.user?.id, session?.user?.role, status]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (session?.user?.role === "ADMIN") return true;
      return permissions.includes(permission);
    },
    [permissions, session?.user?.role]
  );

  const hasAnyPermission = useCallback(
    (perms: string[]): boolean => {
      if (session?.user?.role === "ADMIN") return true;
      return perms.some((p) => permissions.includes(p));
    },
    [permissions, session?.user?.role]
  );

  const hasAllPermissions = useCallback(
    (perms: string[]): boolean => {
      if (session?.user?.role === "ADMIN") return true;
      return perms.every((p) => permissions.includes(p));
    },
    [permissions, session?.user?.role]
  );

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
