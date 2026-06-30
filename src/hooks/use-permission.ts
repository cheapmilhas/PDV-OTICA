"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";

/**
 * Teto de tempo (ms) que a UI bloqueia esperando a sessão/permissões. Se passar
 * disso (ex.: cold start serverless muito lenta, ou um estado preso em
 * `loading`), o hook PARA de bloquear e libera a renderização — uma rota
 * protegida nunca deve ficar em "Verificando permissões…" para sempre. A
 * verificação real de acesso continua valendo (ADMIN/permissões); o cap só
 * impede o spinner eterno.
 */
export const PERMISSION_LOADING_CAP_MS = 4000;

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
  // Cap de segurança: vira true quando o tempo-limite estoura, destravando a UI
  // mesmo se a sessão ficar presa em `loading` (cold start lenta etc.).
  const [loadingCapped, setLoadingCapped] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";
  const rawLoading =
    status === "loading" || (status === "authenticated" && !isAdmin && fetchingCustom);
  const isLoading = rawLoading && !loadingCapped;

  // Arma o teto enquanto estiver realmente carregando; reseta quando resolve.
  useEffect(() => {
    if (!rawLoading) {
      setLoadingCapped(false);
      return;
    }
    const t = setTimeout(() => setLoadingCapped(true), PERMISSION_LOADING_CAP_MS);
    return () => clearTimeout(t);
  }, [rawLoading]);

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
