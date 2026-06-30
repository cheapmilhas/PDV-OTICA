"use client";

import { useCallback } from "react";
import {
  useSharedPermissions,
  PERMISSION_LOADING_CAP_MS,
} from "@/components/providers/permissions-provider";

// Reexportado p/ compat — o cap agora vive no provider/núcleo compartilhado.
export { PERMISSION_LOADING_CAP_MS };

interface UsePermissionResult {
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  permissions: string[];
  isLoading: boolean;
  role: string | null;
  refetch: () => void;
}

/**
 * Hook de permissão (singular). Agora é um SHIM fino sobre o estado
 * compartilhado (`useSharedPermissions`) — antes cada chamada fazia seu próprio
 * `useSession()` + fetch; agora todos leem 1 fetch só do provider.
 *
 * Contrato de `isLoading` PRESERVADO exatamente como era: NÃO bloqueia ADMIN nem
 * sessão não-autenticada (resolvem sincronamente da sessão); só "carrega"
 * enquanto a sessão resolve OU um não-ADMIN busca os overrides — e nunca além do
 * cap de tempo (anti-spinner-eterno).
 */
export function usePermission(): UsePermissionResult {
  const { permissions, role, isAdmin, status, fetchingCustom, loadingCapped, refetch } =
    useSharedPermissions();

  const rawLoading =
    status === "loading" || (status === "authenticated" && !isAdmin && fetchingCustom);
  const isLoading = rawLoading && !loadingCapped;

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (isAdmin) return true;
      return permissions.includes(permission);
    },
    [permissions, isAdmin],
  );

  const hasAnyPermission = useCallback(
    (perms: string[]): boolean => {
      if (isAdmin) return true;
      return perms.some((p) => permissions.includes(p));
    },
    [permissions, isAdmin],
  );

  const hasAllPermissions = useCallback(
    (perms: string[]): boolean => {
      if (isAdmin) return true;
      return perms.every((p) => permissions.includes(p));
    },
    [permissions, isAdmin],
  );

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    permissions,
    isLoading,
    role,
    refetch,
  };
}
